from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Device


class Command(BaseCommand):
    help = (
        "Barcha Device (qurilma) yozuvlarini o'chiradi — faqat qurilmalar. "
        "Foydalanuvchilar, do'konlar, mahsulotlar, savdolar, qarzlar va "
        "boshqa biznes ma'lumotlar O'ZGARMAYDI."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Tasdiqlashni so'ramasdan to'g'ridan-to'g'ri o'chirish.",
        )

    def handle(self, *args, **options):
        count = Device.objects.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS("Hech qanday qurilma yo'q."))
            return

        if not options["yes"]:
            confirm = input(
                f"{count} ta qurilma yozuvi o'chiriladi. Davom etasizmi? [y/N]: "
            )
            if confirm.strip().lower() != "y":
                self.stdout.write("Bekor qilindi.")
                return

        with transaction.atomic():
            Device.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"clear_device_data: {count} ta qurilma yozuvi o'chirildi "
                "(users/shops/products/sales yangicha qoldi)."
            )
        )