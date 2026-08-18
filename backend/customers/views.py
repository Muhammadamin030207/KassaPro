from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q, Sum
from django.utils import timezone
from rest_framework import generics, response, status, views

from accounts.permissions import IsShopMember
from customers.models import AuditLog, Customer, Debt, DebtPayment
from customers.serializers import (
    AuditLogSerializer,
    CustomerDetailSerializer,
    CustomerSerializer,
    DebtDetailSerializer,
    DebtPaymentCreateSerializer,
    DebtPaymentSerializer,
    DebtSerializer,
)
from customers.utils import normalize_phone


def _log(shop, actor, action, entity="", entity_id=None, detail=None):
    AuditLog.objects.create(
        shop=shop,
        actor=actor,
        action=action,
        entity=entity,
        entity_id=entity_id,
        detail=detail or {},
    )


LIVE_STATUSES = [
    Debt.Status.ACTIVE,
    Debt.Status.PARTIALLY_PAID,
    Debt.Status.OVERDUE,
]


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsShopMember]
    serializer_class = CustomerSerializer

    def get_queryset(self):
        shop = self.request.user.shop
        qs = Customer.objects.filter(shop=shop)
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(phone__icontains=search)
            )
        only_debtors = self.request.query_params.get("debtors") == "true"
        if only_debtors:
            qs = qs.filter(debts__status__in=LIVE_STATUSES).distinct()
        return qs.select_related("shop").order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(shop=self.request.user.shop, created_by=self.request.user)


class CustomerByPhoneView(views.APIView):
    permission_classes = [IsShopMember]

    def get(self, request, phone):
        shop = request.user.shop
        normalized = normalize_phone(phone)
        if not normalized:
            return response.Response(
                {"detail": "Telefon raqam noto'g'ri formatda."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        customer = (
            Customer.objects.filter(shop=shop, phone=normalized)
            .prefetch_related("debts", "debt_payments")
            .first()
        )
        if not customer:
            return response.Response(
                {"detail": "Mijoz topilmadi."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return response.Response(CustomerDetailSerializer(customer).data)


class CustomerDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsShopMember]
    serializer_class = CustomerDetailSerializer

    def get_queryset(self):
        return Customer.objects.filter(shop=self.request.user.shop)

    def perform_update(self, serializer):
        customer = self.get_object()
        old_limit = customer.credit_limit
        instance = serializer.save(shop=self.request.user.shop)
        if instance.credit_limit != old_limit:
            _log(
                shop=instance.shop,
                actor=self.request.user,
                action=AuditLog.Action.CREDIT_LIMIT_CHANGED,
                entity="Customer",
                entity_id=instance.pk,
                detail={
                    "old": str(old_limit),
                    "new": str(instance.credit_limit),
                },
            )


class DebtListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsShopMember]

    def get_serializer_class(self):
        if self.request.method == "POST":
            from customers.serializers import DebtCreateSerializer

            return DebtCreateSerializer
        return DebtSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx.update(
            {
                "shop": self.request.user.shop,
                "user": self.request.user,
            }
        )
        return ctx

    def get_queryset(self):
        shop = self.request.user.shop
        # Asosiy qoida: faqat ochiq (remaining_amount > 0) qarzlar.
        # PAID/CANCELLED — history endpointida.
        qs = (
            Debt.objects.filter(shop=shop, remaining_amount__gt=0)
            .select_related("customer", "sale")
            .order_by("due_date", "-created_at")
        )
        params = self.request.query_params
        today = timezone.localdate()
        status_value = params.get("status", "").strip()
        if status_value:
            # effective_status logikasini DB darajasida qo'llash
            settled = [Debt.Status.PAID, Debt.Status.CANCELLED]
            if status_value == Debt.Status.OVERDUE:
                qs = qs.exclude(status__in=settled).filter(
                    remaining_amount__gt=0, due_date__lt=today
                )
            elif status_value == Debt.Status.PAID:
                qs = qs.filter(remaining_amount__lte=0)
            elif status_value == Debt.Status.CANCELLED:
                qs = qs.filter(status=Debt.Status.CANCELLED)
            elif status_value == Debt.Status.ACTIVE:
                qs = qs.exclude(status__in=settled).filter(
                    remaining_amount__gt=0,
                    remaining_amount=F("original_amount"),
                    due_date__gte=today,
                )
            elif status_value == Debt.Status.PARTIALLY_PAID:
                qs = qs.exclude(status__in=settled).filter(
                    remaining_amount__gt=0,
                    remaining_amount__lt=F("original_amount"),
                    due_date__gte=today,
                )
        due = params.get("due", "").strip()
        today = timezone.localdate()
        settled = [Debt.Status.PAID, Debt.Status.CANCELLED]
        overdue_q = qs.exclude(status__in=settled).filter(
            remaining_amount__gt=0, due_date__lt=today
        )
        if due == "overdue":
            qs = overdue_q
        elif due == "today":
            qs = qs.exclude(status__in=settled).filter(
                remaining_amount__gt=0, due_date=today
            )
        elif due == "week":
            week_end = today + timedelta(days=7)
            qs = qs.exclude(status__in=settled).filter(
                remaining_amount__gt=0,
                due_date__gte=today,
                due_date__lte=week_end,
            )
        search = params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(customer__name__icontains=search)
                | Q(customer__phone__icontains=search)
            )
        sort = params.get("sort", "due_date")
        sort_map = {
            "amount": "original_amount",
            "-amount": "-original_amount",
            "due_date": "due_date",
            "-due_date": "-due_date",
            "remaining": "remaining_amount",
            "-remaining": "-remaining_amount",
        }
        if sort in sort_map:
            qs = qs.order_by(sort_map[sort])
        return qs


class DebtDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsShopMember]
    serializer_class = DebtDetailSerializer

    def get_queryset(self):
        return Debt.objects.filter(shop=self.request.user.shop)


class DebtHistoryView(generics.ListAPIView):
    """Yopilgan qarzlar tarixi — PAID va CANCELLED."""

    permission_classes = [IsShopMember]
    serializer_class = DebtSerializer

    def get_queryset(self):
        shop = self.request.user.shop
        qs = (
            Debt.objects.filter(
                shop=shop,
                status__in=[Debt.Status.PAID, Debt.Status.CANCELLED],
            )
            .select_related("customer", "sale", "paid_by")
            .order_by("-paid_at", "-created_at")
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(customer__name__icontains=search)
                | Q(customer__phone__icontains=search)
            )
        return qs


class DebtPaymentView(views.APIView):
    permission_classes = [IsShopMember]
    serializer_class = DebtPaymentCreateSerializer

    def post(self, request, pk):
        serializer = DebtPaymentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return response.Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )
        amount = serializer.validated_data["amount"]
        # To'lov atomik va row-lock bilan — race condition oldi olinadi.
        # Ikki parallel to'lov ham qarzni salbiy qila olmaydi.
        with transaction.atomic():
            debt = (
                Debt.objects.select_for_update()
                .filter(shop=request.user.shop, pk=pk)
                .select_related("customer")
                .first()
            )
            if not debt:
                return response.Response(
                    {"detail": "Qarz topilmadi."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if debt.remaining_amount <= 0:
                return response.Response(
                    {"detail": "Qarz allaqachon to'langan."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if amount > debt.remaining_amount:
                return response.Response(
                    {
                        "detail": (
                            "To'lov summasi qolgan qarzdan oshib ketdi. "
                            f"Qolgan qarz: {debt.remaining_amount} so'm."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            paid = debt.paid_amount + amount
            if paid >= debt.original_amount:
                new_status = Debt.Status.PAID
                new_remaining = Decimal("0")
                paid_at = timezone.now()
            else:
                new_status = Debt.Status.PARTIALLY_PAID
                new_remaining = debt.original_amount - paid
                paid_at = None

            debt.paid_amount = paid
            debt.remaining_amount = new_remaining
            debt.status = new_status
            if paid_at:
                debt.paid_at = paid_at
                debt.paid_by = request.user
            debt.save()

            payment = DebtPayment.objects.create(
                shop=request.user.shop,
                debt=debt,
                customer=debt.customer,
                amount=amount,
                payment_method=serializer.validated_data.get(
                    "payment_method", DebtPayment.Method.CASH
                ),
                received_by=request.user,
                note=serializer.validated_data.get("note", ""),
            )
            _log(
                shop=request.user.shop,
                actor=request.user,
                action=(
                    AuditLog.Action.DEBT_PAID
                    if new_status == Debt.Status.PAID
                    else AuditLog.Action.DEBT_PAYMENT_CREATED
                ),
                entity="Debt",
                entity_id=debt.pk,
                detail={
                    "payment": payment.pk,
                    "amount": str(amount),
                    "remaining": str(new_remaining),
                },
            )
        return response.Response(
            DebtDetailSerializer(debt).data, status=status.HTTP_201_CREATED
        )


class TopDebtorsView(views.APIView):
    permission_classes = [IsShopMember]

    def get(self, request):
        shop = request.user.shop
        top = (
            Customer.objects.filter(shop=shop, debts__status__in=LIVE_STATUSES)
            .annotate(debt_sum=Sum("debts__remaining_amount"))
            .filter(debt_sum__gt=0)
            .order_by("-debt_sum")
            .values("id", "name", "phone", debt_sum=F("debt_sum"))
        )
        return response.Response(
            [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "phone": row["phone"],
                    "balance": str(row["debt_sum"]),
                }
                for row in top[:10]
            ]
        )


class DebtStatsView(views.APIView):
    permission_classes = [IsShopMember]

    def get(self, request):
        shop = request.user.shop
        today = date.today()

        def debt_sum(queryset, column="remaining_amount"):
            return (
                queryset.annotate(remaining=F(column))
                .aggregate(total=Sum("remaining"))["total"]
                or Decimal("0")
            )

        base = Debt.objects.filter(shop=shop, status__in=LIVE_STATUSES)
        total_debt = base.aggregate(total=Sum("remaining_amount"))["total"] or Decimal(
            "0"
        )
        overdue_debt = base.filter(
            due_date__lt=today, remaining_amount__gt=0
        ).aggregate(total=Sum("remaining_amount"))["total"] or Decimal("0")
        due_today = base.filter(due_date=today).aggregate(
            total=Sum("remaining_amount")
        )["total"] or Decimal("0")
        collected = (
            DebtPayment.objects.filter(shop=shop).aggregate(total=Sum("amount"))[
                "total"
            ]
            or Decimal("0")
        )
        debtors_count = (
            Customer.objects.filter(shop=shop, debts__status__in=LIVE_STATUSES)
            .distinct()
            .count()
        )
        paid_debts_count = Debt.objects.filter(
            shop=shop, status=Debt.Status.PAID
        ).count()
        total_original = Debt.objects.filter(shop=shop).aggregate(
            total=Sum("original_amount")
        )["total"] or Decimal("0")
        average_debt = (
            (total_debt / debtors_count) if debtors_count else Decimal("0")
        )
        return response.Response(
            {
                "total_debt": str(total_debt.quantize(Decimal("0.01"))),
                "overdue_debt": str(overdue_debt.quantize(Decimal("0.01"))),
                "due_today": str(due_today.quantize(Decimal("0.01"))),
                "collected": str(collected.quantize(Decimal("0.01"))),
                "debtors_count": debtors_count,
                "paid_debts_count": paid_debts_count,
                "average_debt": str(average_debt.quantize(Decimal("0.01"))),
                "total_original": str(total_original.quantize(Decimal("0.01"))),
            }
        )


class DebtExportView(views.APIView):
    permission_classes = [IsShopMember]

    def get(self, request):
        shop = request.user.shop
        qs = (
            Debt.objects.filter(
                shop=shop, status__in=LIVE_STATUSES
            )
            .select_related("customer")
            .order_by("due_date")
        )
        filename = "qarzdorlar_{}.csv".format(
            timezone.localdate().strftime("%Y-%m-%d")
        )
        lines = [
            ";".join(
                ["#", "Mijoz", "Telefon", "Boshlang'ich qarz", "Qolgan qarz",
                 "To'langan", "Muddat", "Holat", "Phone_clean"]
            )
        ]
        for i, debt in enumerate(qs, start=1):
            lines.append(
                ";".join(
                    [
                        str(i),
                        debt.customer.name.replace(";", ","),
                        debt.customer.phone,
                        str(debt.original_amount),
                        str(debt.remaining_amount),
                        str(debt.paid_amount),
                        str(debt.due_date),
                        debt.effective_status,
                        debt.customer.phone,
                    ]
                )
            )
        payload = "\ufeff" + "\n".join(lines)
        resp = response.Response(payload, content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp


class AuditLogListView(generics.ListAPIView):
    permission_classes = [IsShopMember]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        if not (self.request.user.role_is_owner or self.request.user.is_admin):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Audit log faqat egasi/admin uchun.")
        qs = AuditLog.objects.filter(shop=self.request.user.shop).select_related(
            "actor"
        )
        action = self.request.query_params.get("action", "").strip()
        if action:
            qs = qs.filter(action=action)
        return qs[:200]