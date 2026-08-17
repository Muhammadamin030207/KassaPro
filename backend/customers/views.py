from rest_framework import generics, response, status, views

from accounts.permissions import IsShopMember
from customers.models import Customer, DebtTransaction
from customers.serializers import (
    CustomerDetailSerializer,
    CustomerPaymentSerializer,
    CustomerSerializer,
)
from customers.utils import normalize_phone


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsShopMember]

    def get_serializer_class(self):
        return CustomerSerializer

    def get_queryset(self):
        qs = Customer.objects.filter(shop=self.request.user.shop)
        qs = qs.select_related("shop").prefetch_related("transactions")
        search = self.request.query_params.get("search")
        phone = self.request.query_params.get("phone")
        if phone:
            return qs.filter(phone=normalize_phone(phone))
        if search:
            return qs.filter(name__icontains=search)
        return qs

    def perform_create(self, serializer):
        serializer.save(shop=self.request.user.shop)


class CustomerByPhoneView(views.APIView):
    """Telefon bo'yicha mijozni topish (198-bilan birinchi blok).

    Topilmasa 404. Sotuvda + yaratish keyingi bosqichda.
    """

    permission_classes = [IsShopMember]

    def get(self, request, phone):
        normalized = normalize_phone(phone)
        if not normalized:
            return response.Response(
                {"detail": "Telefon raqam noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST
            )
        customer = Customer.objects.filter(
            shop=request.user.shop, phone=normalized
        ).first()
        if not customer:
            return response.Response(
                {"detail": "Mijoz topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        return response.Response(CustomerDetailSerializer(customer).data)


class CustomerDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsShopMember]
    serializer_class = CustomerDetailSerializer

    def get_queryset(self):
        return Customer.objects.filter(shop=self.request.user.shop).prefetch_related(
            "transactions"
        )


class CustomerPaymentView(views.APIView):
    """Qarzni to'lash (PAYMENT) yoki tuzatish (ADJUSTMENT)."""

    permission_classes = [IsShopMember]

    def post(self, request, pk):
        customer = Customer.objects.filter(
            shop=request.user.shop, id=pk
        ).first()
        if not customer:
            return response.Response(
                {"detail": "Mijoz topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )

        serializer = CustomerPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        txn = serializer.save(customer=customer, user=request.user)
        return response.Response(
            CustomerDetailSerializer(customer).data, status=status.HTTP_201_CREATED
        )