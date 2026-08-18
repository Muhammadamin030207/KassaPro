from django.utils import timezone
from rest_framework import generics, response, status, views

from accounts.permissions import IsAdmin, IsOwner, IsShopMember
from shops.models import Shop, ShopSettings, StoreApplication
from shops.serializers import (
    ShopSettingsSerializer,
    StoreApplicationSerializer,
    StoreCreateSerializer,
)
from telegrambot.telegram_api import send_message


class ShopSettingsView(views.APIView):
    """Do'kon sozlamalari.

    GET   /api/stores/settings/  — o'qish (kassir ham ko'radi — dinamik QR uchun)
    PATCH /api/stores/settings/  — yangilash (faqat owner)
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsShopMember()]
        return [IsOwner()]

    def _get_or_create(self, request):
        shop = request.user.shop
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