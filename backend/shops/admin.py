from django.contrib import admin

from shops.models import Shop


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "address", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "owner__username", "address")
