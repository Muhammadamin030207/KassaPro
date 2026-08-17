from django.urls import path

from catalog.views import (
    CategoryListView,
    ProductByBarcodeView,
    ProductDetailView,
    ProductListCreateView,
    ProductUpsertByBarcodeView,
)

urlpatterns = [
    path("products/", ProductListCreateView.as_view(), name="product-list"),
    path(
        "products/by-barcode/<str:code>/",
        ProductByBarcodeView.as_view(),
        name="product-by-barcode",
    ),
    path(
        "products/upsert-by-barcode/",
        ProductUpsertByBarcodeView.as_view(),
        name="product-upsert-by-barcode",
    ),
    path("products/<int:pk>/", ProductDetailView.as_view(), name="product-detail"),
    path("categories/", CategoryListView.as_view(), name="category-list"),
]