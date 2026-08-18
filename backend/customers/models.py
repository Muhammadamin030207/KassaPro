from django.db import models

from shops.models import Shop
from customers.utils import normalize_phone


class Customer(models.Model):
    """Mijoz — noyob identifikatori telefon raqami (+998XXXXXXXXX)."""

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, db_index=True)
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
        # Har doim toza xalqaro formatda saqlaymiz
        normalized = normalize_phone(self.phone)
        if normalized:
            self.phone = normalized
        super().save(*args, **kwargs)

    @property
    def balance(self):
        """Qarz = (Jami DEBT + Jami ADJUSTMENT) - (Jami PAYMENT) — real-time hisob. Hardcode qilinmaydi."""
        from django.db.models import Sum

        from customers.models import DebtTransaction

        agg = DebtTransaction.objects.filter(customer=self).aggregate(
            debt=Sum("amount", filter=models.Q(type=DebtTransaction.Type.DEBT)),
            adjust=Sum(
                "amount", filter=models.Q(type=DebtTransaction.Type.ADJUSTMENT)
            ),
            paid=Sum("amount", filter=models.Q(type=DebtTransaction.Type.PAYMENT)),
        )
        debt = agg["debt"] or 0
        adjust = agg["adjust"] or 0
        paid = agg["paid"] or 0
        return (debt + adjust) - paid

    @property
    def is_settled(self):
        return self.balance <= 0

    def __str__(self):
        return f"{self.name} ({self.phone})"


class DebtTransaction(models.Model):
    """Qarzdorlik harakati. Qarz summasi shu tablitsa orqali yuritiladi.

    Balance (formula): (Jami DEBT + Jami ADJUSTMENT) - (Jami PAYMENT).
    Customer.balance property orqali real-time hisoblanadi, hardcode qilinmaydi.
    """

    class Type(models.TextChoices):
        DEBT = "debt", "Qarz"
        PAYMENT = "payment", "To'lov"
        ADJUSTMENT = "adjustment", "Qarzni tuzatish"

    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="transactions"
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    sale = models.ForeignKey(
        "sales.Sale", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="debt_transactions",
    )
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="debt_transactions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_type_display()} {self.amount} ({self.customer.phone})"