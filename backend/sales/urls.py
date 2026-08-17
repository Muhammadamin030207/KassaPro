from django.urls import path

from sales.views import (
    DailyReportView,
    SaleDetailView,
    SaleListCreateView,
    SummaryReportView,
)

urlpatterns = [
    path("sales/", SaleListCreateView.as_view(), name="sale-list"),
    path("sales/<int:pk>/", SaleDetailView.as_view(), name="sale-detail"),
    path("reports/daily/", DailyReportView.as_view(), name="report-daily"),
    path("reports/summary/", SummaryReportView.as_view(), name="report-summary"),
]