from django.conf import settings
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


class Device(models.Model):
    """Qurilma — faqat informatsion rekord.

    ONE USER + ONE PERSISTENT DEVICE_ID = ONE DEVICE. Necha marta
    login/logout qilinmasin — qurilma bitta bo'lib qoladi.

    Device LOGIN GATE EMAS: username+password to'g'ri bo'lsa istalgan
    qurilmadan kirish mumkin. Bu modul faqat "hisob qaysi qurilmalardan
    ishlatilgan" degan savolga javob beradi. Shuning uchun blok/revoke/
    ban kabi xavfsizlik maydonlari yo'q.
    """

    class Type(models.TextChoices):
        LAPTOP = "laptop", "Laptop"
        DESKTOP = "desktop", "Desktop"
        PHONE = "phone", "Smartphone"
        TABLET = "tablet", "Tablet"
        OTHER = "other", "Boshqa"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="devices",
    )
    device_id = models.CharField(max_length=64, db_index=True)
    device_name = models.CharField(max_length=255, blank=True)
    device_model = models.CharField(max_length=255, blank=True, default="")
    device_type = models.CharField(
        max_length=16, choices=Type.choices, blank=True, default=""
    )
    os = models.CharField(max_length=64, blank=True)
    os_version = models.CharField(max_length=32, blank=True)
    browser = models.CharField(max_length=64, blank=True)
    browser_version = models.CharField(max_length=32, blank=True)
    is_name_manual = models.BooleanField(default=False)
    is_model_manual = models.BooleanField(default=False)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_active_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "device_id"],
                name="accounts_device_user_device_id_uniq",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "device_id"], name="dev_user_device_idx"),
            models.Index(fields=["user", "last_active_at"], name="dev_last_active_idx"),
        ]

    def __str__(self):
        return self.device_name or self.device_id
