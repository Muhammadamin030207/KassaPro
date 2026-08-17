from django.urls import path

from telegrambot.views import TelegramWebhookView

urlpatterns = [
    path("bot/webhook/", TelegramWebhookView.as_view(), name="bot-webhook"),
]
