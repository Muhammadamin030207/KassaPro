from django.conf import settings
from django.db import models

from catalog.models import Product
from shops.models import Shop


class Sale(models.Model):
    """Bitta sotuv (chek)."""

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Naqd"
        CARD = "card", "Karta"
        CLICK = "click", "Click"
        PAYME = "payme", "Payme"
        PAYNET = "paynet", "Paynet"
        VISA = "visa", "Visa"
        NASIYA = "nasiya", "Nasiya"

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="sales")
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    total = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Sale #{self.pk} - {self.total}"


class SaleItem(models.Model):
    """Chekdagi bitta qator. Narx/nom 'snapshot' qilib saqlanadi."""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product, on_delete=models.SET_NULL, null=True, blank=True
    )
    product_name_snapshot = models.CharField(max_length=255)
    barcode_snapshot = models.CharField(max_length=64)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    qty = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)

    def __str__(self):
        return f"{self.product_name_snapshot} x{self.qty}"