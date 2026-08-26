from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from catalog.models import Product
from sales.models import Expense
from customers.models import AuditLog, Customer, Debt
from customers.utils import normalize_phone
from sales.models import Sale, SaleItem


class SaleItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    qty = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))


class SaleItemSerializer(serializers.ModelSerializer):
    # Mahsulot stock'u 0 ga tushib avtomatik o'chirilganda product_id null bo'ladi —
    # tarix snapshot (product_name_snapshot, barcode_snapshot) orqali saqlanadi.
    product_id = serializers.IntegerField(
        source="product.id", read_only=True, allow_null=True, required=False
    )
    product_name = serializers.CharField(source="product_name_snapshot", read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            "id",
            "product_id",
            "product_name",
            "barcode_snapshot",
            "price_snapshot",
            "qty",
            "subtotal",
        ]


class SaleCreateSerializer(serializers.Serializer):
    """Yangi sotuv yaratish.

    Muhim: narx faqat bazadan olinadi, frontend yuborgan narxga ishonilmaydi.
    Tranzaksiya (transaction.atomic()) ichida bajariladi.
    """

    payment_method = serializers.ChoiceField(choices=Sale.PaymentMethod.choices)
    items = SaleItemInputSerializer(many=True)
    phone = serializers.CharField(required=False, allow_blank=True, write_only=True)
    customer_name = serializers.CharField(
        required=False, allow_blank=True, max_length=255, write_only=True
    )
    due_date = serializers.DateField(required=False, write_only=True)
    force_credit = serializers.BooleanField(
        required=False, default=False, write_only=True
    )

    def validate(self, attrs):
        # Nasiya uchun mijoz telefoni talab qilinadi
        if attrs.get("payment_method") == Sale.PaymentMethod.NASIYA:
            phone = normalize_phone(attrs.get("phone", ""))
            if not phone or len(phone) != 13:
                raise serializers.ValidationError(
                    {"phone": "Nasiya uchun mijozning telefon raqami talab qilinadi."}
                )
            attrs["phone"] = phone
        # Kredit limitini chetlab o'tish faqat egasi/admin uchun
        if attrs.get("force_credit"):
            request = self.context.get("request")
            user = request.user if request else None
            is_owner_like = bool(
                user
                and (user.role_is_owner or user.is_admin)
            )
            if not is_owner_like:
                raise serializers.ValidationError(
                    {"credit": "Kredit limitini oshirish faqat egasi/admin huquqi."}
                )
        return attrs

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Chek bo'sh bo'lishi mumkin emas.")
        # Bir xil mahsulot bir necha marta yuborilsa — birlashtiramiz
        merged = {}
        for item in value:
            pid = item["product_id"]
            merged[pid] = merged.get(pid, 0) + item["qty"]
        return [{"product_id": pid, "qty": qty} for pid, qty in merged.items()]

    @transaction.atomic
    def create(self, validated_data):
        user = self.context["request"].user
        shop = user.shop

        items = validated_data["items"]
        product_ids = [i["product_id"] for i in items]

        # Narxlarni bazadan olamiz va saqlash uchun qulflaymiz
        products = {
            p.id: p
            for p in Product.objects.select_for_update().filter(
                id__in=product_ids, shop=shop, is_active=True
            )
        }

        errors = {}
        for item in items:
            pid = item["product_id"]
            if pid not in products:
                errors.setdefault("items", []).append(
                    f"{pid} id li mahsulot topilmadi yoki o'chiq."
                )
                continue

        if errors:
            raise serializers.ValidationError(errors)

        total = 0
        sale_items = []
        for item in items:
            product = products[item["product_id"]]
            qty = item["qty"]

            # Zahirani tekshiramiz
            if qty > product.stock_qty:
                raise serializers.ValidationError(
                    f"'{product.name}' mahsulotidan yetarli zahira yo'q "
                    f"(zahirada: {product.stock_qty})."
                )

            subtotal = product.price * qty
            total += subtotal
            sale_items.append(
                {
                    "product": product,
                    "qty": qty,
                    "subtotal": subtotal,
                    "snapshot": {
                        "product_name_snapshot": product.name,
                        "barcode_snapshot": product.barcode,
                        "price_snapshot": product.price,
                        "cost_price_snapshot": product.cost_price,
                    },
                }
            )

            # Zahirani kamaytiramiz (stock_qty har doim non-null, default=0)
            product.stock_qty -= qty
            product.save(update_fields=["stock_qty"])

        sale = Sale.objects.create(
            shop=shop,
            cashier=user,
            total=total,
            payment_method=validated_data["payment_method"],
        )

        # Nasiya: mijozni top yoki yarat; kredit limitni tekshirib qarz yozadi
        if sale.payment_method == Sale.PaymentMethod.NASIYA:
            phone = validated_data.get("phone", "")
            customer, _ = Customer.objects.get_or_create(
                shop=shop,
                phone=phone,
                defaults={
                    "name": validated_data.get("customer_name", "")
                    or phone
                },
            )
            # Kredit limiti tekshiruvi nisbati uchun mijoz satrini qulflaymiz —
            # ikki parallel nasiya savdosi ham limitdan oshib keta olmaydi.
            customer = Customer.objects.select_for_update().get(pk=customer.pk)
            sale.customer = customer
            sale.save(update_fields=["customer"])

            # Kredit limiti tekshiruvi (overridable)
            new_balance = customer.balance + sale.total
            allow_force = validated_data.get("force_credit", False)
            if (
                customer.has_credit_limit
                and new_balance > customer.credit_limit
                and not allow_force
            ):
                raise serializers.ValidationError(
                    {
                        "credit": (
                            "Bu mijozning kredit limiti yetarli emas. "
                            f"Limit: {customer.credit_limit} so'm, kutilayotgan jami qarz: "
                            f"{new_balance} so'm. Egasi/admin `force_credit` bilan tasdiqlashi mumkin."
                        )
                    }
                )

            due_date = validated_data.get("due_date") or (
                timezone.localdate() + timedelta(days=7)
            )
            debt = Debt.objects.create(
                customer=customer,
                shop=shop,
                sale=sale,
                original_amount=sale.total,
                remaining_amount=sale.total,
                due_date=due_date,
                note="Nasiya sotuvi",
                created_by=user,
            )
            AuditLog.objects.create(
                shop=shop,
                actor=user,
                action=AuditLog.Action.DEBT_CREATED,
                entity="Debt",
                entity_id=debt.pk,
                detail={
                    "sale": sale.pk,
                    "amount": str(sale.total),
                    "due_date": str(due_date),
                },
            )

        for si in sale_items:
            SaleItem.objects.create(
                sale=sale,
                product=si["product"],
                qty=si["qty"],
                subtotal=si["subtotal"],
                **si["snapshot"],
            )

        # Zahirasi 0 ga tushgan mahsulotlarni avtomatik o'chirish.
        # SaleItem.product SET_NULL + snapshotlar tufayli savdo tarixi saqlanadi.
        exhausted = [p.id for p in products.values() if p.stock_qty <= 0]
        if exhausted:
            Product.objects.filter(id__in=exhausted).delete()

        # Serializerda nested ko'rsatish uchun
        return sale


class SaleSerializer(serializers.ModelSerializer):
    cashier_name = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source="customer.name", read_only=True, default="")
    customer_phone = serializers.CharField(source="customer.phone", read_only=True, default="")
    debt_due_date = serializers.SerializerMethodField()
    payment_method_display = serializers.CharField(
        source="get_payment_method_display", read_only=True
    )
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "id",
            "shop",
            "cashier",
            "cashier_name",
            "customer",
            "customer_name",
            "customer_phone",
            "debt_due_date",
            "total",
            "payment_method",
            "payment_method_display",
            "created_at",
            "items_count",
        ]
        read_only_fields = fields

    def get_cashier_name(self, obj):
        return obj.cashier.username if obj.cashier else ""

    def get_debt_due_date(self, obj):
        # To'langan qarzda muddat ko'rsatilmaydi — faqat ochiq/qarz qolgan holatda.
        debt = obj.debts.exclude(
            status__in=[Debt.Status.CANCELLED, Debt.Status.PAID]
        ).first()
        return str(debt.due_date) if debt else None

    def get_items_count(self, obj):
        return obj.items.count()


class SaleDetailSerializer(SaleSerializer):
    items = SaleItemSerializer(many=True, read_only=True)

    class Meta(SaleSerializer.Meta):
        fields = SaleSerializer.Meta.fields + ["items"]

class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

    class Meta:
        model = Expense
        fields = [
            "id", "title", "supplier", "qty", "total_amount",
            "note", "created_by_name", "created_at",
        ]
        read_only_fields = fields


class ExpenseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ["title", "supplier", "qty", "total_amount", "note"]

    def create(self, validated_data):
        validated_data["shop"] = self.context["request"].user.shop
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
