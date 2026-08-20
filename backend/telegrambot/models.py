from django.db import models

from customers.utils import normalize_phone


class BotSession(models.Model):
    """Telegram chat uchun conversation holati (bitta chat = bitta qator).

    Ikkita mustaqil flow bor:
      - Do'kon arizasi (store flow): step + store_* maydonlari
      - Umumiy ariza (app flow): app_stage + app_* maydonlari
    Ikkala flow chat_id bo'yicha bir-biriga aralashmaydi.
    """

    chat_id = models.BigIntegerField(primary_key=True)
    step = models.CharField(max_length=40, blank=True)
    telegram_username = models.CharField(max_length=255, blank=True)
    store_name = models.CharField(max_length=150, blank=True)
    owner_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    # Umumiy ariza flow (name -> phone -> message -> note -> confirm)
    app_stage = models.CharField(max_length=40, blank=True)
    app_name = models.CharField(max_length=150, blank=True)
    app_phone = models.CharField(max_length=20, blank=True)
    app_message = models.TextField(blank=True)
    app_note = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"chat {self.chat_id} (step={self.step or self.app_stage or 'idle'})"


class CustomerApplication(models.Model):
    """Bot orqali yuborilgan umumiy ariza/murojaat.

    Statuslar: Yangi -> Ko'rib chiqilmoqda -> Qabul qilindi / Rad etildi /
    Yakunlandi. Har bir ariza noyob application_number (APP-xxxxxx) oladi.
    """

    class Status(models.TextChoices):
        NEW = "new", "Yangi"
        IN_REVIEW = "in_review", "Ko'rib chiqilmoqda"
        ACCEPTED = "accepted", "Qabul qilindi"
        REJECTED = "rejected", "Rad etildi"
        COMPLETED = "completed", "Yakunlandi"

    STATUS_EMOJI = {
        Status.NEW: "🟡",
        Status.IN_REVIEW: "🔵",
        Status.ACCEPTED: "🟢",
        Status.REJECTED: "🔴",
        Status.COMPLETED: "✅",
    }

    application_number = models.CharField(max_length=20, unique=True, blank=True)
    telegram_user_id = models.BigIntegerField()
    telegram_username = models.CharField(max_length=255, blank=True)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    message = models.TextField(blank=True)
    note = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        normalized = normalize_phone(self.phone)
        if normalized:
            self.phone = normalized
        if not self.application_number:
            super().save(*args, **kwargs)
            self.application_number = f"APP-{self.id:06d}"
            super().save(update_fields=["application_number"])
            return
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.application_number or self.full_name} ({self.get_status_display()})"


class BotLog(models.Model):
    """Bot xatolari / texnik logi (Admin uchun foydali, secret saqlamaydi)."""

    chat_id = models.BigIntegerField(null=True, blank=True)
    text = models.CharField(max_length=1000, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]