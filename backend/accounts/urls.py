from django.urls import path

from accounts.views import (
    DeviceDetailView,
    DeviceListView,
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
    path("devices/<int:pk>/", DeviceDetailView.as_view(), name="device-detail"),
    path("staff/", StaffListCreateView.as_view(), name="staff-list"),
    path("staff/<int:pk>/", StaffDeleteView.as_view(), name="staff-delete"),
]