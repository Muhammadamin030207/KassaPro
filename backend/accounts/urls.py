from django.urls import path

from accounts.views import (
    DeviceDetailView,
    ChangePasswordView,
    NotificationListView,
    ProfileUpdateView,
    PushPublicKeyView,
    PushSubscribeView,
    PushUnsubscribeView,
    NotificationReadAllView,
    NotificationReadView,
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
    path("auth/profile/", ProfileUpdateView.as_view(), name="profile-update"),
    path(
        "auth/change-password/",
        ChangePasswordView.as_view(),
        name="change-password",
    ),
    path("devices/", DeviceListView.as_view(), name="devices"),
    path("devices/<int:pk>/", DeviceDetailView.as_view(), name="device-detail"),
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path(
        "notifications/<int:pk>/read/",
        NotificationReadView.as_view(),
        name="notification-read",
    ),
    path("push/public-key/", PushPublicKeyView.as_view(), name="push-public-key"),
    path("push/subscribe/", PushSubscribeView.as_view(), name="push-subscribe"),
    path(
        "push/unsubscribe/",
        PushUnsubscribeView.as_view(),
        name="push-unsubscribe",
    ),
    path(
        "notifications/read-all/",
        NotificationReadAllView.as_view(),
        name="notification-read-all",
    ),
    path("staff/", StaffListCreateView.as_view(), name="staff-list"),
    path("staff/<int:pk>/", StaffDeleteView.as_view(), name="staff-delete"),
]