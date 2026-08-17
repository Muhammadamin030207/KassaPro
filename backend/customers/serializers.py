from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from customers.models import Customer, DebtTransaction


class DebtTransactionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = DebtTransaction
        fields = [
            "id",
            "type",
            "type_display",
            "amount",
            "sale",
            "note",
            "created_by",
            "created_at",
        ]
        read_only_fields = fields


class CustomerSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(max_length=20)
    balance = serializers.SerializerMethodField()
    debt_total = serializers.SerializerMethodField()
    paid_total = serializers.SerializerMethodField()
    is_settled = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "balance",
            "debt_total",
            "paid_total",
            "is_settled",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_balance(self, obj):
        return obj.balance

    def get_debt_total(self, obj):
        return (
            obj.transactions.filter(type=DebtTransaction.Type.DEBT).aggregate(
                total=Sum("amount")
            )["total"]
            or Decimal("0")
        )

    def get_paid_total(self, obj):
        return (
            obj.transactions.filter(type=DebtTransaction.Type.PAYMENT).aggregate(
                total=Sum("amount")
            )["total"]
            or Decimal("0")
        )

    def get_is_settled(self, obj):
        return obj.is_settled


class CustomerDetailSerializer(CustomerSerializer):
    transactions = DebtTransactionSerializer(many=True, read_only=True)

    class Meta(CustomerSerializer.Meta):
        fields = CustomerSerializer.Meta.fields + ["transactions"]


class CustomerPaymentSerializer(serializers.Serializer):
    """Qarzni to'lash / tuzatish."""

    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0.01")
    )
    type = serializers.ChoiceField(
        choices=[
            (DebtTransaction.Type.PAYMENT, DebtTransaction.Type.PAYMENT),
            (DebtTransaction.Type.ADJUSTMENT, DebtTransaction.Type.ADJUSTMENT),
        ],
        required=False,
        default=DebtTransaction.Type.PAYMENT,
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    @transaction.atomic
    def save(self, customer, user):
        ctype = self.validated_data.get("type", DebtTransaction.Type.PAYMENT)
        amount = self.validated_data["amount"]

        # To'lov balansdan ortiq bo'lishi mumkin emas
        if ctype == DebtTransaction.Type.PAYMENT and amount > customer.balance:
            raise serializers.ValidationError(
                {"amount": "To'lov miqdori qarzdan oshib keta olmaydi."}
            )

        txn = DebtTransaction.objects.create(
            customer=customer,
            type=ctype,
            amount=amount,
            note=self.validated_data.get("note", ""),
            created_by=user,
        )
        return txn