import logging
import os
from datetime import timedelta

from django.utils import timezone
from rest_framework import generics, response, status, views
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from telegrambot.models import BotLog, BotSession, SupportApplication
from telegrambot.serializers import (
    SupportApplicationPatchSerializer,
    SupportApplicationSerializer,
)
from telegrambot.telegram_api import (
    answer_callback_query,
    contact_info,
    format_support_application_message,
    inline_keyboard,
    remove_reply_markup,
    send_admin_notification,
    send_message,
)

logger = logging.getLogger(__name__)

# Umumiy murojaat (support) formasi bosqichlari: ism -> telefon -> murojaat -> izoh
SUPPORT_STEPS = ["full_name", "phone", "message", "note"]
CONFIRM_STEP = "confirm"

SUPPORT_PROMPTS = {
    "full_name": "1/4 👤 <b>Ism-familiyangizni kiriting.</b>\n\nAriza ushbu nom bilan ro'yxatga olinadi.",
    "phone": "2/4 📞 <b>Telefon raqamingizni kiriting.</b>\n\nMasalan: <code>+998 90 123 45 67</code>",
    "message": "3/4 📝 <b>Murojaatingizni yozing.</b>\n\nQaysi xizmat kerak yoki savolingiz nima?",
    "note": "4/4 💬 <b>Qo'shimcha izoh</b> (ixtiyoriy).\n\nIzoh bo'lmasa «⏭ O'tkazib yuborish» tugmasini bosing.",
}

FIELD_LIMITS = {"full_name": 150, "message": 1000, "note": 500}

WELCOME_TEXT = (
    "🚀 Assalomu alaykum!\n\n"
    "KassaPro botiga xush kelibsiz.\n\n"
    "🛒 Kassa\n"
    "📦 Mahsulotlar\n"
    "📊 Hisobotlar\n"
    "💰 Qarzdorlik\n"
    "🤖 Arizalar\n\n"
    "bilan bog'liq xizmatlardan foydalanishingiz mumkin.\n\n"
    "Quyidagilardan birini tanlang:"
)

HELP_TEXT = (
    "📖 <b>KassaPro Bot yordam</b>\n\n"
    "📝 <b>/application</b> — Ariza yuborish\n"
    "📋 <b>/status</b> — Ariza holatini tekshirish\n"
    "📞 <b>/contact</b> — Bog'lanish\n"
    "🚀 <b>/start</b> — Bosh menyu\n\n"
    "Pastdagi tugmalardan ham foydalanishingiz mumkin:"
)

COMMANDS = {
    "/start": "start_handler",
    "/application": "application_start_handler",
    "/status": "status_handler",
    "/help": "help_handler",
    "/contact": "contact_handler",
}


def _menu_keyboard():
    return inline_keyboard(
        [
            [{"text": "📝 Ariza yuborish", "callback_data": "menu:application"}],
            [{"text": "📋 Arizamni tekshirish", "callback_data": "menu:status"}],
            [
                {"text": "📖 Yordam", "callback_data": "menu:help"},
                {"text": "📞 Bog'lanish", "callback_data": "menu:contact"},
            ],
        ]
    )


def _step_keyboard(step):
    """Bosqich tugmalari: Orqaga / (Izohni o'tkazib yuborish) / Bekor qilish."""
    row = []
    if step != "full_name":
        row.append({"text": "⬅️ Orqaga", "callback_data": "app:back"})
    if step == "note":
        row.append({"text": "⏭ O'tkazib yuborish", "callback_data": "app:skip_note"})
    row.append({"text": "❌ Bekor qilish", "callback_data": "app:cancel"})
    return inline_keyboard([row])


def _summary_keyboard():
    return inline_keyboard(
        [
            [
                {"text": "✅ Tasdiqlash", "callback_data": "app:confirm"},
                {"text": "✏️ Tahrirlash", "callback_data": "app:edit"},
            ],
            [{"text": "❌ Bekor qilish", "callback_data": "app:cancel"}],
        ]
    )


def _summary_text(session):
    return (
        "📋 <b>ARIZA XULOSASI</b>\n\n"
        f"👤 Ism: <b>{session.full_name}</b>\n"
        f"📞 Telefon: <code>{session.phone}</code>\n"
        f"📝 Murojaat: {session.message}\n"
        f"💬 Izoh: {session.note or '—'}\n\n"
        "Tasdiqlash uchun quyidagi tugmalardan foydalaning:"
    )


class TelegramWebhookView(APIView):
    """Telegram update'larini qabul qiladigan webhook (webhook arxitektura saqlanadi).

    Webhook URL: https://<HOST>/api/bot/webhook/
    """

    permission_classes = [AllowAny]

    def post(self, request):
        secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
        if secret:
            header = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if header != secret:
                return Response(status=status.HTTP_403_FORBIDDEN)

        update = request.data
        callback = (update or {}).get("callback_query") or {}
        message = (update or {}).get("message") or {}
        if callback:
            return self.handle_callback(callback)

        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        text = (message.get("text") or "").strip()
        if not chat_id or "text" not in message:
            return Response(status=status.HTTP_200_OK)

        username = ((chat.get("username") or "")[:255])
        try:
            self.handle_message(
                chat_id=chat_id,
                text=text,
                username=username,
                from_user=message.get("from") or {},
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("bot handle_message failed")
            BotLog.objects.create(chat_id=chat_id, text=text[:1000], error=str(exc)[:2000])
            send_message(chat_id, "⚠️ Ichki xatolik yuz berdi. /start ni bosing.")

        return Response(status=status.HTTP_200_OK)

    # ------------------------------------------------------------------ COMMANDS

    def start_handler(self, chat_id, username, **kwargs):
        """🚀 /start — professional welcome + inline menyu."""
        greeting = f"Assalomu alaykum, {username and f'@{username} ' or ''}! 👋\n\n"
        send_message(chat_id, greeting + WELCOME_TEXT, reply_markup=_menu_keyboard())

    def application_start_handler(self, chat_id, username, **kwargs):
        """📝 /application — yangi murojaat flow'ini boshlaydi."""
        self._reset_session(chat_id, username)
        send_message(
            chat_id,
            "📝 <b>Yangi ariza</b>\n\nIltimos, quyidagi ma'lumotlarni yuboring.",
        )
        self._prompt_step(chat_id, "full_name")

    def status_handler(self, chat_id, username, **kwargs):
        """📋 /status — foydalanuvchi arizalari ro'yxati + detail."""
        apps = list(SupportApplication.objects.filter(telegram_user_id=chat_id)[:10])
        if not apps:
            send_message(
                chat_id,
                "📋 Sizda hozircha yuborilgan ariza mavjud emas.\n\n"
                "Yangi ariza yuborish uchun 📝 tugmani bosing yoki /application.",
                reply_markup=_menu_keyboard(),
            )
            return
        if len(apps) == 1:
            send_message(chat_id, self._status_text(apps[0]))
            return
        rows = [[{"text": a.application_number or f"APP-{a.pk:06d}", "callback_data": f"status:app:{a.pk}"}] for a in apps]
        send_message(
            chat_id,
            "📋 <b>Arizalaringiz</b>\n\nBatafsil ko'rish uchun birini tanlang:",
            reply_markup=inline_keyboard(rows),
        )

    def help_handler(self, chat_id, username, **kwargs):
        """📖 /help — qo'llanma."""
        send_message(chat_id, HELP_TEXT, reply_markup=_menu_keyboard())

    def contact_handler(self, chat_id, username, **kwargs):
        """📞 /contact — projekt config'idan bog'lanish ma'lumotlari."""
        text, markup = contact_info()
        send_message(chat_id, text, reply_markup=markup)

    # ------------------------------------------------------------------ CALLBACKS

    def handle_callback(self, callback):
        query_id = callback.get("id")
        data = (callback.get("data") or "").strip()
        msg = callback.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        message_id = msg.get("message_id")
        from_user = callback.get("from") or {}
        username = ((from_user.get("username") or "")[:255])

        if not chat_id:
            return Response(status=status.HTTP_200_OK)
        answer_callback_query(query_id)

        try:
            if data.startswith("menu:"):
                action = data.split(":", 1)[1]
                self._menu_action(chat_id, username, action)
            elif data == "app:confirm":
                self._confirm_application(chat_id, message_id)
            elif data == "app:back":
                self._step_back(chat_id)
            elif data == "app:edit":
                self._reset_to_step(chat_id, "full_name")
            elif data == "app:skip_note":
                self._show_summary(chat_id)
            elif data == "app:cancel":
                self._cancel_form(chat_id)
            elif data.startswith("status:app:"):
                try:
                    pk = int(data.rsplit(":", 1)[1])
                except ValueError:
                    pk = None
                self._show_application(chat_id, pk)
            else:
                send_message(chat_id, "Boshlash uchun /start bosing.", reply_markup=_menu_keyboard())
        except Exception as exc:  # noqa: BLE001
            logger.exception("bot handle_callback failed (%s)", data)
            BotLog.objects.create(chat_id=chat_id, text=data[:1000], error=str(exc)[:2000])
            send_message(chat_id, "⚠️ Ichki xatolik yuz berdi. /start ni bosing.")

        return Response(status=status.HTTP_200_OK)

    def _menu_action(self, chat_id, username, action):
        if action == "application":
            self.application_start_handler(chat_id, username)
        elif action == "status":
            self.status_handler(chat_id, username)
        elif action == "help":
            self.help_handler(chat_id, username)
        elif action == "contact":
            self.contact_handler(chat_id, username)
        else:
            self.start_handler(chat_id, username)

    # ------------------------------------------------------------------ MESSAGE (text)

    def handle_message(self, chat_id, text, username, from_user):
        if not text:
            return
        command = text.split()[0].lower()
        if command in COMMANDS:
            getattr(self, COMMANDS[command])(chat_id=chat_id, username=username, from_user=from_user)
            return
        if command.startswith("/"):
            send_message(
                chat_id,
                "❓ Bunday buyruq yo'q.\n\n" + HELP_TEXT,
                reply_markup=_menu_keyboard(),
            )
            return

        # Active support formasi bo'lsa — bosqichni qabul qilamiz
        session = BotSession.objects.filter(chat_id=chat_id).first()
        if session and session.form_type == "support" and session.step in SUPPORT_STEPS:
            self._collect_step(chat_id, session, text)
            return

        send_message(
            chat_id,
            "🖐 Foydalanish uchun menyudan tanlang yoki komanda yuboring:\n\n"
            "📝 /application\n📋 /status\n📖 /help\n📞 /contact",
            reply_markup=_menu_keyboard(),
        )

    # ------------------------------------------------------------------ FORM LOGIC

    def _reset_session(self, chat_id, username):
        session, _ = BotSession.objects.get_or_create(
            chat_id=chat_id, defaults={"telegram_username": username}
        )
        session.form_type = "support"
        session.step = ""
        session.telegram_username = username
        session.full_name = ""
        session.message = ""
        session.note = ""
        session.save()
        return session

    def _prompt_step(self, chat_id, step):
        send_message(
            chat_id,
            SUPPORT_PROMPTS[step],
            reply_markup=_step_keyboard(step),
        )

    def _collect_step(self, chat_id, session, text):
        step = session.step
        limit = FIELD_LIMITS.get(step, 500)

        if step == "full_name":
            value = text.strip()
            if not value:
                send_message(chat_id, "⚠️ Ism bo'sh bo'lishi mumkin emas. Qayta kiriting:")
                return
            if len(value) > limit:
                send_message(chat_id, f"⚠️ Ism juda uzun (maks {limit} ta belgi). Qayta kiriting:")
                return
            session.full_name = value
        elif step == "phone":
            normalized = self._normalize_phone(text)
            if not normalized:
                send_message(
                    chat_id,
                    "⚠️ Telefon raqami noto'g'ri formatda.\n\n"
                    "Misol: <code>+998 90 123 45 67</code>",
                )
                return
            session.phone = normalized
        elif step == "message":
            value = text.strip()
            if not value:
                send_message(chat_id, "⚠️ Murojaat bo'sh bo'lishi mumkin emas. Qayta kiriting:")
                return
            if len(value) > limit:
                send_message(chat_id, f"⚠️ Murojaat juda uzun (maks {limit} ta belgi). Qayta kiriting:")
                return
            session.message = value
        elif step == "note":
            session.note = text.strip()[: FIELD_LIMITS.get("note", 500)]

        next_index = SUPPORT_STEPS.index(step) + 1
        if next_index < len(SUPPORT_STEPS):
            next_step = SUPPORT_STEPS[next_index]
            session.step = next_step
            session.save()
            self._prompt_step(chat_id, next_step)
        else:
            self._show_summary(chat_id, session)

    def _show_summary(self, chat_id, session=None):
        if session is None:
            session = BotSession.objects.filter(chat_id=chat_id).first()
        if not session or not session.full_name or not session.phone or not session.message:
            send_message(chat_id, "Ma'lumotlar to'liq emas. /application ni yuboring.")
            return
        session.step = CONFIRM_STEP
        session.save()
        send_message(chat_id, _summary_text(session), reply_markup=_summary_keyboard())

    def _step_back(self, chat_id):
        session = BotSession.objects.filter(chat_id=chat_id).first()
        if not session or session.form_type != "support":
            return
        if session.step == CONFIRM_STEP:
            session.step = "note"
            session.save()
            self._prompt_step(chat_id, "note")
            return
        if session.step in SUPPORT_STEPS:
            idx = SUPPORT_STEPS.index(session.step)
            if idx == 0:
                send_message(chat_id, "⚠️ Siz birinchi bosqichdasiz.")
                return
            prev = SUPPORT_STEPS[idx - 1]
            session.step = prev
            session.save()
            self._prompt_step(chat_id, prev)

    def _reset_to_step(self, chat_id, step):
        session = BotSession.objects.filter(chat_id=chat_id).first()
        if session and session.form_type == "support":
            session.step = step
            session.save()
            self._prompt_step(chat_id, step)

    def _confirm_application(self, chat_id, message_id):
        session = BotSession.objects.filter(chat_id=chat_id).first()
        if not session or session.form_type != "support" or session.step != CONFIRM_STEP:
            send_message(chat_id, "Tugallanmagan ariza topilmadi. /application ni yuboring.")
            return
        if not session.full_name or not session.phone or not session.message:
            send_message(chat_id, "Ma'lumotlar to'liq emas. /application ni yuboring.")
            return

        # Duplicate himoya: so'nggi 2 daqiqada shu userdan NEW ariza bo'lsa — yana yaratmaymiz
        dup = SupportApplication.objects.filter(
            telegram_user_id=chat_id,
            status=SupportApplication.Status.NEW,
            created_at__gte=timezone.now() - timedelta(minutes=2),
        ).first()
        if dup:
            remove_reply_markup(chat_id, message_id)
            send_message(
                chat_id,
                f"ℹ️ Arizangiz allaqachon yuborilgan.\n\n"
                f"🆔 {dup.application_number}\n"
                "Holatni /status orqali kuzatishingiz mumkin.",
            )
            return

        app = SupportApplication.objects.create(
            telegram_user_id=chat_id,
            telegram_username=session.telegram_username,
            full_name=session.full_name,
            phone=session.phone,
            message=session.message,
            note=session.note,
        )
        # Tasdiqlash tugmalarini olib tashlaymiz — qayta bosish bo'lmaydi
        remove_reply_markup(chat_id, message_id)
        self._cancel_form(chat_id, silent=True)

        send_message(
            chat_id,
            "✅ <b>Arizangiz muvaffaqiyatli yuborildi!</b>\n\n"
            f"🆔 Ariza raqami:\n<code>{app.application_number}</code>\n\n"
            "Tez orada siz bilan bog'lanamiz.",
        )

        # Admin Telegram chatiga — muvaffaqiyatsiz bo'lsa yashirin o'tib ketmaydi
        if not send_admin_notification(format_support_application_message(app)):
            logger.error("admin support-application notify failed app=%s", app.application_number)
            BotLog.objects.create(
                chat_id=chat_id,
                text="Yangi murojaat (bot)",
                error=(
                    "Telegram admin xabarnomasi yuborilmadi — "
                    "TELEGRAM_ADMIN_CHAT_ID yoki TELEGRAM_BOT_TOKEN tekshiring."
                ),
            )
            send_message(
                chat_id,
                "❌ Arizani yuborishda texnik xatolik yuz berdi. "
                "Iltimos keyinroq qayta urinib ko'ring.",
            )

    def _cancel_form(self, chat_id, silent=False):
        session = BotSession.objects.filter(chat_id=chat_id).first()
        if session:
            session.form_type = ""
            session.step = ""
            session.full_name = ""
            session.message = ""
            session.note = ""
            session.save()
        if not silent:
            send_message(chat_id, "Ariza yuborish bekor qilindi.", reply_markup=_menu_keyboard())

    # ------------------------------------------------------------------ STATUS

    @staticmethod
    def _status_text(app):
        return (
            f"📋 <b>Ariza holati</b>\n\n"
            f"🆔 {app.application_number}\n"
            f"📅 Yuborilgan:\n<code>{app.created_at:%d.%m.%Y}</code>\n"
            f"📌 Holat:\n{app.status_emoji} {app.get_status_display()}"
        )

    def _show_application(self, chat_id, pk):
        app = SupportApplication.objects.filter(pk=pk).first()
        if not app:
            send_message(chat_id, "Ariza topilmadi.")
            return
        send_message(chat_id, self._status_text(app))

    # ------------------------------------------------------------------ UTIL

    @staticmethod
    def _normalize_phone(raw):
        from customers.utils import normalize_phone

        return normalize_phone(raw)


class AdminSupportApplicationListView(generics.ListAPIView):
    """Admin: bot /application orqali kelgan murojaatlar ro'yxati."""

    permission_classes = [IsAdmin]
    serializer_class = SupportApplicationSerializer

    def get_queryset(self):
        qs = SupportApplication.objects.all()
        st = self.request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs


class AdminSupportApplicationDetailView(views.APIView):
    """Admin: murojaat ko'rish (GET), holat o'zgartirish (PATCH), o'chirish (DELETE)."""

    permission_classes = [IsAdmin]

    def _get(self, pk):
        app = SupportApplication.objects.filter(pk=pk).first()
        if not app:
            raise NotFound("Murojaat topilmadi.")
        return app

    def get(self, request, pk):
        return response.Response(SupportApplicationSerializer(self._get(pk)).data)

    def patch(self, request, pk):
        app = self._get(pk)
        serializer = SupportApplicationPatchSerializer(app, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return response.Response(SupportApplicationSerializer(self._get(pk)).data)

    def delete(self, request, pk):
        self._get(pk).delete()
        return response.Response(status=status.HTTP_204_NO_CONTENT)