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
