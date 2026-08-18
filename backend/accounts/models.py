from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Foydalanuvchi: Admin (platforma), do'kon egasi (owner) yoki kassir (cashier)."""

    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Administrator"
        OWNER = "owner", "Do'kon egasi"
        CASHIER = "cashier", "Kassir"

    role = models.CharField(
        max_length=16, choices=Role.choices, default=Role.CASHIER
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
    def is_admin(self):
        """Platforma administratori (SUPER_ADMIN yoki Django superuser)."""
        return self.role == self.Role.SUPER_ADMIN or self.is_superuser

    @property
    def is_owner(self):
        return self.role == self.Role.OWNER

    @property
    def role_is_owner(self):
        return self.is_owner or self.is_superuser

    @property
    def is_cashier(self):
        return self.role == self.Role.CASHIER
