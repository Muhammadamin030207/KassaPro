from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from accounts.models import User


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