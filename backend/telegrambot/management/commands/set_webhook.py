from django.core.management.base import BaseCommand

from telegrambot.telegram_api import set_webhook


class Command(BaseCommand):
    help = "Telegram bot webhook'ini o'rnatadi. URL va secret .env'dan olinadi."

    def add_arguments(self, parser):
        parser.add_argument(
            "--url",
            default="",
            help="Webhook URL (agar berilmasa RENDER_EXTERNAL_URL yoki WEBHOOK_URL env)",
        )

    def handle(self, *args, **options):
        import os

        url = options["url"] or os.environ.get("WEBHOOK_URL") or os.environ.get(
            "RENDER_EXTERNAL_URL"
        )
        if not url:
            self.stderr.write(
                "Webhook URL topilmadi. --url bilan yoki WEBHOOK_URL/RENDER_EXTERNAL_URL env orqali bering."
            )
            return
        if not url.endswith("/"):
            url += "/"
        webhook_url = f"{url}api/bot/webhook/"
        secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
        result = set_webhook(webhook_url, secret)
        self.stdout.write(f"Webhook natijasi: {result}")
        self.stdout.write(f"URL: {webhook_url}")
        if not (result or {}).get("ok"):
            self.stderr.write("Webhook o'rnatilmadi — javobni tekshiring.")