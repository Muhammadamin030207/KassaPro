from django.contrib import admin

from shops.models import Shop, StoreApplication


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "address", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "owner__username", "address")


@admin.register(StoreApplication)
class StoreApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "store_name",
        "owner_name",
        "phone",
        "status",
        "created_at",
        "processed_at",
    )
    list_filter = ["status"]
    search_fields = ["store_name", "owner_name", "phone"]
    readonly_fields = ("created_at", "processed_at")
