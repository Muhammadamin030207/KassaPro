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
    """Bitta jismoniy qurilma (browser installation) — canonical record.

    ONE USER + ONE device_id = ONE Device. Necha marta login/logout
    qilinmasin — qurilma bitta bo'lib qoladi, har bir login alohida
    DeviceSession (session tarixi) sifatida qo'shiladi.

    `status` BLOCKED bo'lsa, bu qurilmadan parol to'g'ri bo'lsa ham
    login butunlay taqiqlanadi (faqat admin unblock qilgach ochiladi).

    Device identity HAQIQATIY xavfsizlik chegarasi EMAS — asosiy tekshiruv
    session_id + server-side DeviceSession statusi (device_id qurilmani,
    session_id login'ni identifikatsiya qiladi).
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Aktiv"
        BLOCKED = "blocked", "Bloklangan"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="devices",
    )
    device_id = models.CharField(max_length=64, db_index=True)
    device_name = models.CharField(max_length=255, blank=True)
    device_model = models.CharField(max_length=255, blank=True, default="")
    device_type = models.CharField(max_length=16, blank=True, default="")
    browser = models.CharField(max_length=64, blank=True)
    browser_version = models.CharField(max_length=32, blank=True)
    os = models.CharField(max_length=64, blank=True)
    os_version = models.CharField(max_length=32, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    location = models.CharField(max_length=128, blank=True, default="")
    is_name_manual = models.BooleanField(default=False)
    is_model_manual = models.BooleanField(default=False)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    blocked_at = models.DateTimeField(null=True, blank=True)
    blocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="blocked_devices",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_seen_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "device_id"],
                name="accounts_device_user_device_id_uniq",
            ),
        ]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self):
        return f"{self.device_name or self.device_id} ({self.status})"


class DeviceSession(models.Model):
    """Bitta `Device` ustidagi login sessiyasi — qurilmaning kirish tarixi.

    Bitta qurilmada vaqt bo'yicha ko'p sessiya bo'lishi mumkin (login/logout
    tarixi), lekin bir vaqtda faqat bitta ACTIVE sessiya turadi.

    Access/refresh tokenlar `session_id` claim'ini olib yuradi va har bir
    API so'rovda shu sessiya + tegishli Device statusi tekshiriladi
    (REVOKED/BLOCKED → 401).
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Aktiv"
        REVOKED = "revoked", "Chiqarilgan"
        EXPIRED = "expired", "Muddati tugagan"

    device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name="sessions"
    )
    session_id = models.CharField(max_length=64, unique=True, db_index=True)
    refresh_jti = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
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
        indexes = [models.Index(fields=["device", "status"])]

    def __str__(self):
        return f"{self.session_id} ({self.status})"


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
    device_model = models.CharField(max_length=255, blank=True, default="")
    device_type = models.CharField(max_length=16, blank=True, default="")
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
        ADMIN_EDITED_DEVICE = "admin_edited_device", "Qurilma ma'lumotlari tahrirlandi"
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
