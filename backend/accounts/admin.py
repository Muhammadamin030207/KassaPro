from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from accounts.models import Device, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("username", "role", "shop", "phone", "is_staff")
    list_filter = ("role", "shop", "is_staff")
    fieldsets = UserAdmin.fieldsets + (
        ("Qo'shimcha", {"fields": ("role", "shop", "phone")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Qo'shimcha", {"fields": ("role", "shop", "phone")}),
    )


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "device_name",
        "device_model",
        "device_type",
        "last_login_at",
        "last_active_at",
    )
    list_filter = ("device_type", "is_name_manual", "is_model_manual")
    search_fields = ("user__username", "device_id", "device_name", "device_model")