from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from accounts.models import DeviceAuditLog, DeviceSession, LoginEvent, User


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


@admin.register(DeviceSession)
class DeviceSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "status", "ip_address", "last_active_at")
    list_filter = ("status",)
    search_fields = ("user__username", "device_id", "device_name")


@admin.register(LoginEvent)
class LoginEventAdmin(admin.ModelAdmin):
    list_display = ("user", "result", "device_name", "ip_address", "created_at")
    list_filter = ("result",)


@admin.register(DeviceAuditLog)
class DeviceAuditLogAdmin(admin.ModelAdmin):
    list_display = ("actor", "action", "device_name", "ip_address", "created_at")
    list_filter = ("action",)