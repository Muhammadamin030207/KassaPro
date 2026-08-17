from django.urls import path

from customers.views import (
    CustomerByPhoneView,
    CustomerDetailView,
    CustomerListCreateView,
    CustomerPaymentView,
)

urlpatterns = [
    path("customers/", CustomerListCreateView.as_view(), name="customer-list"),
    path(
        "customers/by-phone/<str:phone>/",
        CustomerByPhoneView.as_view(),
        name="customer-by-phone",
    ),
    path("customers/<int:pk>/", CustomerDetailView.as_view(), name="customer-detail"),
    path(
        "customers/<int:pk>/pay/",
        CustomerPaymentView.as_view(),
        name="customer-pay",
    ),
]