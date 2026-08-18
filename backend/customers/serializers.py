from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from customers.models import AuditLog, Customer, Debt, DebtPayment
from customers.utils import normalize_phone


class DebtSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    effective_status = serializers.CharField(read_only=True)
    paid_amount = serializers.SerializerMethodField()
    paid_percent = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    sale_total = serializers.SerializerMethodField()

    class Meta:
        model = Debt
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "original_amount",
            "remaining_amount",
            "paid_amount",
            "paid_percent",
            "due_date",
            "status",
            "effective_status",
            "is_overdue",
            "status_display",
            "note",
            "sale_total",
            "created_at",
        ]

    def get_paid_amount(self, obj):
        return str(obj.paid_amount)

    def get_paid_percent(self, obj):
        return obj.paid_percent

    def get_is_overdue(self, obj):
        return obj.effective_status == Debt.Status.OVERDUE

    def get_status_display(self, obj):
        return Debt.Status(obj.effective_status).label

    def get_sale_total(self, obj):
        if obj.sale_id:
            return str(obj.sale.total)
        return None


class DebtPaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(
        source="get_payment_method_display", read_only=True
    )
    received_by_name = serializers.CharField(source="received_by.get_full_name", read_only=True)

    class Meta:
        model = DebtPayment
        fields = [
            "id",
            "amount",
            "payment_method",
            "method_display",
            "note",
            "received_by",
            "received_by_name",
            "created_at",
        ]


class DebtPaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    payment_method = serializers.ChoiceField(
        choices=DebtPayment.Method.choices, default=DebtPayment.Method.CASH
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("To'lov summasi 0 dan katta bo'lishi kerak.")
        return value


class DebtDetailSerializer(DebtSerializer):
    payments = DebtPaymentSerializer(many=True, read_only=True)

    class Meta(DebtSerializer.Meta):
        fields = DebtSerializer.Meta.fields + [
            "payments",
        ]
        extra_kwargs = {"payments": {"read_only": True}}


class DebtCreateSerializer(serializers.ModelSerializer):
    """Yangi qarz yaratish (admin qo'lda qarz yozishi uchun)."""

    customer_id = serializers.IntegerField(write_only=True)
    sale_id = serializers.IntegerField(required=False, write_only=True, allow_null=True)

    class Meta:
        model = Debt
        fields = [
            "id",
            "customer",
            "customer_id",
            "original_amount",
            "remaining_amount",
            "due_date",
            "note",
            "sale_id",
            "sale",
        ]
        read_only_fields = ["customer", "sale"]
        extra_kwargs = {
            "original_amount": {"required": True},
            "remaining_amount": {"required": False},
            "due_date": {"required": True},
        }

    def validate_customer_id(self, value):
        shop = self.context.get("shop") or self.context["request"].user.shop
        if not Customer.objects.filter(shop=shop, pk=value).exists():
            raise serializers.ValidationError("Mijoz topilmadi.")
        return value

    def validate(self, attrs):
        if "original_amount" in attrs and attrs["original_amount"] <= 0:
            raise serializers.ValidationError(
                {"original_amount": "Qarz summasi 0 dan katta bo'lishi kerak."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        shop = self.context.get("shop") or (request.user.shop if request else None)
        user = self.context.get("user") or (request.user if request else None)
        customer = Customer.objects.filter(shop=shop, pk=validated_data.pop("customer_id")).first()
        sale_id = validated_data.pop("sale_id", None)
        original = validated_data["original_amount"]
        remaining = validated_data.pop(
            "remaining_amount", original
        ) or original
        with transaction.atomic():
            debt = Debt.objects.create(
                shop=shop,
                customer=customer,
                sale_id=sale_id,
                original_amount=original,
                remaining_amount=remaining,
                due_date=validated_data.get("due_date"),
                note=validated_data.get("note", ""),
                created_by=user,
            )
            AuditLog.objects.create(
                shop=shop,
                actor=user,
                action=AuditLog.Action.DEBT_CREATED,
                entity="Debt",
                entity_id=debt.pk,
                detail={"amount": str(original)},
            )
        return debt


class CustomerSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    credit_available = serializers.SerializerMethodField()
    is_settled = serializers.SerializerMethodField()
    has_credit_limit = serializers.SerializerMethodField()
    open_debt_count = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "address",
            "notes",
            "credit_limit",
            "is_active",
            "balance",
            "credit_available",
            "is_settled",
            "has_credit_limit",
            "open_debt_count",
            "created_at",
        ]
        read_only_fields = ["balance", "credit_available"]

    def get_balance(self, obj):
        return str(obj.balance)

    def get_credit_available(self, obj):
        return str(obj.credit_available)

    def get_is_settled(self, obj):
        return obj.is_settled

    def get_has_credit_limit(self, obj):
        return obj.has_credit_limit

    def get_open_debt_count(self, obj):
        return obj.debts.exclude(
            status__in=[Debt.Status.PAID, Debt.Status.CANCELLED]
        ).count()

    def validate_phone(self, value):
        normalized = normalize_phone(value)
        if not normalized:
            raise serializers.ValidationError(
                "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak."
            )
        return normalized

    def validate_credit_limit(self, value):
        if value < 0:
            raise serializers.ValidationError("Kredit limit 0 dan kichik bo'lishi mumkin emas.")
        return value


class CustomerDetailSerializer(CustomerSerializer):
    debts = DebtSerializer(many=True, read_only=True)
    debt_payments = DebtPaymentSerializer(many=True, read_only=True)
    purchases = serializers.SerializerMethodField()

    class Meta(CustomerSerializer.Meta):
        fields = CustomerSerializer.Meta.fields + [
            "debts",
            "debt_payments",
            "purchases",
        ]

    def get_purchases(self, obj):
        sales = obj.sales.order_by("-created_at")[:10]
        return [
            {
                "id": s.id,
                "total": str(s.total),
                "payment_method": s.payment_method,
                "created_at": s.created_at,
            }
            for s in sales
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_name",
            "action",
            "action_display",
            "entity",
            "entity_id",
            "detail",
            "created_at",
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name() or obj.actor.username
        return "—"