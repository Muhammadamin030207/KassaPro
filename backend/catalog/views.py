from django.db import IntegrityError
from django.db.models import Q
from rest_framework import generics, response, status, views
from rest_framework.exceptions import ValidationError

from accounts.permissions import IsShopOwnerOrCashierReadOnly, IsShopMember
from catalog.models import Category, Product
from catalog.serializers import (
    CategorySerializer,
    ProductSerializer,
    ProductUpsertSerializer,
)


class ProductListCreateView(generics.ListCreateAPIView):
    """Mahsulotlar ro'yxati + yangi mahsulot qo'shish (faqat owner)."""

    permission_classes = [IsShopMember, IsShopOwnerOrCashierReadOnly]
    serializer_class = ProductSerializer

    def get_queryset(self):
        # Stocki tugagan (0 yoki kam) mahsulotlar ro'yxatdan butunlay chiqib ketadi.
        qs = Product.objects.filter(shop=self.request.user.shop, stock_qty__gt=0)
        search = self.request.query_params.get("search")
        barcode = self.request.query_params.get("barcode")

        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(barcode__icontains=search)
            )
        if barcode:
            qs = qs.filter(barcode__iexact=barcode)

        # Eng avval skaner qidiruvlari uchun nom bo'yicha sortlash
        qs = qs.order_by("name")
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(shop=request.user.shop)
        return response.Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsShopMember, IsShopOwnerOrCashierReadOnly]
    serializer_class = ProductSerializer
    lookup_field = "pk"

    def get_queryset(self):
        return Product.objects.filter(shop=self.request.user.shop)


class ProductByBarcodeView(generics.RetrieveAPIView):
    """Kassa uchun barcode bo'yicha aniq moslik (tezkor qidiruv).

    Case-insensitive moslik (iexact) — fizik skanerlar ba'zan
    harf ishtirokida kod yuboradi. Har qanday holatda bitta natija
    qaytariladi, chunki (shop, barcode) qat'iy unique.
    """

    permission_classes = [IsShopMember]
    serializer_class = ProductSerializer
    lookup_field = "barcode"
    lookup_url_kwarg = "code"

    def get_queryset(self):
        # Kassa qidiruvi mahsulotlar ro'yxati bilan bir xil qoidada ishlaydi:
        # zahirasi 0 yoki aktiv bo'lmagan mahsulot "mavjud emas" hisoblanadi,
        # shunda kassada "Bunday mahsulot yo'q" paneli chiqadi va oqim to'xtamaydi.
        return Product.objects.filter(shop=self.request.user.shop, is_active=True, stock_qty__gt=0)

    def get_object(self):
        qs = self.get_queryset()
        code = str(self.kwargs.get(self.lookup_url_kwarg, "")).strip()
        try:
            return qs.get(barcode__iexact=code)
        except Product.DoesNotExist:
            from rest_framework.exceptions import NotFound

            raise NotFound({"detail": "Bunday mahsulot bazada topilmadi"})


class ProductUpsertByBarcodeView(views.APIView):
    """Barcode bo'yicha create-or-update (upsert).

    Kod mavjud bo'lsa yangilanadi, mavjud bo'lmasa yaratiladi.
    Kassada nomavjud mahsulot tez qo'shilsa ham chek davom etishi uchun
    do'kon a'zolari (owner yoki kassir) qo'sha oladi.
    """

    permission_classes = [IsShopMember]

    def put(self, request):
        data = request.data
        barcode = str(data.get("barcode", "")).strip()
        if not barcode:
            raise ValidationError({"barcode": "Shtrix kod kiritilishi shart."})

        product = Product.objects.filter(
            shop=request.user.shop, barcode__iexact=barcode
        ).first()
        is_new = product is None

        serializer = ProductUpsertSerializer(
            product, data=data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save(shop=request.user.shop)
        except IntegrityError:
            # Shu daqiqada shu barcode.sh topilsa (race condition)
            product = Product.objects.get(shop=request.user.shop, barcode__iexact=barcode)
            serializer = ProductUpsertSerializer(
                product, data=data, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()

        status_code = status.HTTP_201_CREATED if is_new else status.HTTP_200_OK
        resp_data = serializer.data
        resp_data["created"] = is_new
        return response.Response(resp_data, status=status_code)


class CategoryListView(generics.ListAPIView):
    permission_classes = [IsShopMember]
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(shop=self.request.user.shop)