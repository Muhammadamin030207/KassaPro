from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Foydalanuvchi: do'kon egasi (owner) yoki kassir (cashier)."""

    class Role(models.TextChoices):
        OWNER = "owner", "Do'kon egasi"
        CASHIER = "cashier", "Kassir"

    role = models.CharField(
        max_length=10, choices=Role.choices, default=Role.CASHIER
    )
    shop = models.ForeignKey(
        "shops.Shop",
        on_delete=models.CASCADE,
        related_name="staff",
        null=True,
        blank=True,
    )
    phone = models.CharField(max_length=20, blank=True)

    @property
    def is_owner(self):
        return self.role == self.Role.OWNER

    @property
    def is_cashier(self):
        return self.role == self.Role.CASHIER
