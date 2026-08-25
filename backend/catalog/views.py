from django.db import IntegrityError
from django.db.models import Q
from rest_framework import generics, response, status, views
from rest_framework.exceptions import NotFound, ValidationError

from accounts.permissions import IsShopOwnerOrCashierReadOnly, IsShopMember
from catalog.models import Category, Product
from catalog.serializers import (
    CategorySerializer,
    ProductSerializer,
    ProductUpsertSerializer,
)


def _auto_delete_zero_stock(product):
    """Zahirasi 0 ga tushgan mahsulotni avtomatik o'chiradi.

    Savdo tarixi saqlanadi (SaleItem SET_NULL + snapshotlar).
    """
    if product is not None and product.stock_qty <= 0:
        product.delete()


class ProductListCreateView(generics.ListCreateAPIView):
    """Mahsulotlar ro'yxati + yangi mahsulot qo'shish (faqat owner)."""

    permission_classes = [IsShopMember, IsShopOwnerOrCashierReadOnly]
    serializer_class = ProductSerializer

    def get_queryset(self):
        # Boshqaruv ro'yxati barcha mahsulotlarni ko'rsatadi — zahirasi 0 bo'lsa
        # ham edit/delete/restock qilinishi uchun ro'yxatdan chiqib ketmaydi.
        # (Kassa qidiruvi esa faqat stock>0 ni ishlatadi — by-barcode view.)
        qs = Product.objects.filter(shop=self.request.user.shop)
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

    def perform_update(self, serializer):
        product = serializer.save()
        # Zahirasini 0 qilib qo'yish = mahsulot tugadi → avtomatik o'chadi.
        _auto_delete_zero_stock(product)


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
            # Shu daqiqada shu barcode topilsa (race condition) — mavjudni yangilaymiz
            product = Product.objects.get(
                shop=request.user.shop, barcode__iexact=barcode
            )
            is_new = False
            serializer = ProductUpsertSerializer(
                product, data=data, context={"request": request}
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()

        try:
            from catalog.models import BarcodePriceMemory

            BarcodePriceMemory.objects.update_or_create(
                shop=request.user.shop,
                barcode=str(serializer.instance.barcode),
                defaults={
                    "name": serializer.instance.name,
                    "last_price": serializer.instance.price,
                },
            )
        except Exception:  # noqa: BLE001
            pass
        _auto_delete_zero_stock(serializer.instance)

        status_code = status.HTTP_201_CREATED if is_new else status.HTTP_200_OK
        resp_data = serializer.data
        resp_data["created"] = is_new
        return response.Response(resp_data, status=status_code)


class CategoryListView(generics.ListAPIView):
    permission_classes = [IsShopMember]
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(shop=self.request.user.shop)

class ProductGlobalLookupView(views.APIView):
    """Noma'lum shtrix-kodni global bazadan avtomatik taniydi.

    GET /api/products/lookup/{code}/
    Manba: Open Food Facts (bepul, kalit talab qilinmaydi, EAN-13/UPC).
    Natija 24 soat keshlanadi. Hech qachon asosiy oqimni to'smaydi —
    topilmasa {"found": false} qaytadi.
    """

    permission_classes = [IsShopMember]

    def get(self, request, code):
        import json as _json
        import urllib.request as _ur

        from django.core.cache import cache

        code = str(code or "").strip()
        if not code.isdigit() or len(code) < 8:
            return response.Response({"found": False})

        cache_key = f"off-lookup:{code}"
        cached = cache.get(cache_key)
        if cached is not None:
            return response.Response(cached)

        result = {"found": False}
        try:
            from catalog.models import BarcodePriceMemory

            mem = BarcodePriceMemory.objects.filter(
                shop=request.user.shop, barcode=code
            ).first()
            if mem:
                result = {
                    "found": True,
                    "name": mem.name or "Mahsulot",
                    "last_price": str(mem.last_price),
                    "barcode": code,
                    "source": "memory",
                }
        except Exception:  # noqa: BLE001
            pass
        try:
            url = f"https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=product_name,brands,quantity"
            req = _ur.Request(url, headers={"User-Agent": "KassaPro-POS/1.0"})
            with _ur.urlopen(req, timeout=6) as resp:
                payload = _json.loads(resp.read().decode("utf-8", errors="ignore"))
            product = (payload or {}).get("product") or {}
            name = (product.get("product_name") or "").strip()
            brand = (product.get("brands") or "").split(",")[0].strip()
            qty = (product.get("quantity") or "").strip()
            if name:
                full = f"{brand} {name}".strip() if brand and brand.lower() not in name.lower() else name
                if qty:
                    full = f"{full} ({qty})" if qty.lower() not in full.lower() else full
                result = {
                    "found": True,
                    "name": full[:150],
                    "brand": brand[:80],
                    "quantity": qty[:30],
                    "barcode": code,
                    "source": "openfoodfacts",
                }
        except Exception:  # noqa: BLE001 — tashqi xizmat muammosi oqimni to'smaydi
            result = {"found": False}

        if result.get("found") and not result.get("last_price"):
            try:
                from catalog.models import BarcodePriceMemory

                mem = BarcodePriceMemory.objects.filter(
                    shop=request.user.shop, barcode=code
                ).first()
                if mem:
                    result["last_price"] = str(mem.last_price)
            except Exception:  # noqa: BLE001
                pass
        cache.set(cache_key, result, 60 * 60 * 24)
        return response.Response(result)
