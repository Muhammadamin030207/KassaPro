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
    store_name = models.CharField(max_length=150, blank=True)
    owner_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"chat {self.chat_id} (step={self.step or 'idle'})"


class BotLog(models.Model):
    """Bot xatolari / yuborilgan xabarlar logi (Admin uchun foydali)."""

    chat_id = models.BigIntegerField(null=True, blank=True)
    text = models.CharField(max_length=1000, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]