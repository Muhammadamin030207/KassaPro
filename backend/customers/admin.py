from django.contrib import admin

from customers.models import Customer, DebtTransaction


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "phone", "shop", "created_at"]
    search_fields = ["name", "phone"]


@admin.register(DebtTransaction)
class DebtTransactionAdmin(admin.ModelAdmin):
    list_display = ["id", "customer", "type", "amount", "sale", "created_at"]
    list_filter = ["type"]
