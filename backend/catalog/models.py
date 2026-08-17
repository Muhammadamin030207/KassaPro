from django.db import models

from shops.models import Shop


class Category(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=100)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="products")
    barcode = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True
    )
    stock_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["shop", "barcode"], name="unique_shop_barcode"
            )
        ]

    def save(self, *args, **kwargs):
        # Barcode bo'sh joylardan tozalanadi — duplikat oldini olish uchun
        if self.barcode:
            self.barcode = str(self.barcode).strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.barcode})"