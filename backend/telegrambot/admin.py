from django.contrib import admin

from telegrambot.models import BotLog, BotSession


@admin.register(BotSession)
class BotSessionAdmin(admin.ModelAdmin):
    list_display = ["chat_id", "step", "store_name", "updated_at"]
    search_fields = ["chat_id", "store_name"]


@admin.register(BotLog)
class BotLogAdmin(admin.ModelAdmin):
    list_display = ["chat_id", "text", "created_at"]
