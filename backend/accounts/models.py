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


class DeviceSession(models.Model):
    """Bir qurilmadagi login sessiyasi.

    Asosiy identifikator: persistent `device_id` + unikal `session_id`.
    IP va User-Agent faqat metadata — ular orqali qurilma aniqlanmaydi.
    Access/refresh tokenlar `session_id` claim'ini olib yuradi va har bir
    API so'rovda shu sessiya statusi tekshiriladi (REVOKED → 401).
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Aktiv"
        REVOKED = "revoked", "Chiqarilgan"
        EXPIRED = "expired", "Muddati tugagan"
        ALLOWED = "allowed", "Ruxsat berilgan"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="device_sessions",
    )
    device_id = models.CharField(max_length=64, db_index=True)
    session_id = models.CharField(max_length=64, unique=True, db_index=True)
    device_name = models.CharField(max_length=255, blank=True)
    browser = models.CharField(max_length=64, blank=True)
    browser_version = models.CharField(max_length=32, blank=True)
    os = models.CharField(max_length=64, blank=True)
    os_version = models.CharField(max_length=32, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    location = models.CharField(max_length=128, blank=True, default="")
    refresh_jti = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revoked_sessions",
    )

    class Meta:
        ordering = ["-last_active_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["user", "device_id"]),
        ]

    def __str__(self):
        return f"{self.device_name or self.device_id} ({self.status})"


class LoginEvent(models.Model):
    """Kirish tarixi — har bir login/chiqish/rad etish hodisasi."""

    class Result(models.TextChoices):
        SUCCESS = "success", "Muvaffaqiyatli kirish"
        BLOCKED = "blocked", "Rad etilgan"
        LOGOUT = "logout", "Chiqish"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="login_events",
    )
    device_id = models.CharField(max_length=64, blank=True)
    device_name = models.CharField(max_length=255, blank=True)
    browser = models.CharField(max_length=64, blank=True)
    browser_version = models.CharField(max_length=32, blank=True)
    os = models.CharField(max_length=64, blank=True)
    os_version = models.CharField(max_length=32, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    result = models.CharField(max_length=16, choices=Result.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"])]

    def __str__(self):
        return f"{self.user_id} {self.result} {self.created_at}"


class DeviceAuditLog(models.Model):
    """Device/session xavfsizlik auditi — kim, qachon, qaysi qurilmani boshqardi."""

    class Action(models.TextChoices):
        LOGIN = "login", "Kirish"
        LOGIN_BLOCKED = "login_blocked", "Kirish bloklandi"
        LOGOUT = "logout", "Chiqish"
        ADMIN_REVOKED_DEVICE = "admin_revoked_device", "Qurilma chiqarildi"
        ADMIN_UNBLOCKED_DEVICE = "admin_unblocked_device", "Qurilmaga ruxsat berildi"
        REVOKE_ALL = "revoke_all", "Barcha qurilmalar chiqarildi"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="device_audits_as_actor",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="device_audits_as_target",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    device_id = models.CharField(max_length=64, blank=True)
    device_name = models.CharField(max_length=255, blank=True)
    session_id = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["target_user", "created_at"])]

    def __str__(self):
        return f"{self.action} {self.device_id}"
