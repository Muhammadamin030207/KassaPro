"""SmartKassa demo ma'lumotlari bilan seed qilish.

Ishlatish:
    python manage.py seed_demo --owner admin --password admin123 --shop "My Shop"
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from catalog.models import Category, Product
from customers.models import AuditLog, Customer, Debt
from shops.models import Shop

User = get_user_model()

PRODUCTS = [
    ("4607173152172", "Sut 'Nestle' 1L", "12000"),
    ("4607173152189", "Non (oq) 600g", "4500"),
    ("4607173152196", "Makarona 400g", "8000"),
    ("4607173152202", "Shakar 1kg", "11000"),
    ("4607173152219", "Choy baraka 100g", "15000"),
    ("4607173152226", "Olma 1kg", "9000"),
    ("4607173152233", "Tuxum 10dona", "18000"),
    ("4607173152240", "Pishloq 200g", "24000"),
    ("4607173152257", "Cola 0.5L", "7000"),
    ("4607173152264", "Pepsi 0.5L", "7000"),
    ("4607173152271", "Kartoshka 1kg", "6000"),
    ("4607173152288", "Sho'rva to'plami", "25000"),
]

CUSTOMERS = [
    ("Asatova Nilufar", "+998 94 003 55 71", "500000", "200000", 5, "active"),
    ("Karimov Jahongir", "+998 90 123 45 67", "300000", "150000", 12, "partially_paid"),
    ("Rahimova Malika", "+998 91 777 88 99", "800000", "650000", -2, "overdue"),
    ("Toshmatov Aziz", "+998 99 456 78 90", "200000", "0", 9, "active"),
    ("Yusupov Bekzod", "+998 93 222 33 44", "0", "75000", -6, "overdue"),
]


class Command(BaseCommand):
    help = "Demo do'kon, owner va mahsulotlar yaratadi."

    def add_arguments(self, parser):
        parser.add_argument("--owner", default="admin")
        parser.add_argument("--password", default="admin123")
        parser.add_argument("--shop", default="My Shop")

    def handle(self, *args, **options):
        username = options["owner"]
        password = options["password"]
        shop_name = options["shop"]

        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(f"'{username}' allaqachon mavjud."))
            user = User.objects.get(username=username)
        else:
            user = User.objects.create_user(
                username=username, password=password, role=User.Role.OWNER
            )
            self.stdout.write(self.style.SUCCESS(f"Owner '{username}' yaratildi."))

        if Shop.objects.filter(owner=user).exists():
            shop = Shop.objects.filter(owner=user).first()
        else:
            shop = Shop.objects.create(name=shop_name, owner=user)
            self.stdout.write(self.style.SUCCESS(f"Do'kon '{shop_name}' yaratildi."))

        user.shop = shop
        user.save(update_fields=["shop"])

        grocery = Category.objects.get_or_create(shop=shop, name="Oziq-ovqat")[0]

        count = 0
        for barcode, name, price in PRODUCTS:
            _, created = Product.objects.get_or_create(
                shop=shop,
                barcode=barcode,
                defaults={
                    "name": name,
                    "price": Decimal(price),
                    "cost_price": Decimal(price) * Decimal("0.7"),
                    "category": grocery,
                    "stock_qty": Decimal(random.randint(20, 150)),
                },
            )
            if created:
                count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Tayyor! {count} ta mahsulot qo'shildi. Login: {username} / {password}"
            )
        )

        # Demo mijozlar va qarzlari
        if User.objects.filter(username="cashier").exists():
            cashier = User.objects.get(username="cashier")
        else:
            cashier = User.objects.create_user(
                username="cashier", password="cashier123", role=User.Role.CASHIER
            )
        cashier.shop = shop
        cashier.save(update_fields=["shop"])

        debt_count = 0
        for name, phone, limit, amount, due_days, status in CUSTOMERS:
            phone_clean = "".join(c for c in phone if c.isdigit())
            cust, created = Customer.objects.get_or_create(
                shop=shop,
                phone=f"+{phone_clean}",
                defaults={
                    "name": name,
                    "credit_limit": Decimal(limit),
                    "created_by": user,
                },
            )
            if not created:
                continue
            if Decimal(amount) <= 0:
                continue
            debt = Debt.objects.create(
                shop=shop,
                customer=cust,
                original_amount=Decimal(amount),
                remaining_amount=Decimal(amount),
                due_date=timezone.localdate() + timedelta(days=due_days),
                status=Debt.Status.ACTIVE
                if status != "overdue"
                else Debt.Status.PARTIALLY_PAID,
                note="Demo qarz",
                created_by=user,
            )
            AuditLog.objects.create(
                shop=shop,
                actor=user,
                action=AuditLog.Action.DEBT_CREATED,
                entity="Debt",
                entity_id=debt.pk,
                detail={"amount": str(debt.original_amount), "demo": True},
            )
            debt_count += 1

        self.stdout.write(self.style.SUCCESS(f"{debt_count} ta demo qarz qo'shildi."))
        self.stdout.write(
            self.style.SUCCESS(
                f"Kassir: cashier / cashier123 · Mijozlar Qarzdorlar sahifasida ko'rinadi."
            )
        )