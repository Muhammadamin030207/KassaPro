import logging
import os

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from shops.models import StoreApplication
from telegrambot.models import BotLog, BotSession, CustomerApplication
from telegrambot.telegram_api import (
    answer_callback_query,
    contact_button_keyboard,
    contact_info,
    format_application_message,
    format_customer_application_message,
    inline_keyboard,
    send_admin_notification,
    send_message,
)

logger = logging.getLogger(__name__)

SITE_URL = os.environ.get("CONTACT_WEBSITE", "") or "https://smartkassa-1.onrender.com"

# Umumiy ariza bosqichlari
APP_STEPS = ["name", "phone", "message", "note", "confirm"]

APP_PROMPTS = {
    "name": "👤 <b>Ismingizni</b> yozing, masalan: <b>Aliyev Alisher</b>",
    "phone": "📞 <b>Telefon raqamingizni</b> yozing, masalan: <b>+998 90 123 45 67</b>",
    "message": "📝 <b>Murojaatingiz/xizmat</b>ni yozing — nima kerak?",
    "note": "💬 <b>Qo'shimcha izoh</b> yuvoling (bo'lmasa «Yo'q» deb yozing yoki bekor qiling)",
}

# Do'kon arizasi bosqichlari (eski, saqlanadi)
STEPS = ["store_name", "owner_name", "phone", "address"]

STEP_PROMPTS = {
    "store_name": "🏬 Do'kon nomini yozing, masalan: <b>Asosiy Savdo</b>",
    "owner_name": "👤 Egasi ism-familiyasini yozing, masalan: <b>Aliyev Alisher</b>",
    "phone": "📞 Telefon raqamingizni yozing, masalan: <b>+998 90 123 45 67</b>",
    "address": "📍 Do'kon manzilini yozing, masalan: <b>Toshkent, Chilonzor 8</b>",
}


class TelegramWebhookView(APIView):
    """Telegram update'larini qabul qiladi (webhook architecture).

    Commands: /start, /application, /status, /help, /contact — hammasi real.
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
            # Callback ishlovchisi ham xatoliklardan himoyalanadi — Telegram
            # 500 qaytganda webhook'ni qayta yuboradi (va duplikat amal bo'lishi mumkin).
            try:
                return self.handle_callback(callback)
            except Exception as exc:  # noqa: BLE001
                logger.exception("bot handle_callback failed")
                callback_chat = (callback.get("message") or {}).get("chat") or {}
                BotLog.objects.create(
                    chat_id=callback_chat.get("id"),
                    text=str(callback.get("data") or "callback")[:1000],
                    error=str(exc)[:2000],
                )
                answer_callback_query(callback.get("id"))
                return Response(status=status.HTTP_200_OK)
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        text = (message.get("text") or "").strip()
        contact = message.get("contact") or {}

        if not chat_id:
            return Response(status=status.HTTP_200_OK)

        # Contact yoki text — kamida bittasi bo'lishi kerak. Telegram native
        # "Telefon raqamni yuborish" tugmasi bosilganda `contact` jonatiladi.
        if "text" not in message and not contact:
            return Response(status=status.HTTP_200_OK)

        username = ((chat.get("username") or "")[:255])

        try:
            self.handle_message(
                chat_id=chat_id,
                text=text,
                username=username,
                from_user=message.get("from") or {},
                contact=contact or None,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("bot handle_message failed")
            BotLog.objects.create(
                chat_id=chat_id, text=text[:1000], error=str(exc)[:2000]
            )
            send_message(chat_id, "⚠️ Ichki xatolik yuz berdi. /start ni bosing.")

        return Response(status=status.HTTP_200_OK)

    # ---------------------------------------------------------------- keyboards

    def _main_keyboard(self):
        """Asosiy menyu (inline)."""
        return inline_keyboard(
            [
                [
                    {"text": "🏬 Do'kon ochish (ariza)", "callback_data": "store_start"},
                    {"text": "📋 Arizam holati", "callback_data": "store_status"},
                ],
                [
                    {"text": "🖥 Sayt", "url": f"{SITE_URL}/login"},
                    {
                        "text": "⚡️ Ilova (Mini App)",
                        "web_app": {"url": f"{SITE_URL}/mini-app"},
                    }
                ],
                [
                    {"text": "📞 Bog'lanish", "callback_data": "contact"},
                    {"text": "📖 Yordam", "callback_data": "help"},
                ],
            ]
        )

    def _flow_keyboard(self, stage):
        """Bosqich davomida: Orqaga + Bekor qilish."""
        return inline_keyboard(
            [
                [
                    {"text": "⬅️ Orqaga", "callback_data": "app_back"},
                    {"text": "❌ Bekor qilish", "callback_data": "app_cancel"},
                ]
            ]
        )

    def _confirm_keyboard(self):
        return inline_keyboard(
            [
                [
                    {"text": "✅ Tasdiqlash", "callback_data": "app_confirm"},
                    {"text": "✏️ Tahrirlash", "callback_data": "app_edit"},
                ],
                [{"text": "❌ Bekor qilish", "callback_data": "app_cancel"}],
            ]
        )

    def _edit_keyboard(self):
        return inline_keyboard(
            [
                [{"text": "👤 Ism", "callback_data": "app_edit_field:name"}],
                [{"text": "📞 Telefon", "callback_data": "app_edit_field:phone"}],
                [{"text": "📝 Murojaat", "callback_data": "app_edit_field:message"}],
                [{"text": "💬 Izoh", "callback_data": "app_edit_field:note"}],
                [
                    {"text": "⬅️ Orqaga", "callback_data": "app_summary"},
                ],
            ]
        )

    def _app_list_keyboard(self, apps):
        rows = [[{"text": a.application_number, "callback_data": f"app_detail:{a.id}"}] for a in apps]
        return inline_keyboard(rows)

    @staticmethod
    def _session(chat_id, username=""):
        session, _ = BotSession.objects.get_or_create(
            chat_id=chat_id, defaults={"telegram_username": username}
        )
        if username:
            session.telegram_username = username
        return session

    def _reset_app_flow(self, session):
        session.app_stage = ""
        session.app_name = ""
        session.app_phone = ""
        session.app_message = ""
        session.app_note = ""
        # Do'kon arizasi flow'ini ham to'liq tozalaymiz — "Bekor qilish"
        # tugmasi bosilgach keyingi ixtiyoriy matn ariza bosqichi deb
        # qabul qilinmasligi uchun (eski `step` qolib ketmasligi).
        session.step = ""
        session.store_name = ""
        session.owner_name = ""
        session.phone = ""
        session.address = ""
        session.save()

    # ---------------------------------------------------------------- commands

    def start_handler(self, chat_id, username):
        send_message(
            chat_id,
            "🚀 Assalomu alaykum"
            + (f", @{username}" if username else "")
            + "!\n\n<b>KassaPro</b> botiga xush kelibsiz.\n\n"
            "Do'koningizni ro'yxatdan o'tkazish uchun "
            "<b>🏬 Do'kon ochish</b> tugmasini bosing.\n\n"
            "Arizangiz holatini <b>📋 Arizam holati</b> bilan kuzatib borasiz.",
            reply_markup=self._main_keyboard(),
        )

    def application_start_handler(self, chat_id, session):
        self._reset_app_flow(session)
        session.app_stage = "name"
        session.save()
        send_message(
            chat_id,
            "📝 <b>Yangi ariza</b>\n\n"
            "\"Iltimos, quyidagi ma'lumotlarni yuboring.\"\n\n"
            + APP_PROMPTS["name"],
            reply_markup=self._flow_keyboard("name"),
        )

    def status_handler(self, chat_id):
        apps = list(CustomerApplication.objects.filter(telegram_user_id=chat_id)[:15])
        if not apps:
            send_message(
                chat_id,
                "📋 Sizda hozircha yuborilgan ariza mavjud emas.\n\n"
                "Yangi ariza qoldirish uchun pastdagi tugmani bosing.",
                reply_markup=inline_keyboard(
                    [[{"text": "📝 Ariza yuborish", "callback_data": "app_new"}]]
                ),
            )
            return
        if len(apps) == 1:
            self._application_detail(chat_id, apps[0])
            return
        send_message(
            chat_id,
            "📋 <b>Arizalaringiz:</b>\nSizda bir nechta ariza bor. "
            "Bittasini tanlang:",
            reply_markup=self._app_list_keyboard(apps),
        )

    def _status_emoji(self, app):
        return app.STATUS_EMOJI.get(app.status) or "🟡"

    def _application_detail(self, chat_id, app):
        send_message(
            chat_id,
            "📋 <b>Ariza holati</b>\n"
            f"🆔 {app.application_number}\n"
            f"📅 Yuborilgan: {app.created_at:%d.%m.%Y}\n"
            f"👤 Ism: <b>{app.full_name}</b>\n"
            f"📞 Telefon: {app.phone}\n"
            f"📌 Holat: {self._status_emoji(app)} {app.get_status_display()}",
        )

    def help_handler(self, chat_id):
        send_message(
            chat_id,
            "📖 <b>KassaPro Bot yordam</b>\n\n"
            "📝 <b>/application</b> — Ariza yuborish\n"
            "📋 <b>/status</b> — Ariza holatini tekshirish\n"
            "📞 <b>/contact</b> — Bog'lanish\n\n"
            "Yangi ariza yuborish uchun tugmani bosing:",
            reply_markup=inline_keyboard(
                [
                    [
                        {"text": "📝 Ariza yuborish", "callback_data": "app_new"},
                        {"text": "📋 Arizamni tekshirish", "callback_data": "app_status"},
                    ],
                    [{"text": "📞 Bog'lanish", "callback_data": "contact"}],
                ]
            ),
        )

    def contact_handler(self, chat_id):
        """Bog'lanish: admin username + tayyor prompt + to'g'ridan-to'g'ri yozish."""
        info = contact_info()
        admin_username = (info.get("telegram") or "").lstrip("@") or "admin"
        prompt = (
            "Assalomu alaykum! KassaPro bo'yicha murojaatim bor:\n"
            "👤 Ism: \n"
            "📞 Telefon: \n"
            "🏬 Do'kon nomi: \n"
            "❓ Savol / muammo: \n"
        )
        lines = [
            "📞 <b>KassaPro bilan bog'lanish</b>\n",
            f"👤 Admin Telegram: <b>@{admin_username}</b>\n",
            "\n📋 <b>1-USUL — tayyor xabarni nusxalang va adminga yuboring</b> "
            "(sayt va bot haqidagi barcha savollaringiz uchun):\n",
            f"<code>{prompt}</code>",
            f"\n➡️ Yuborish uchun: <a href='https://t.me/{admin_username}'>@{admin_username} ni ochish</a>",
            "\n✍️ <b>2-USUL — hoziroq shu botda yozing:</b>\n"
            "Xabaringiz admin panelga tushadi va tezroq ko'rib chiqiladi 👇",
        ]
        buttons = [
            [{"text": "✍️ Xabar yozish (admin panelga)", "callback_data": "app_new"}]
        ]
        buttons.append(
            [{"text": f"✈️ @{admin_username} ni ochish", "url": f"https://t.me/{admin_username}"}]
        )
        buttons.append([{"text": "🖥 Websayt", "url": info["website"]}])
        send_message(chat_id, "\n".join(lines), reply_markup=inline_keyboard(buttons))

    def contact_prompt_handler(self, chat_id):
        """Foydalanuvchiga adminga yuborish uchun tayyor (nusxalanadigan) matn."""
        info = contact_info()
        telegram = (info["telegram"] or "").lstrip("@") or "admin"
        prompt = (
            "Assalomu alaykum! Men KassaPro tizimi bilan tanishmoqchiman.\n"
            "Do'konim uchun zamonaviy kassa (POS) tizimi kerak.\n\n"
            "Ism familiya: \n"
            "Telefon: \n"
            "Do'kon nomi: \n"
            "Qo'shimcha izoh: "
        )
        send_message(
            chat_id,
            "📋 <b>Quyidagi matnni nusxalab, adminga yuboring:</b>\n"
            f"💬 Admin: <b>@{telegram}</b>\n\n"
            f"<code>{prompt}</code>\n\n"
            "➡️ Bo'sh joylarni to'ldirib, @"
            + telegram
            + " ga yuboring.\n"
            "Yoki rasmiy ariza sifatida botda qoldirish uchun pastdagi tugmani bosing — "
            "arizangiz admin panelga tushadi va tezroq ko'rib chiqiladi.",
            reply_markup=inline_keyboard(
                [[{"text": "📝 Rasmiy ariza qoldirish", "callback_data": "app_new"}]]
            ),
        )

    def _usage_guide(self, chat_id):
        """Ariza yuborgan foydalanuvchiga avtomatik to'liq qo'llanma."""
        info = contact_info()
        site = info.get("website") or "https://smartkassa-1.onrender.com"
        guide = (
            "📚 <b>KASSAPRO — TO'LIQ QO'LLANMA</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n\n"
            "🌐 <b>1. SAYTGA KIRISH</b>\n"
            f"Manzil: {site}\n"
            "Login va parolingiz tasdiqlanganidan so'ng SHU chatga yuboriladi.\n"
            "Saytda «Kirish» tugmasi → login/parol kiriting.\n\n"
            "🛒 <b>2. KASSA (sotuv)</b>\n"
            "• Shtrix-kod maydoniga skanerlang YOKI kamera 📷 tugmasi bilan skanerlang.\n"
            "• Mahsulot bazada bo'lsa — avtomatik chekka tushadi (qayta skan = +1).\n"
            "• Bazada yo'q bo'lsa — panel ochiladi: nomi va narxini yozing, "
            "«Chekka qo'shish» — mahsulot saqlanadi va darhol chekka tushadi.\n"
            "• Chek tayyor: to'lov turini tanlang (Naqd/Karta/Nasiya) → "
            "«To'lovni tasdiqlash» → chek chop etiladi, kassa keyingi mijozga tayyor.\n\n"
            "📦 <b>3. MAHSULOTLAR</b>\n"
            "• Yuqoridagi kod maydoniga skanerlang — kod avtomatik yoziladi.\n"
            "• Nomi, sotish narxi va TANNARXni kiriting (tannarx — foyda hisobi uchun!).\n"
            "• Bir xil kod ikki marta qabul qilinmaydi (ogohlantirish chiqadi).\n"
            "• Zahira 0 ga tushgan mahsulot ro'yxatdan avtomatik o'chadi.\n\n"
            "💰 <b>4. QARZDORLIK (Nasiya)</b>\n"
            "• Kassada «Nasiya» tanlansa — mijoz telefon raqami bilan topiladi/yaratiladi.\n"
            "• «Qarzdorlik» bo'limida qisman/to'liq to'lov qabul qilinadi, tarix saqlanadi.\n"
            "• Muddati o'tgan qarzlar qizil belgilanadi.\n\n"
            "📊 <b>5. HISOBOTLAR</b>\n"
            "• Savdo (aylanma) va FOYDA alohida ko'rsatiladi:\n"
            "  Foyda = (sotish narxi − tannarx) × miqdor.\n"
            "• Kunlik statistika, top mahsulotlar, kassirlar kesimida ham ko'rinadi.\n\n"
            "📱 <b>6. TELEGRAM MINI APP</b>\n"
            f"Bot menyusidagi «⚡️ Ilova» tugmasi orqali saytni Telegram ICHIDA ochasiz.\n"
            "Ariza holatingizni ham shu yerda kuzatasiz.\n\n"
            "🤖 <b>7. BOT BUYRUQLARI</b>\n"
            "/start — bosh menyu\n"
            "/application — yangi ariza\n"
            "/status — ariza holati\n"
            "/help — yordam\n"
            "/contact — biz bilan bog'lanish\n\n"
            "❓ Savollar bo'lsa istalgan vaqt /contact orqali yozing. "
            "Sizga doim yordam beramiz! 🚀"
        )
        send_message(chat_id, guide)

    def store_start_handler(self, chat_id, session):
        # Duplicate himoya: chatda allaqachon ko'rib chiqilmayotgan (PENDING)
        # yoki tasdiqlangan (APPROVED) ariza bo'lsa — yangi ariza ochilmaydi.
        existing = (
            StoreApplication.objects.filter(telegram_chat_id=chat_id)
            .order_by("-id")
            .first()
        )
        if existing and existing.status == StoreApplication.Status.PENDING:
            send_message(
                chat_id,
                "⏳ Arizangiz hozir <b>ADMIN KO'Rib CHIQILMOQDA</b>.\n\n"
                f"🏬 Do'kon: {existing.store_name}\n"
                "— admin tasdiqlagach login/parol shu chatga yuboriladi.",
                reply_markup=inline_keyboard(
                    [[{"text": "📋 Arizam holati", "callback_data": "store_status"}]]
                ),
            )
            return
        if existing and existing.status == StoreApplication.Status.APPROVED:
            send_message(
                chat_id,
                "✅ Do'koningiz allaqachon <b>TASDIQLANGAN</b>.\n\n"
                f"🏬 Do'kon: {existing.store_name}\n"
                "Loginda parol oldingi xabarda yuborilgan. "
                "Muammo bo'lsa admin bilan bog'laning.",
                reply_markup=self._main_keyboard(),
            )
            return

        session.step = "store_name"
        session.save()
        send_message(
            chat_id,
            "🏬 KassaPro'ga yangi do'kon ro'yxatdan o'tkazish.\n\n"
            + STEP_PROMPTS["store_name"],
            reply_markup=self._flow_keyboard("store"),
        )

    def store_status_handler(self, chat_id):
        existing = StoreApplication.objects.filter(telegram_chat_id=chat_id).order_by("-id").first()
        if not existing:
            send_message(
                chat_id,
                "Siz hali do'kon arizasi qoldirmagansiz.\n\n"
                "Yangi ariza uchun «🏬 Do'kon arizasi» tugmasini bosing.",
                reply_markup=self._main_keyboard(),
            )
            return
        state = {
            StoreApplication.Status.PENDING: "⏳ Kutilmoqda",
            StoreApplication.Status.APPROVED: "✅ Tasdiqlangan",
            StoreApplication.Status.REJECTED: "❌ Rad etilgan",
        }.get(existing.status, "❓")
        send_message(
            chat_id,
            "🏬 <b>Do'kon arizasi holati:</b>\n"
            f"🏬 Do'kon: {existing.store_name}\n"
            f"📌 Holat: {state}"
            + (f"\n💬 Izoh: {existing.note}" if existing.note else ""),
        )

    # ---------------------------------------------------------------- callbacks

    def handle_callback(self, callback):
        query_id = callback.get("id")
        data = (callback.get("data") or "").strip()
        msg = callback.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        from_user = callback.get("from") or {}
        username = ((from_user.get("username") or "")[:255])

        if not chat_id:
            return Response(status=status.HTTP_200_OK)
        answer_callback_query(query_id)

        session = self._session(chat_id, username)

        if data == "app_new":
            self.application_start_handler(chat_id, session)
        elif data == "app_status":
            self.status_handler(chat_id)
        elif data == "help":
            self.help_handler(chat_id)
        elif data == "contact":
            self.contact_handler(chat_id)
        elif data == "contact_prompt":
            self.contact_prompt_handler(chat_id)
        elif data == "store_start":
            self.store_start_handler(chat_id, session)
        elif data == "store_status":
            self.store_status_handler(chat_id)
        elif data == "app_back":
            self._callback_back(chat_id, session)
        elif data == "app_cancel":
            self._callback_cancel(chat_id, session)
        elif data == "app_confirm":
            self._callback_confirm(chat_id, session)
        elif data == "app_summary":
            if session.app_stage == "confirm":
                send_message(chat_id, self._summary_text(session), reply_markup=self._confirm_keyboard())
            else:
                send_message(chat_id, "Boshlash uchun /start bosing.")
        elif data == "app_edit":
            send_message(
                chat_id,
                "✏️ Qaysi maydonni tahrirlamoqchisiz?",
                reply_markup=self._edit_keyboard(),
            )
        elif data.startswith("app_edit_field:"):
            self._callback_edit_field(chat_id, session, data.split(":", 1)[1])
        elif data.startswith("app_detail:"):
            app = CustomerApplication.objects.filter(pk=data.split(":", 1)[1]).first()
            if app and app.telegram_user_id == chat_id:
                self._application_detail(chat_id, app)
            else:
                send_message(chat_id, "Ariza topilmadi.")
        else:
            send_message(chat_id, "Boshlash uchun /start bosing.")

        return Response(status=status.HTTP_200_OK)

    def _callback_edit_field(self, chat_id, session, field):
        if field not in ("name", "phone", "message", "note"):
            send_message(chat_id, "Noto'g'ri maydon.")
            return
        session.app_stage = field
        session.save()
        send_message(
            chat_id,
            f"✏️ Yangi {APP_PROMPTS[field]}",
            reply_markup=self._flow_keyboard(field),
        )

    def _callback_back(self, chat_id, session):
        # Do'kon arizasi flow uchun ham orqaga qaytish
        if session.step in STEPS:
            idx = STEPS.index(session.step)
            if idx <= 0:
                session.step = ""
                session.save()
                send_message(chat_id, "Do'kon arizasi bekor qilindi. 🏬", reply_markup=self._main_keyboard())
                return
            prev = STEPS[idx - 1]
            session.step = prev
            session.save()
            send_message(chat_id, STEP_PROMPTS[prev], reply_markup=self._flow_keyboard("store"))
            return
        idx = APP_STEPS.index(session.app_stage) if session.app_stage in APP_STEPS else 0
        if idx <= 0:
            send_message(
                chat_id,
                "Ariza yuborish bekor qilindi. Boshlash uchun /start.",
                reply_markup=self._main_keyboard(),
            )
            self._reset_app_flow(session)
            return
        prev = APP_STEPS[idx - 1]
        session.app_stage = prev
        session.save()
        text = self._summary_text(session) if prev == "confirm" else APP_PROMPTS[prev]
        send_message(
            chat_id,
            text,
            reply_markup=self._confirm_keyboard() if prev == "confirm" else self._flow_keyboard(prev),
        )

    def _callback_cancel(self, chat_id, session):
        self._reset_app_flow(session)
        send_message(
            chat_id,
            "Ariza yuborish bekor qilindi. ❌",
            reply_markup=self._main_keyboard(),
        )

    def _summary_text(self, session):
        return (
            "📋 <b>ARIZA XULOSASI</b>\n\n"
            f"👤 Ism:\n<b>{session.app_name}</b>\n\n"
            f"📞 Telefon:\n<b>{session.app_phone}</b>\n\n"
            f"📝 Murojaat:\n{session.app_message}\n\n"
            f"💬 Izoh:\n{session.app_note or '—'}\n\n"
            "Hammasi to'g'rimi?"
        )

    def _callback_confirm(self, chat_id, session):
        # Duplicate himoya: bir xil CONFIRM ikki marta bosilsa 2-a ariza yaratilmaydi
        if session.app_stage != "confirm":
            if session.app_name:
                send_message(chat_id, "✅ Arizangiz allaqachon yuborilgan.")
            else:
                send_message(chat_id, "Boshlash uchun /start bosing.")
            return
        app = CustomerApplication.objects.create(
            telegram_user_id=chat_id,
            telegram_username=session.telegram_username or "",
            full_name=session.app_name,
            phone=session.app_phone,
            message=session.app_message,
            note=session.app_note,
            status=CustomerApplication.Status.NEW,
        )
        success_sent = send_message(chat_id, self._success_text(app))
        self._reset_app_flow(session)
        if success_sent:
            send_message(chat_id, "👇 Holatni istagan vaqt kuzatishingiz mumkin.", reply_markup=self._main_keyboard())
        else:
            BotLog.objects.create(
                chat_id=chat_id,
                text="Ariza tasdiqlandi",
                error="Userga success xabari yuborilmadi.",
            )
        # Avtomatik to'liq qo'llanma — sayt + kassa + bot + Mini App ishlatishi.
        try:
            self._usage_guide(chat_id)
        except Exception:  # noqa: BLE001 — qo'llanma yuborilishi arizani to'smaydi
            BotLog.objects.create(
                chat_id=chat_id,
                text="Usage guide yuborilmadi",
                error="Qo'llanma xabari yuborilmadi (ariza saqlandi).",
            )
        if not send_admin_notification(format_customer_application_message(app)):
            BotLog.objects.create(
                chat_id=chat_id,
                text="Yangi ariza (bot)",
                error=(
                    "Telegram admin xabarnomasi yuborilmadi — "
                    "TELEGRAM_ADMIN_CHAT_ID yoki TELEGRAM_BOT_TOKEN tekshiring."
                ),
            )

    def _success_text(self, app):
        return (
            f"✅ Arizangiz muvaffaqiyatli yuborildi!\n\n"
            f"🆔 Ariza raqami:\n#{app.application_number}\n\n"
            "Tez orada siz bilan bog'lanamiz."
        )

    # ---------------------------------------------------------------- messages

    def handle_message(self, chat_id, text, username, from_user, contact=None):
        # Telegram native "Telefon raqamni yuborish" tugmasi bosilganda
        # `contact` keladi (text bo'lmaydi) — telefon bosqichida uni qabul qilamiz.
        contact_phone = ((contact or {}).get("phone_number") or "").strip()
        if contact_phone:
            text = contact_phone

        if not text:
            send_message(chat_id, "Matn kiriting.")
            return

        session = self._session(chat_id, username)

        if text == "/start":
            self.start_handler(chat_id, username)
            return
        if text == "/application":
            self.application_start_handler(chat_id, session)
            return
        if text == "/status":
            self.status_handler(chat_id)
            return
        if text == "/help":
            self.help_handler(chat_id)
            return
        if text == "/contact":
            self.contact_handler(chat_id)
            return

        # Umumiy ariza flow (app_stage) ustuvor
        if session.app_stage in APP_STEPS:
            self._collect_app_input(chat_id, session, text)
            return

        # Do'kon arizasi flow
        if session.step in STEPS:
            self._collect_store_input(chat_id, session, text)
            return

        send_message(
            chat_id,
            "Boshlash uchun /start bosing.\n"
            "Yoki quyidagi tugmalardan birini tanlang:",
            reply_markup=self._main_keyboard(),
        )

    def _collect_app_input(self, chat_id, session, text):
        stage = session.app_stage
        if stage == "name":
            value = text.strip()
            if len(value) < 2 or len(value) > 150:
                send_message(
                    chat_id,
                    "❌ Ism 2–150 belgidan iborat bo'lishi kerak. Qayta yozing:",
                    reply_markup=self._flow_keyboard(stage),
                )
                return
            session.app_name = value
        elif stage == "phone":
            phone = self._normalize_phone(text)
            if not phone or len(phone) != 13:
                send_message(
                    chat_id,
                    "❌ Telefon raqam noto'g'ri. Misol: <b>+998 90 123 45 67</b>. Qayta yozing:",
                    reply_markup=self._flow_keyboard(stage),
                )
                return
            session.app_phone = phone
        elif stage == "message":
            value = text.strip()
            if len(value) < 2 or len(value) > 2000:
                send_message(
                    chat_id,
                    "❌ Murojaat 2–2000 belgidan iborat bo'lishi kerak. Qayta yozing:",
                    reply_markup=self._flow_keyboard(stage),
                )
                return
            session.app_message = value
        elif stage == "note":
            value = text.strip()[:2000]
            session.app_note = "" if value.lower() in ("yo'q", "yoq", "no", "-") else value
        else:
            self._callback_confirm(chat_id, session)
            return

        next_index = APP_STEPS.index(stage) + 1
        if next_index < len(APP_STEPS) - 1:
            next_stage = APP_STEPS[next_index]
            session.app_stage = next_stage
            session.save()
            markup = (
                contact_button_keyboard()
                if next_stage == "phone"
                else self._flow_keyboard(next_stage)
            )
            send_message(chat_id, APP_PROMPTS[next_stage], reply_markup=markup)
        elif next_index == len(APP_STEPS) - 1:
            # confirm
            session.app_stage = "confirm"
            session.save()
            send_message(chat_id, self._summary_text(session), reply_markup=self._confirm_keyboard())

    def _collect_store_input(self, chat_id, session, text):
        step = session.step
        field_max = {"store_name": 150, "owner_name": 255, "phone": 20, "address": 255}
        if step == "phone":
            session.phone = self._normalize_phone(text) or text.strip()
        else:
            setattr(session, step, text[: field_max.get(step, 255)])
        next_index = STEPS.index(step) + 1
        if next_index < len(STEPS):
            next_step = STEPS[next_index]
            session.step = next_step
            session.save()
            markup = (
                contact_button_keyboard()
                if next_step == "phone"
                else self._flow_keyboard("store")
            )
            send_message(chat_id, STEP_PROMPTS[next_step], reply_markup=markup)
            return
        session.step = ""
        session.save()
        app = StoreApplication.objects.create(
            store_name=session.store_name,
            owner_name=session.owner_name,
            phone=session.phone,
            address=session.address,
            telegram_chat_id=chat_id,
            telegram_username=session.telegram_username or "",
            status=StoreApplication.Status.PENDING,
            source=StoreApplication.Source.BOT,
        )
        send_message(
            chat_id,
            "✅ Do'kon arizangiz qabul qilindi!\n\n"
            f"🏬 Do'kon: <b>{app.store_name}</b>\n"
            f"👤 Egas: <b>{app.owner_name}</b>\n"
            f"📞 Tel: <b>{app.phone}</b>\n\n"
            "Admin tasdiqlagach login/parol shu chatga yuboriladi.",
            reply_markup=inline_keyboard(
                [[{"text": "📋 Arizam holati", "callback_data": "store_status"}]]
            ),
        )
        # Avtomatik to'liq qo'llanma — sayt + kassa + bot + Mini App ishlatishi.
        try:
            self._usage_guide(chat_id)
        except Exception:  # noqa: BLE001 — qo'llanma yuborilishi arizani to'smaydi
            BotLog.objects.create(
                chat_id=chat_id,
                text="Usage guide yuborilmadi (store)",
                error="Qo'llanma xabari yuborilmadi (ariza saqlandi).",
            )
        if not send_admin_notification(format_application_message(app)):
            BotLog.objects.create(
                chat_id=chat_id,
                text="Yangi do'kon arizasi (bot)",
                error="Telegram admin xabarnomasi yuborilmadi — env tekshiring.",
            )

    @staticmethod
    def _normalize_phone(raw):
        from customers.utils import normalize_phone

        return normalize_phone(raw)