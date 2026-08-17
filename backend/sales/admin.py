from django.contrib import admin

from sales.models import Sale, SaleItem


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = (
        "product_name_snapshot",
        "barcode_snapshot",
        "price_snapshot",
        "qty",
        "subtotal",
    )


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("id", "shop", "cashier", "total", "payment_method", "created_at")
    list_filter = ("payment_method", "created_at", "shop")
    inlines = [SaleItemInline]


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = (
        "sale",
        "product_name_snapshot",
        "qty",
        "price_snapshot",
        "subtotal",
    )