from django.urls import path

from accounts.views import (
    DeviceCurrentView,
    DeviceHistoryView,
    DeviceListView,
    DeviceRevokeAllView,
    DeviceRevokeView,
    DeviceUnblockView,
    DeviceUpdateView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    RegisterOwnerView,
    StaffDeleteView,
    StaffListCreateView,
)

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/refresh/", RefreshView.as_view(), name="refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/register/", RegisterOwnerView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("devices/", DeviceListView.as_view(), name="devices"),
    path("devices/current/", DeviceCurrentView.as_view(), name="devices-current"),
    path("devices/history/", DeviceHistoryView.as_view(), name="devices-history"),
    path("devices/revoke-all/", DeviceRevokeAllView.as_view(), name="devices-revoke-all"),
    path("devices/<int:pk>/revoke/", DeviceRevokeView.as_view(), name="device-revoke"),
    path("devices/<int:pk>/unblock/", DeviceUnblockView.as_view(), name="device-unblock"),
    path("devices/<int:pk>/update/", DeviceUpdateView.as_view(), name="device-update"),
    path("staff/", StaffListCreateView.as_view(), name="staff-list"),
    path("staff/<int:pk>/", StaffDeleteView.as_view(), name="staff-delete"),
]
