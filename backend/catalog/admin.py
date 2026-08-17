from django.contrib import admin

from catalog.models import Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "shop")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("barcode", "name", "price", "cost_price", "category", "stock_qty", "is_active")
    list_filter = ("is_active", "category", "shop")
    search_fields = ("name", "barcode")