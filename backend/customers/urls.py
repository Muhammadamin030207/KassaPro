from django.urls import path

from customers.views import (
    AuditLogListView,
    CustomerByPhoneView,
    CustomerDetailView,
    CustomerListCreateView,
    DebtCancelView,
    DebtDetailView,
    DebtExportView,
    DebtListCreateView,
    DebtPaymentView,
    DebtStatsView,
    TopDebtorsView,
)

urlpatterns = [
    path("customers/", CustomerListCreateView.as_view(), name="customer-list"),
    path(
        "customers/by-phone/<str:phone>/",
        CustomerByPhoneView.as_view(),
        name="customer-by-phone",
    ),
    path("customers/<int:pk>/", CustomerDetailView.as_view(), name="customer-detail"),
    # Qarzdorlik (Debt Management)
    path("debts/", DebtListCreateView.as_view(), name="debt-list"),
    path("debts/stats/", DebtStatsView.as_view(), name="debt-stats"),
    path("debts/top/", TopDebtorsView.as_view(), name="debt-top"),
    path("debts/export/", DebtExportView.as_view(), name="debt-export"),
    path("debts/<int:pk>/", DebtDetailView.as_view(), name="debt-detail"),
    path("debts/<int:pk>/pay/", DebtPaymentView.as_view(), name="debt-pay"),
    path("debts/<int:pk>/cancel/", DebtCancelView.as_view(), name="debt-cancel"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-log"),
]