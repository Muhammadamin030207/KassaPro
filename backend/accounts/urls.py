from django.urls import path

from accounts.views import (
    LoginView,
    MeView,
    RefreshView,
    RegisterOwnerView,
    StaffDeleteView,
    StaffListCreateView,
)

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/refresh/", RefreshView.as_view(), name="refresh"),
    path("auth/register/", RegisterOwnerView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("staff/", StaffListCreateView.as_view(), name="staff-list"),
    path("staff/<int:pk>/", StaffDeleteView.as_view(), name="staff-delete"),
]
