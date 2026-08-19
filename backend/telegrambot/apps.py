import logging
import os

from django.apps import AppConfig

from telegrambot.telegram_api import set_webhook

logger = logging.getLogger(__name__)


class TelegrambotConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "telegrambot"
    verbose_name = "Telegram Bot"

    def ready(self):
        # Django autoreloader'da asosiy jarayon (RUN_MAIN=true) ishga tushmaydi.
        # Gunicorn workerlarida webhook'ni avto-o'rnatamiz — har deploy'da
        # webhook URL joriy domen bilan sinxron bo'ladi (idempotent).
        if os.environ.get("RUN_MAIN", "") == "true":
            return
        url = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
        if not url:
            url = os.environ.get("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
        if not url or not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
            return
        try:
            set_webhook(
                f"{url}/api/bot/webhook/",
                os.environ.get("TELEGRAM_WEBHOOK_SECRET", ""),
            )
        except Exception:  # noqa: BLE001
            logger.exception("Telegram webhook avto-o'rnatish muvaffaqiyatsiz")