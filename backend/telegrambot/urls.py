from django.urls import path

from telegrambot.api import BotApplicationDetailView, BotApplicationListView
from telegrambot.miniapp import MiniAppLoginView, MiniAppStatusView
from telegrambot.views import TelegramWebhookView

urlpatterns = [
    path("bot/webhook/", TelegramWebhookView.as_view(), name="bot-webhook"),
    path(
        "admin/bot-applications/",
        BotApplicationListView.as_view(),
        name="admin-bot-applications",
    ),
    path(
        "admin/bot-applications/<int:pk>/",
        BotApplicationDetailView.as_view(),
        name="admin-bot-application-detail",
    ),
    path("miniapp/status/", MiniAppStatusView.as_view(), name="miniapp-status"),
    path("miniapp/login/", MiniAppLoginView.as_view(), name="miniapp-login"),
]