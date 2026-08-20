from django.urls import path

from shops.views import (
    ApplicationCreateView,
    ApplicationDetailView,
    ApplicationListView,
    ApplicationRejectView,
    ShopSettingsView,
    StoreAdminView,
    StoreCloseView,
    StoreReopenView,
)

urlpatterns = [
    path("stores/settings/", ShopSettingsView.as_view(), name="store-settings"),
    path("applications/", ApplicationCreateView.as_view(), name="web-application-create"),
    path("admin/applications/", ApplicationListView.as_view(), name="admin-applications"),
    path(
        "admin/applications/<int:pk>/",
        ApplicationDetailView.as_view(),
        name="admin-application-detail",
    ),
    path(
        "admin/applications/<int:pk>/reject/",
        ApplicationRejectView.as_view(),
        name="admin-application-reject",
    ),
    path("admin/stores/", StoreAdminView.as_view(), name="admin-stores-list"),
    path("admin/stores/<int:pk>/close/", StoreCloseView.as_view(), name="admin-store-close"),
    path("admin/stores/<int:pk>/reopen/", StoreReopenView.as_view(), name="admin-store-reopen"),
]