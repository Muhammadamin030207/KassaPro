from django.utils import timezone
from rest_framework import generics, response, status, views
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny

from accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsShopMember, IsShopMemberOrAdmin
from shops.models import Shop, ShopSettings, StoreApplication
from shops.serializers import (
    ApplicationCreateSerializer,
    ApplicationPatchSerializer,
    ShopSettingsSerializer,
    StoreApplicationSerializer,
    StoreCreateSerializer,
)
from telegrambot.models import BotLog
from telegrambot.telegram_api import (
    format_application_message,
    send_admin_notification,
    send_message,
)


class ApplicationCreateView(views.APIView):
    """Ochiq (auth siz): yangi do'kon arizasini web form orqali qabul qilish.

    POST /api/applications/
    {
      "store_name": "Asosiy Savdo",
      "owner_name": "Aliyev Alisher",
      "phone": "+998 90 123 45 67",
      "address": "Toshkent, Chilonzor 8" (ixtiyoriy)
    }

    Ariza DBga saqlanadi (PENDING) va admin Telegram chatiga xabar yuboriladi.
    Telegram muvaffaqiyatsiz bo'lsa ham ariza yo'qolmaydi — javobda
    `telegram_sent: false` qaytadi (frontend fake-success ko'rsatmaydi).
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "application"

    def post(self, request):
        serializer = ApplicationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        app = StoreApplication.objects.create(
            store_name=serializer.validated_data["store_name"],
            owner_name=serializer.validated_data["owner_name"],
            phone=serializer.validated_data["phone"],
            address=serializer.validated_data.get("address", ""),
            telegram_username=serializer.validated_data.get("telegram_username", "")
            or "",
            status=StoreApplication.Status.PENDING,
        )
        sent = send_admin_notification(format_application_message(app))
        if not sent:
            BotLog.objects.create(
                chat_id=None,
                text="Web ariza",
                error=(
                    "Telegram admin xabarnomasi yuborilmadi — "
                    "TELEGRAM_ADMIN_CHAT_ID yoki TELEGRAM_BOT_TOKEN tekshiring."
                ),
            )
        return response.Response(
            {
                "id": app.id,
                "store_name": app.store_name,
                "owner_name": app.owner_name,
                "phone": app.phone,
                "address": app.address,
                "status": app.status,
                "telegram_sent": sent,
                "message": (
                    "Ariza muvaffaqiyatli yuborildi."
                    if sent
                    else (
                        "Ariza saqlandi, lekin Telegram xabarnomasi yuborilmadi. "
                        "Admin bilan bog'lanib, arizangizni tasdiqlating."
                    )
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class ShopSettingsView(views.APIView):
    """Do'kon sozlamalari.

    GET   /api/stores/settings/              — o'qish (kassir ham ko'radi — dinamik QR uchun)
    PATCH /api/stores/settings/              — yangilash (owner yoki admin)
    PATCH /api/stores/settings/?shop_id=N    — admin boshqa do'konni ham yangilay oladi
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsShopMemberOrAdmin()]
        return [IsOwnerOrAdmin()]

    def _resolve_shop(self, request):
        user = request.user
        # Owner/kassir — o'z do'konida ishlaydi (kassir faqat o'qiydi).
        if user.is_owner or user.is_cashier:
            return user.shop
        # Admin — ?shop_id= orqali istalgan do'konni, aks holda o'z do'konini,
        # u bo'lmasa birinchi do'konni boshqaradi.
        shop_id = request.query_params.get("shop_id")
        if shop_id:
            return Shop.objects.filter(pk=shop_id).first()
        if user.shop:
            return user.shop
        return Shop.objects.order_by("id").first()

    def _get_or_create(self, request):
        shop = self._resolve_shop(request)
        if shop is None:
            raise NotFound("Do'kon topilmadi.")
        settings, _ = ShopSettings.objects.get_or_create(shop=shop)
        return settings

    def get(self, request):
        settings = self._get_or_create(request)
        return response.Response(ShopSettingsSerializer(settings).data)

    def patch(self, request):
        settings = self._get_or_create(request)
        serializer = ShopSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return response.Response(serializer.data)


class ApplicationListView(generics.ListAPIView):
    """Admin: barcha arizalar ro'yxati (pagination bilan)."""

    permission_classes = [IsAdmin]
    serializer_class = StoreApplicationSerializer

    def get_queryset(self):
        qs = StoreApplication.objects.all()
        st = self.request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs


class ApplicationRejectView(views.APIView):
    """Admin: arizani rad etadi (o'chirilmaydi)."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        app = StoreApplication.objects.filter(pk=pk).first()
        if not app:
            return response.Response(
                {"detail": "Ariza topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        app.status = StoreApplication.Status.REJECTED
        app.processed_at = timezone.now()
        app.processed_by = request.user
        app.note = (request.data.get("note") or "")[:255]
        app.save()
        if app.telegram_chat_id:
            send_message(
                app.telegram_chat_id,
                "❌ Arizangiz rad etildi.\n"
                + (f"Izoh: <b>{app.note}</b>\n" if app.note else "")
                + "Savollar uchun admin bilan bog'laning.",
            )
        return response.Response(StoreApplicationSerializer(app).data)


class ApplicationDetailView(views.APIView):
    """Admin: bitta ariza (GET), holatini o'zgartirish (PATCH), o'chirish (DELETE)."""

    permission_classes = [IsAdmin]

    def _get(self, pk):
        app = StoreApplication.objects.filter(pk=pk).first()
        if not app:
            raise NotFound("Ariza topilmadi.")
        return app

    def get(self, request, pk):
        return response.Response(StoreApplicationSerializer(self._get(pk)).data)

    def patch(self, request, pk):
        app = self._get(pk)
        serializer = ApplicationPatchSerializer(app, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        app = serializer.save(processed_at=timezone.now(), processed_by=request.user)
        return response.Response(StoreApplicationSerializer(app).data)

    def delete(self, request, pk):
        app = self._get(pk)
        app.delete()
        return response.Response(status=status.HTTP_204_NO_CONTENT)


class StoreCreateView(views.APIView):
    """Admin: yangi do'kon yaratish yoki arizani tasdiqlash.

    POST /api/admin/stores/
    {
      "store_name", "owner_name", "phone", "address",
      "telegram_chat_id", "application_id" (ixtiyoriy)
    }
    Do'kon + owner yaratiladi, login/parol Telegram orqali yuboriladi.
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = StoreCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        vd = serializer.validated_data

        # Arizadan tasdiqlanganda chat_id avtomatik olinadi (admin ko'rsatmasa)
        chat_id = vd.get("telegram_chat_id")
        application_id = vd.get("application_id")
        if not chat_id and application_id:
            app = StoreApplication.objects.filter(id=application_id).first()
            if app:
                chat_id = app.telegram_chat_id

        data = {
            "store_name": vd["store_name"],
            "owner_name": vd["owner_name"],
            "phone": vd.get("phone", ""),
            "address": vd.get("address", ""),
            "user_id": user.id,
            "username": vd["username"],
            "password": vd["password"],
            "shop_id": user.shop.id,
        }

        sent = False
        if chat_id:
            sent = send_message(
                chat_id,
                "✅ <b>Do'koningiz KassaPro'ga ulandi!</b>\n\n"
                f"Do'kon: <b>{data['store_name']}</b>\n"
                f"Sayt: https://smartkassa-1.onrender.com\n\n"
                f"Login: <code>{data['username']}</code>\n"
                f"Parol: <code>{data['password']}</code>\n\n"
                "Parolni o'zgartirish uchun profilda Admin bilan bog'laning.",
            )
        data["telegram_sent"] = sent
        return response.Response(data, status=status.HTTP_201_CREATED)