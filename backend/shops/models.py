from django.conf import settings
from django.db import models

from customers.utils import normalize_phone


class Shop(models.Model):
    """Do'kon. Owner (egasi) tomonidan boshqariladi."""

    name = models.CharField(max_length=150)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_shops",
    )
    address = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text="Yopilgan (deaktiv) do'kon egasi kira olmaydi, ma'lumotlari arxiv sifatida saqlanadi.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ShopSettings(models.Model):
    """Do'kon (tenant) sozlamalari.

    Ega (owner) tomonidan to'ldiriladigan to'lov rekvizitlari:
    Payme merchant ID, Click merchant/service ID, Paynet ID, karta raqamlari.
    Bu rekvizitlar kassadagi dinamik QR (deep-link) yaratishda ishlatiladi.
    """

    shop = models.OneToOneField(
        Shop, on_delete=models.CASCADE, related_name="settings"
    )
    # Payme
    payme_merchant_id = models.CharField(max_length=64, blank=True)
    payme_card = models.CharField(max_length=32, blank=True)
    # Click
    click_service_id = models.CharField(max_length=64, blank=True)
    click_merchant_id = models.CharField(max_length=64, blank=True)
    click_card = models.CharField(max_length=32, blank=True)
    # Paynet
    paynet_merchant_id = models.CharField(max_length=64, blank=True)
    paynet_card = models.CharField(max_length=32, blank=True)
    # Humo/UzCard QR (qr_card_number), QR ekrandagi karta egasi (qr_holder)
    qr_card_number = models.CharField(max_length=32, blank=True)
    qr_holder = models.CharField(max_length=100, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings({self.shop.name})"


class StoreApplication(models.Model):
    """Telegram bot orqali yuborilgan yangi do'kon arizasi.

    Arizani faqat Admin roli tasdiqlaydi (approve) yoki rad etadi (reject).
    Tasdiqlanganda Shop + owner User yaratiladi, login/parol Telegram orqali
    mijozga yuboriladi. Rad etilganda Customer tarixi kabi ariza ham o'chirilmaydi.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Kutilmoqda"
        APPROVED = "approved", "Tasdiqlangan"
        REJECTED = "rejected", "Rad etilgan"

    store_name = models.CharField(max_length=150)
    owner_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_username = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_applications",
    )
    created_shop = models.ForeignKey(
        Shop,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications",
    )
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        normalized = normalize_phone(self.phone)
        if normalized:
            self.phone = normalized
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.store_name} ({self.get_status_display()})"


class AuditLog(models.Model):
    """Admin harakatlari auditi (xavfsizlik majburiyati).

    Har bir muhim admin amali (arizani tasdiqlash/rad etish, do'konni
    yopish/qayta ochish) kimyoviy tarix sifatida saqlanadi: kim, qachon,
    qanday amal bajardi va nima natija oldi. O'chirilmaydi — javobgarlik
    yo'lida saqlanadi (retention 90 kun, keyin ushbu qator arxivga).
    """

    USER_ACTION = "user_action"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_audit_logs",
    )
    action = models.CharField(max_length=64)
    application = models.ForeignKey(
        StoreApplication,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    shop = models.ForeignKey(
        Shop,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_audit_logs",
    )
    detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} by {self.actor_id or 'system'} at {self.created_at:%Y-%m-%d %H:%M}"
