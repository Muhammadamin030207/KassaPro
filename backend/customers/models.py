from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from shops.models import Shop
from customers.utils import normalize_phone


class Customer(models.Model):
    """Mijoz — noyob identifikatori telefon raqami (+998XXXXXXXXX)."""

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=255, db_index=True)
    phone = models.CharField(max_length=20, db_index=True)
    address = models.CharField(max_length=255, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    credit_limit = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0")
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_customers",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["shop", "phone"], name="unique_shop_phone"
            )
        ]

    def save(self, *args, **kwargs):
        normalized = normalize_phone(self.phone)
        if normalized:
            self.phone = normalized
        super().save(*args, **kwargs)

    @property
    def balance(self):
        """Joriy qarz = ACTIVE + PARTIALLY_PAID + OVERDUE qarzlarning
        remaining_amount yig'indisi (PAID/CANCELLED hisobga olinmaydi)."""
        qs = (
            self.debts.exclude(status__in=[Debt.Status.PAID, Debt.Status.CANCELLED])
            .values("remaining_amount")
        )
        total = Decimal("0")
        for row in qs:
            total += row["remaining_amount"]
        return total

    @property
    def total_debt_original(self):
        total = Decimal("0")
        for row in self.debts.exclude(status__in=[Debt.Status.PAID, Debt.Status.CANCELLED]).values("original_amount"):
            total += row["original_amount"]
        return total

    @property
    def credit_used(self):
        return self.balance

    @property
    def credit_available(self):
        limit = self.credit_limit or Decimal("0")
        return max(Decimal("0"), limit - self.balance)

    @property
    def has_credit_limit(self):
        return (self.credit_limit or Decimal("0")) > 0

    @property
    def is_settled(self):
        return self.balance <= 0

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Debt(models.Model):
    """Nasiyaga berilgan qarz.

    Financial data tarixiy ahamiyatga ega — DELETE qilinmaydi,
    CANCELLED statusiga o'tkaziladi.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Aktiv"
        PARTIALLY_PAID = "partially_paid", "Qisman to'langan"
        PAID = "paid", "To'langan"
        OVERDUE = "overdue", "Muddati o'tgan"
        CANCELLED = "cancelled", "Bekor qilingan"

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="debts")
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="debts"
    )
    sale = models.ForeignKey(
        "sales.Sale", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="debts",
    )
    original_amount = models.DecimalField(max_digits=14, decimal_places=2)
    remaining_amount = models.DecimalField(max_digits=14, decimal_places=2)
    due_date = models.DateField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_debts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date", "-created_at"]
        indexes = [
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["due_date", "status"]),
        ]

    @property
    def paid_amount(self):
        return self.original_amount - self.remaining_amount

    @paid_amount.setter
    def paid_amount(self, value):
        self.remaining_amount = self.original_amount - value

    @property
    def paid_percent(self):
        if not self.original_amount:
            return 0
        return round((self.paid_amount / self.original_amount) * 100, 1)

    @property
    def effective_status(self):
        """Muddati o'tgan qarz backend logika orqali OVERDUE sifatida aniqlanadi."""
        if self.status in (Debt.Status.PAID, Debt.Status.CANCELLED):
            return self.status
        if (
            self.remaining_amount > 0
            and self.due_date < timezone.localdate()
        ):
            return Debt.Status.OVERDUE
        if self.remaining_amount <= 0:
            return Debt.Status.PAID
        if self.paid_amount > 0:
            return Debt.Status.PARTIALLY_PAID
        return Debt.Status.ACTIVE

    def __str__(self):
        return f"Qarz {self.customer.name}: {self.remaining_amount}"


class DebtPayment(models.Model):
    """Qarzga to'langan pul — alohida tarix."""

    class Method(models.TextChoices):
        CASH = "cash", "Naqd"
        CARD = "card", "Karta"
        MIXED = "mixed", "Aralash"

    debt = models.ForeignKey(
        Debt, on_delete=models.CASCADE, related_name="payments"
    )
    shop = models.ForeignKey(
        Shop, on_delete=models.CASCADE, related_name="debt_payments"
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="debt_payments"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(
        max_length=10, choices=Method.choices, default=Method.CASH
    )
    note = models.CharField(max_length=255, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_debt_payments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["customer", "created_at"])]

    def __str__(self):
        return f"{self.amount} ({self.debt_id})"


class AuditLog(models.Model):
    """Qarz bilan bog'liq barcha muhim amallar logi."""

    class Action(models.TextChoices):
        DEBT_CREATED = "debt_created", "Qarz yaratildi"
        DEBT_UPDATED = "debt_updated", "Qarz yangilandi"
        DEBT_PAYMENT_CREATED = "debt_payment_created", "Qarz to'lovi qabul qilindi"
        DEBT_PAID = "debt_paid", "Qarz to'liq to'landi"
        DEBT_CANCELLED = "debt_cancelled", "Qarz bekor qilindi"
        CREDIT_LIMIT_CHANGED = "credit_limit_changed", "Kredit limiti o'zgardi"

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    entity = models.CharField(max_length=64)
    entity_id = models.IntegerField(null=True, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["shop", "action", "created_at"])]

    def __str__(self):
        return f"{self.action} #{self.entity_id if self.entity_id is not None else ''}"


class DebtTransaction(models.Model):
    """ESKI qarzdorlik tarixi (legacy).

    Yangi tizimga Debt + DebtPayment o'zgartirildi. Bu model faqat eski
    ma'lumotlarni Debt'ga ko'chirish uchun saqlanmoqda (data migration).
    Yangi kod bu modelni ishlatmaydi.
    """

    class Type(models.TextChoices):
        DEBT = "debt", "Qarz"
        PAYMENT = "payment", "To'lov"
        ADJUSTMENT = "adjustment", "Qarzni tuzatish"

    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="legacy_transactions"
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    sale = models.ForeignKey(
        "sales.Sale", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="legacy_transactions",
    )
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="legacy_debt_transactions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_type_display()} {self.amount} ({self.customer.phone})"