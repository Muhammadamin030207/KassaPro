from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework import generics, response, status, views
from rest_framework.exceptions import ValidationError
from rest_framework.throttling import ScopedRateThrottle

from accounts.permissions import IsShopMember
from sales.models import Sale, SaleItem
from sales.serializers import (
    SaleCreateSerializer,
    SaleDetailSerializer,
    SaleSerializer,
)


class SaleListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsShopMember]
    throttle_scope = "sales"

    def get_throttles(self):
        """Faqat POST /api/sales/ uchun rate-limit (60/min)."""
        if self.request.method == "POST":
            return [ScopedRateThrottle()]
        return []

    def get_serializer_class(self):
        if self.request.method == "POST":
            return SaleCreateSerializer
        return SaleSerializer

    def get_queryset(self):
        qs = Sale.objects.filter(shop=self.request.user.shop)
        qs = qs.prefetch_related("items")

        # Filtrlar
        date_param = self.request.query_params.get("date")
        from_param = self.request.query_params.get("from")
        to_param = self.request.query_params.get("to")
        cashier_id = self.request.query_params.get("cashier")

        if cashier_id and not cashier_id.isdigit():
            raise ValidationError({"cashier": "Kassir ID son bo'lishi kerak."})

        if date_param:
            qs = qs.filter(created_at__date=self._parse_date(date_param))
        if from_param:
            qs = qs.filter(created_at__date__gte=self._parse_date(from_param))
        if to_param:
            qs = qs.filter(created_at__date__lte=self._parse_date(to_param))
        if cashier_id:
            qs = qs.filter(cashier_id=cashier_id)

        return qs

    @staticmethod
    def _parse_date(value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValidationError(
                {"date": "Sana format noto'g'ri. ISO (YYYY-MM-DD) bo'lishi kerak."}
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        return response.Response(
            SaleDetailSerializer(sale).data, status=status.HTTP_201_CREATED
        )


class SaleDetailView(generics.RetrieveAPIView):
    permission_classes = [IsShopMember]
    serializer_class = SaleDetailSerializer

    def get_queryset(self):
        return Sale.objects.filter(shop=self.request.user.shop)


class DailyReportView(views.APIView):
    """Kunlik jami savdo + top mahsulotlar."""

    permission_classes = [IsShopMember]

    def get(self, request):
        day = request.query_params.get("date") or timezone.localdate().isoformat()
        try:
            date.fromisoformat(day)
        except ValueError:
            raise ValidationError(
                {"date": "Sana format noto'g'ri. ISO (YYYY-MM-DD) bo'lishi kerak."}
            )
        sales = Sale.objects.filter(shop=request.user.shop, created_at__date=day)
        items = SaleItem.objects.filter(sale__shop=request.user.shop, sale__created_at__date=day)

        agg = items.aggregate(
            items_sold=Coalesce(
                Sum("qty"),
                0,
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )
        totals = sales.aggregate(
            total=Coalesce(
                Sum("total"),
                0,
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )

        top_products = (
            items.values("product_name_snapshot", "barcode_snapshot", "price_snapshot")
            .annotate(
                total_qty=Sum("qty"),
                total_amount=Sum(F("price_snapshot") * F("qty")),
            )
            .order_by("-total_amount")[:10]
        )

        by_payment = list(
            sales.values("payment_method")
            .annotate(amount=Sum("total"), count=Count("id"))
            .order_by("-amount")
        )

        return response.Response(
            {
                "date": day,
                "total_revenue": totals["total"],
                "sale_count": sales.count(),
                "items_sold": agg["items_sold"],
                "avg_sale": (
                    round(float(totals["total"]) / sales.count(), 2)
                    if sales.count()
                    else 0
                ),
                "top_products": list(top_products),
                "by_payment": list(by_payment),
            }
        )


class SummaryReportView(views.APIView):
    """Davr bo'yicha hisobot: jami, foyda, kassir kesimida."""

    permission_classes = [IsShopMember]

    def get(self, request):
        today = timezone.localdate()
        from_param = request.query_params.get("from") or (today - timedelta(days=30))
        to_param = request.query_params.get("to") or today.isoformat()
        for name, value in (("from", from_param), ("to", to_param)):
            try:
                date.fromisoformat(str(value))
            except ValueError:
                raise ValidationError(
                    {name: "Sana format noto'g'ri. ISO (YYYY-MM-DD) bo'lishi kerak."}
                )

        sales = Sale.objects.filter(
            shop=request.user.shop, created_at__date__gte=from_param, created_at__date__lte=to_param
        )
        items = SaleItem.objects.filter(
            sale__shop=request.user.shop,
            sale__created_at__date__gte=from_param,
            sale__created_at__date__lte=to_param,
        )

        totals = sales.aggregate(
            total_revenue=Coalesce(
                Sum("total"),
                0,
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )
        profit = items.annotate(
            cost_snapshot=Coalesce(
                F("cost_price_snapshot"),
                F("product__cost_price"),
                Decimal("0"),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        ).aggregate(
            total_profit=Coalesce(
                Sum((F("price_snapshot") - F("cost_snapshot")) * F("qty")),
                0,
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )

        by_cashier = list(
            sales.values("cashier__username")
            .annotate(total=Sum("total"), count=Count("id"))
            .order_by("-total")
        )

        by_product = list(
            items.values("product_name_snapshot")
            .annotate(total_qty=Sum("qty"), total_amount=Sum(F("price_snapshot") * F("qty")))
            .order_by("-total_amount")[:10]
        )

        daily_series = (
            sales.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(total=Sum("total"), count=Count("id"))
            .order_by("day")
        )

        return response.Response(
            {
                "from": str(from_param),
                "to": str(to_param),
                "total_revenue": totals["total_revenue"] or 0,
                "total_profit": profit["total_profit"] or 0,
                "sale_count": sales.count(),
                "items_sold": items.aggregate(
                    items=Coalesce(
                        Sum("qty"),
                        0,
                        output_field=DecimalField(max_digits=14, decimal_places=2),
                    )
                )["items"],
                "by_cashier": by_cashier,
                "top_products": list(by_product),
                "daily_series": [
                    {"day": d["day"], "total": d["total"], "count": d["count"]}
                    for d in daily_series
                ],
            }
        )