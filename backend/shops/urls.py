from django.urls import path

from shops.views import (
    ApplicationListView,
    ApplicationRejectView,
    ShopSettingsView,
    StoreCreateView,
)

urlpatterns = [
    path("stores/settings/", ShopSettingsView.as_view(), name="store-settings"),
    path("admin/applications/", ApplicationListView.as_view(), name="admin-applications"),
    path(
        "admin/applications/<int:pk>/reject/",
        ApplicationRejectView.as_view(),
        name="admin-application-reject",
    ),
    path("admin/stores/", StoreCreateView.as_view(), name="admin-store-create"),
]