from django.contrib import admin

from customers.models import AuditLog, Customer, Debt, DebtPayment


class DebtPaymentInline(admin.TabularInline):
    model = DebtPayment
    extra = 0
    readonly_fields = ["amount", "payment_method", "note", "received_by", "created_at"]


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "phone", "shop", "credit_limit", "balance", "is_active", "created_at"]
    list_filter = ["is_active", "shop"]
    search_fields = ["name", "phone"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "customer",
        "shop",
        "original_amount",
        "remaining_amount",
        "paid_amount",
        "due_date",
        "status",
        "created_at",
    ]
    list_filter = ["status", "due_date", "customer__shop"]
    search_fields = ["customer__name", "customer__phone"]
    inlines = [DebtPaymentInline]
    readonly_fields = ["created_at", "updated_at"]

    @admin.display(description="Do'kon")
    def shop(self, obj):
        return obj.customer.shop.name if obj.customer.shop else "-"


@admin.register(DebtPayment)
class DebtPaymentAdmin(admin.ModelAdmin):
    list_display = ["id", "debt", "customer", "amount", "payment_method", "received_by", "created_at"]
    list_filter = ["payment_method"]
    search_fields = ["customer__name", "customer__phone"]
    readonly_fields = ["created_at"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["id", "shop", "actor", "action", "entity", "entity_id", "created_at"]
    list_filter = ["action", "shop"]
    search_fields = ["detail"]
    readonly_fields = ["created_at"]