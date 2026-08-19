from django.urls import path

from telegrambot.views import (
    AdminSupportApplicationDetailView,
    AdminSupportApplicationListView,
    TelegramWebhookView,
)

urlpatterns = [
    path("bot/webhook/", TelegramWebhookView.as_view(), name="bot-webhook"),
    path(
        "admin/support-applications/",
        AdminSupportApplicationListView.as_view(),
        name="admin-support-applications",
    ),
    path(
        "admin/support-applications/<int:pk>/",
        AdminSupportApplicationDetailView.as_view(),
        name="admin-support-application-detail",
    ),
]