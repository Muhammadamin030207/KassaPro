from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from catalog.models import Product
from customers.models import Customer, DebtTransaction
from customers.utils import normalize_phone
from sales.models import Sale, SaleItem


class SaleItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    qty = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))


class SaleItemSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="product.id", read_only=True)
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

    def validate(self, attrs):
        # Nasiya uchun telefon talab qilinadi
        if attrs.get("payment_method") == Sale.PaymentMethod.NASIYA:
            phone = normalize_phone(attrs.get("phone", ""))
            if not phone or len(phone) != 13:
                raise serializers.ValidationError(
                    {"phone": "Nasiya uchun mijozning telefon raqami talab qilinadi."}
                )
            attrs["phone"] = phone
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

            if product.stock_qty is not None and qty > product.stock_qty:
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
                    },
                }
            )

            # Zahirani kamaytiramiz
            product.stock_qty -= qty
            product.save(update_fields=["stock_qty"])

        sale = Sale.objects.create(
            shop=shop,
            cashier=user,
            total=total,
            payment_method=validated_data["payment_method"],
        )

        # Nasiya: mijozni top yoki yarat, qarz DEBT yozuvini avtomatik qo'sh
        if sale.payment_method == Sale.PaymentMethod.NASIYA:
            phone = validated_data.get("phone", "")
            customer, _ = Customer.objects.get_or_create(
                shop=shop, phone=phone, defaults={"name": phone}
            )
            sale.customer = customer
            sale.save(update_fields=["customer"])
            DebtTransaction.objects.create(
                customer=customer,
                type=DebtTransaction.Type.DEBT,
                amount=sale.total,
                sale=sale,
                note="Nasiya sotuvi",
                created_by=user,
            )

        for si in sale_items:
            SaleItem.objects.create(
                sale=sale,
                product=si["product"],
                qty=si["qty"],
                subtotal=si["subtotal"],
                **si["snapshot"],
            )

        # Serializerda nested ko'rsatish uchun
        return sale


class SaleSerializer(serializers.ModelSerializer):
    cashier_name = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source="customer.name", read_only=True, default="")
    customer_phone = serializers.CharField(source="customer.phone", read_only=True, default="")
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
            "total",
            "payment_method",
            "payment_method_display",
            "created_at",
            "items_count",
        ]
        read_only_fields = fields

    def get_cashier_name(self, obj):
        return obj.cashier.username if obj.cashier else ""

    def get_items_count(self, obj):
        return obj.items.count()


class SaleDetailSerializer(SaleSerializer):
    items = SaleItemSerializer(many=True, read_only=True)

    class Meta(SaleSerializer.Meta):
        fields = SaleSerializer.Meta.fields + ["items"]