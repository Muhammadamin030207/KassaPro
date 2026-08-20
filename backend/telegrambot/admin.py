from django.contrib import admin

from telegrambot.models import BotLog, BotSession, CustomerApplication


@admin.register(BotSession)
class BotSessionAdmin(admin.ModelAdmin):
    list_display = ["chat_id", "step", "app_stage", "store_name", "updated_at"]
    search_fields = ["chat_id", "store_name", "app_name"]


@admin.register(CustomerApplication)
class CustomerApplicationAdmin(admin.ModelAdmin):
    list_display = [
        "application_number",
        "full_name",
        "phone",
        "status",
        "created_at",
    ]
    list_filter = ["status"]
    search_fields = ["application_number", "full_name", "phone"]


@admin.register(BotLog)
class BotLogAdmin(admin.ModelAdmin):
    list_display = ["chat_id", "text", "created_at"]
