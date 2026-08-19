from django.db import models


class BotSession(models.Model):
    """Telegram chat uchun ketma-ket suhbat (conversation) holati.

    /start dan boshlab:
      store_name -> owner_name -> phone -> address -> ariza yopiladi.
    Har bir qadam Telegram'da savol beradi va javobni DB'da saqlaydi —
    bot qayta ishga tushsa ham suhbat yo'qolmaydi.
    """

    chat_id = models.BigIntegerField(primary_key=True)
    step = models.CharField(max_length=40, blank=True)
    telegram_username = models.CharField(max_length=255, blank=True)
    # Umumiy murojaat (support) formasi holati
    form_type = models.CharField(max_length=16, blank=True, default="")
    full_name = models.CharField(max_length=150, blank=True)
    message = models.TextField(max_length=1000, blank=True)
    note = models.CharField(max_length=500, blank=True)
    # Eski do'kon ro'yxatga olish formasi (legacy / ishlatilmaydi)
    store_name = models.CharField(max_length=150, blank=True)
    owner_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"chat {self.chat_id} (step={self.step or 'idle'})"


class SupportApplication(models.Model):
    """KassaPro bot /application orqali yuborilgan murojaat (ariza).

    Do'kon ro'yxatdan o'tkazish (StoreApplication) bilan adashtirmang —
    bu umumiy murojaat/xizmat arizasi: ism, telefon, murojaat, izoh.
    Admin Telegram chatiga yuboriladi, holati bot orqali ko'rsatiladi.
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
    message = models.TextField(max_length=1000)
    note = models.CharField(max_length=500, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.application_number:
            self.application_number = f"APP-{self.pk:06d}"
            super().save(update_fields=["application_number"])

    @property
    def status_display(self):
        return self.get_status_display()

    @property
    def status_emoji(self):
        return self.STATUS_EMOJI.get(self.status, "🟡")

    def __str__(self):
        return f"{self.application_number or 'APP-?'} ({self.get_status_display()})"


class BotLog(models.Model):
    """Bot xatolari / yuborilgan xabarlar logi (Admin uchun foydali)."""

    chat_id = models.BigIntegerField(null=True, blank=True)
    text = models.CharField(max_length=1000, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]