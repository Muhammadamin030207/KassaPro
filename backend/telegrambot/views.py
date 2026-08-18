import logging
import os

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from shops.models import StoreApplication
from telegrambot.models import BotLog, BotSession
from telegrambot.telegram_api import send_message

logger = logging.getLogger(__name__)

# Suhbat bosqichlari tartibi
STEPS = ["store_name", "owner_name", "phone", "address"]

STEP_PROMPTS = {
    "store_name": "Do'kon nomini yozing, masalan: <b>Asosiy Savdo</b>",
    "owner_name": "Egasi ism-familiyasini yozing, masalan: <b>Aliyev Alisher</b>",
    "phone": "Telefon raqamingizni yozing, masalan: <b>+998 90 123 45 67</b>",
    "address": "Do'kon manzilini yozing, masalan: <b>Toshkent, Chilonzor 8</b>",
}


class TelegramWebhookView(APIView):
    """Telegram update'larini qabul qiladigan webhook.

    Webhook URL: https://<HOST>/api/bot/webhook/
    Telegram `secret_token` orqali faqat o'zimizning bot ga'ni qabul qilamiz
    (TELEGRAM_WEBHOOK_SECRET env). Agar secret o'rnatilmagan bo'lsa — AllowAll
    emas, faqat bot token bilan bog'liq xavfsizlik uchun status o'tkazamiz.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        # Sekret token tekshiruvi (ixtiyoriy lekin tavsiya etilgan)
        secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
        if secret:
            header = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if header != secret:
                return Response(status=status.HTTP_403_FORBIDDEN)

        update = request.data
        message = (update or {}).get("message") or {}
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
            BotLog.objects.create(
                chat_id=chat_id, text=text[:1000], error=str(exc)[:2000]
            )
            send_message(chat_id, "⚠️ Ichki xatolik yuz berdi. /start ni bosing.")

        return Response(status=status.HTTP_200_OK)

    def handle_message(self, chat_id, text, username, from_user):
        if not text:
            send_message(chat_id, "Matn kiriting.")
            return

        if text == "/start":
            session, _ = BotSession.objects.get_or_create(
                chat_id=chat_id,
                defaults={
                    "step": "",
                    "telegram_username": username,
                    "store_name": "",
                    "owner_name": "",
                    "phone": "",
                    "address": "",
                },
            )
            session.step = ""
            session.telegram_username = username
            session.save()
            existing = StoreApplication.objects.filter(
                telegram_chat_id=chat_id
            ).order_by("-id").first()
            if existing and existing.status == StoreApplication.Status.PENDING:
                send_message(
                    chat_id,
                    "Sizning arizangiz <b>kutilmoqda</b>. "
                    "Admin tasdiqlagach login/parol shu chatga keladi.",
                )
                return
            send_message(
                chat_id,
                "Assalomu alaykum, " + (username and f"@{username} " or "") + "! 👋\n\n"
                "KassaPro'ga yangi do'kon uchun ariza qoldirasiz.\n\n"
                + STEP_PROMPTS["store_name"],
            )
            session.step = "store_name"
            session.save(update_fields=["step"])
            return

        session = BotSession.objects.filter(chat_id=chat_id).first()
        if not session or not session.step:
            send_message(
                chat_id,
                "Boshlash uchun /start bosing.",
            )
            return

        step = session.step
        field_max = {
            "store_name": 150,
            "owner_name": 255,
            "phone": 20,
            "address": 255,
        }
        setattr(session, step, text[: field_max.get(step, 255)])
        if step == "phone":
            session.phone = self._normalize_phone(text) or session.phone

        next_index = STEPS.index(step) + 1
        if next_index < len(STEPS):
            next_step = STEPS[next_index]
            session.step = next_step
            session.save()
            send_message(chat_id, STEP_PROMPTS[next_step])
            return

        # Barcha ma'lumot — arizani saqlaymiz
        session.step = ""
        session.save()
        app = StoreApplication.objects.create(
            store_name=session.store_name,
            owner_name=session.owner_name,
            phone=session.phone,
            address=session.address,
            telegram_chat_id=chat_id,
            telegram_username=session.telegram_username or username,
            status=StoreApplication.Status.PENDING,
        )
        send_message(
            chat_id,
            "✅ Arizangiz qabul qilindi!\n\n"
            f"Do'kon: <b>{app.store_name}</b>\n"
            f"Egas: <b>{app.owner_name}</b>\n"
            f"Tel: <b>{app.phone}</b>\n"
            f"Manzil: <b>{app.address}</b>\n\n"
            "Admin arizani tasdiqlashi bilan login va parol shu chatga yuboriladi.",
        )
        # Admin chatga xabar (agar o'rnatilgan bo'lsa)
        admin_chat = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
        if admin_chat and admin_chat.isdigit():
            send_message(
                admin_chat,
                f"🆕 <b>Yangi ariza</b> #{app.id}\n"
                f"Do'kon: <b>{app.store_name}</b>\n"
                f"Egas: <b>{app.owner_name}</b>\n"
                f"Tel: <b>{app.phone}</b>\n"
                f"Manzil: <b>{app.address}</b>\n\n"
                "Tasdiqlash uchun Admin panelga qarang.",
            )

    @staticmethod
    def _normalize_phone(raw):
        from customers.utils import normalize_phone

        return normalize_phone(raw)