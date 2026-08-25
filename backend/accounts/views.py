import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.core.cache import cache

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.device_utils import (
    DEVICE_TYPES,
    MODEL_UNKNOWN,
    PHONE_MODEL_UNKNOWN,
    device_name_for,
    device_type_from_ua,
    get_client_ip,
    parse_user_agent,
)
from accounts.models import Device
from accounts.models import Notification
from accounts.permissions import IsAdmin, IsOwner
from accounts.serializers import (
    DeviceSerializer,
    OwnerRegisterSerializer,
    StaffCreateSerializer,
    UserSerializer,
    UserTokenObtainPairSerializer,
)

logger = logging.getLogger(__name__)

UserModel = get_user_model()


def _model_display(device_type, device_model):
    """Bo'sh modelga professional unknown-label beradi (fake model emas)."""
    if device_model:
        return device_model
    return (
        PHONE_MODEL_UNKNOWN
        if (device_type or "") in ("phone", "tablet")
        else MODEL_UNKNOWN
    )


class LoginView(TokenObtainPairView):
    """Login — JWT olish.

    To'g'ri username/password bo'lsa istalgan qurilmadan kira oladi.
    Qurilma rekordi faqat informatsion (metadatani yangilaydi/yangi qurilma
    yaratadi). Device login'ni hech qachon to'smaydi.
    """

    serializer_class = UserTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        self._record_device(request, serializer.user)
        return Response(data)

    def _record_device(self, request, user):
        """Device metadata record — ONE USER + ONE DEVICE_ID = ONE DEVICE.

        Har qanday xatolik loginni buzmasligi uchun yashirin olib o'tiladi
        (Device — LOGIN GATE EMAS).
        """
        device_id = (request.data.get("device_id") or "").strip()[:64]
        if not device_id:
            return

        ua = request.META.get("HTTP_USER_AGENT", "")
        browser, bv, os_name, os_ver = parse_user_agent(ua)
        device_type = (request.data.get("device_type") or "").strip()[:16].lower()
        if device_type not in DEVICE_TYPES:
            device_type = device_type_from_ua(ua)
        device_model = (request.data.get("device_model") or "").strip()[:255]
        device_name = (request.data.get("device_name") or "").strip()[:255]
        if not device_name:
            device_name = device_name_for(user.get_username(), device_type)

        try:
            device = Device.objects.filter(user=user, device_id=device_id).first()
            now = timezone.now()
            if device is None:
                Device.objects.create(
                    user=user,
                    device_id=device_id,
                    device_name=device_name,
                    device_model=_model_display(device_type, device_model),
                    device_type=device_type,
                    browser=browser,
                    browser_version=bv,
                    os=os_name,
                    os_version=os_ver,
                    last_login_at=now,
                )
            else:
                if device.is_removed:
                    # Qurilma o'chirilgan edi — qayta login = qayta aktivlash
                    updates["is_removed"] = False
                    updates["removed_at"] = None
                    cache.delete(f"devrev:{user.id}:{device.device_id}")
                updates = {
                    "browser": browser,
                    "browser_version": bv,
                    "os": os_name,
                    "os_version": os_ver,
                    "last_login_at": now,
                    "last_active_at": now,
                }
                # Qo'lda tahrirlangan nom/model ustiga avtomatik yozilmaydi.
                if not device.is_name_manual:
                    if device_name:
                        updates["device_name"] = device_name
                    elif not device.device_name:
                        updates["device_name"] = device_name_for(
                            user.get_username(), device_type
                        )
                if not device.is_model_manual and not device.device_model:
                    updates["device_model"] = _model_display(device_type, device_model)
                Device.objects.filter(pk=device.pk).update(**updates)
        except Exception:  # noqa: BLE001 — device metadata loginni to'smaydi
            logger.exception("device metadata not recorded for user %s", user.id)


class RefreshView(TokenRefreshView):
    """Refresh token almashinuvi (SimpleJWT standard)."""


class LogoutView(APIView):
    """Chiqish — client tokenlarni tozalaydi (server holati yo'q)."""

    permission_classes = [AllowAny]

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceListView(generics.ListAPIView):
    """O'z hisobidagi qurilmalar ro'yxati (informatsion).

    GET /api/devices/?search=...&device_type=phone&ordering=-last_active_at
    Pagination bilan — istalgancha ko'p qurilma uchun mo'ljallangan.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DeviceSerializer

    def get_queryset(self):
        qs = Device.objects.filter(user=self.request.user).select_related("user")
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(device_name__icontains=search)
                | Q(device_model__icontains=search)
                | Q(device_id__icontains=search)
            )
        dtype = self.request.query_params.get("device_type", "").strip()
        if dtype in dict(Device.Type.choices):
            qs = qs.filter(device_type=dtype)
        ordering = self.request.query_params.get("ordering", "").strip()
        allowed = {
            "first_seen_at",
            "-first_seen_at",
            "last_active_at",
            "-last_active_at",
            "last_login_at",
            "-last_login_at",
        }
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-last_active_at")
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            data = serializer.data
            response = self.get_paginated_response(data)
        else:
            serializer = self.get_serializer(queryset, many=True)
            response = Response(serializer.data)
        for d in response.data.get("results", response.data):
            d["device_model"] = _model_display(d.get("device_type", ""), d.get("device_model", ""))
        return response


class DeviceDetailView(APIView):
    """Qurilma tafsilotlari + nom/modelni qo'lda tahrirlash.

    GET  /api/devices/<id>/   — tafsilot
    PATCH /api/devices/<id>/   — faqat device_name va/ёки device_model
    """

    permission_classes = [IsAuthenticated]

    def _get_device(self, request, pk):
        return Device.objects.filter(pk=pk, user=request.user).first()

    def get(self, request, pk):
        device = self._get_device(request, pk)
        if not device:
            return Response(
                {"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        data = DeviceSerializer(device).data
        data["device_model"] = _model_display(data["device_type"], data["device_model"])
        return Response(data)

    def delete(self, request, pk):
        """Qurilmni o'chirish (kick): tombstone qo'yiladi — shu qurilmaning
        aktiv sessiyasi 401 oladi (middleware). Qayta login bo'lsa qayta
        aktivlashadi."""
        device = self._get_device(request, pk)
        if not device:
            return Response(
                {"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        Device.objects.filter(pk=device.pk).update(
            is_removed=True, removed_at=timezone.now()
        )
        cache.delete(f"devrev:{request.user.id}:{device.device_id}")
        try:
            from accounts.models import notify

            notify(
                request.user,
                "device",
                f"Qurilma o'chirildi: {device.device_name or device.device_id[:12]}",
                "Shu qurilmaning sessiyasi yopildi. Qayta login qilsa qayta faollashadi.",
            )
        except Exception:  # noqa: BLE001
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        device = self._get_device(request, pk)
        if not device:
            return Response(
                {"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )

        device_name = (request.data.get("device_name") or "").strip()[:255]
        device_model = (request.data.get("device_model") or "").strip()[:255]
        if not device_name and not device_model:
            return Response(
                {"detail": "Hech qanday o'zgarish yuborilmadi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updates = {}
        if device_name:
            updates["device_name"] = device_name
            updates["is_name_manual"] = True
        if device_model:
            updates["device_model"] = device_model
            updates["is_model_manual"] = True
        Device.objects.filter(pk=device.pk).update(**updates)
        device.refresh_from_db()
        data = DeviceSerializer(device).data
        data["device_model"] = _model_display(data["device_type"], data["device_model"])
        return Response(data)


class RegisterOwnerView(APIView):
    """PUBLIC REGISTER BIRINCHI YOPILDI — faqat Super Admin ochadi.

    Eski open-register (har kim o'zi do'kon ochsin) butunlay yopildi.
    Yangi do'konlar faqat Super Admin paneli orqali yaratiladi.
    (Bot orqali arizalar → Admin tasdiqlaydi → kredensial avtomatik beriladi.)
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = OwnerRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class StaffListCreateView(generics.ListCreateAPIView):
    """Faqat owner: o'z do'konidagi kassirlar ro'yxati va yangi kassir qo'shish."""

    serializer_class = StaffCreateSerializer
    permission_classes = [IsOwner]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return UserSerializer
        return StaffCreateSerializer

    def get_queryset(self):
        return (
            UserModel.objects.filter(shop=self.request.user.shop)
            .exclude(role=UserModel.Role.OWNER)
            .order_by("id")
        )


class StaffDeleteView(APIView):
    permission_classes = [IsOwner]

    def delete(self, request, pk):
        user = UserModel.objects.filter(
            pk=pk, shop=request.user.shop, role=UserModel.Role.CASHIER
        ).first()
        if not user:
            return Response(
                {"detail": "Kassir topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class NotificationListView(APIView):
    """GET /api/notifications/ — ro'yxat + unread count (oxirgi 50)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(user=request.user)
        unread = qs.filter(read_at__isnull=True).count()
        items = [
            {
                "id": n.id,
                "ntype": n.ntype,
                "title": n.title,
                "body": n.body,
                "read": n.read_at is not None,
                "created_at": n.created_at,
            }
            for n in qs[:50]
        ]
        return Response({"unread": unread, "results": items})


class NotificationReadView(APIView):
    """POST /api/notifications/<id>/read/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        n = Notification.objects.filter(pk=pk, user=request.user).first()
        if not n:
            return Response({"detail": "Topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        if n.read_at is None:
            n.read_at = timezone.now()
            n.save(update_fields=["read_at"])
        return Response({"ok": True})


class NotificationReadAllView(APIView):
    """POST /api/notifications/read-all/"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, read_at__isnull=True).update(
            read_at=timezone.now()
        )
        return Response({"ok": True})


class ProfileUpdateView(APIView):
    """PATCH /api/auth/profile/ — profil ma'lumotlari.

    first_name, last_name, phone, avatar (base64 data URL, <=300KB),
    shop_name (faqat owner).
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user
        data = request.data or {}

        if "first_name" in data:
            user.first_name = (data.get("first_name") or "").strip()[:150]
        if "last_name" in data:
            user.last_name = (data.get("last_name") or "").strip()[:150]
        if "phone" in data:
            from customers.utils import normalize_phone

            phone = (data.get("phone") or "").strip()
            if phone:
                normalized = normalize_phone(phone)
                if not normalized:
                    return Response(
                        {"phone": "Telefon raqam noto'g'ri."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                phone = normalized
            user.phone = phone
        if "avatar" in data:
            avatar = (data.get("avatar") or "").strip()
            if avatar and not avatar.startswith("data:image/"):
                return Response(
                    {"avatar": "Faqat rasm fayli (data URL) qabul qilinadi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(avatar) > 400_000:
                return Response(
                    {"avatar": "Rasm juda katta (max ~300KB)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.avatar = avatar

        shop_name = (data.get("shop_name") or "").strip()
        if shop_name:
            if user.role != "owner" or user.shop is None:
                return Response(
                    {"shop_name": "Faqat do'kon egasi nomni o'zgartiradi."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            user.shop.name = shop_name[:150]
            user.shop.save(update_fields=["name"])

        user.save()
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — joriy parol bilan."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.data.get("current_password") or ""
        new = request.data.get("new_password") or ""
        if not request.user.check_password(current):
            return Response(
                {"current_password": "Joriy parol noto'g'ri."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new) < 6:
            return Response(
                {"new_password": "Yangi parol kamida 6 belgidan iborat bo'lsin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(new)
        request.user.save()
        return Response({"ok": True, "detail": "Parol o'zgartirildi."})
