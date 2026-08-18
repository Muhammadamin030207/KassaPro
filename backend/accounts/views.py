import uuid

from django.contrib.auth import get_user_model
from django.db.models import Count, OuterRef, Q, Subquery
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.device_utils import (
    DEVICE_TYPES,
    MODEL_UNKNOWN,
    PHONE_MODEL_UNKNOWN,
    device_audit,
    device_kind,
    device_name_for,
    device_type_from_ua,
    get_client_ip,
    parse_user_agent,
    record_login_event,
)
from accounts.models import Device, DeviceAuditLog, DeviceSession, LoginEvent
from accounts.permissions import IsAdmin, IsOwner
from accounts.serializers import (
    DeviceSerializer,
    DeviceSessionSerializer,
    LoginEventSerializer,
    OwnerRegisterSerializer,
    SessionTokenRefreshSerializer,
    StaffCreateSerializer,
    UserSerializer,
    UserTokenObtainPairSerializer,
)

UserModel = get_user_model()

REVOKED_DETAIL = "Ushbu qurilma administrator tomonidan chiqarildi."
EXPIRED_DETAIL = "Session muddati tugagan. Qayta kiring."
BLOCKED_DETAIL = (
    "Ushbu qurilma administrator tomonidan bloklangan. "
    "Administrator ruxsatisiz bu qurilmadan hisobga kirib bo'lmaydi."
)

ActiveAction = DeviceAuditLog.Action


def _error(detail, code, http_status=status.HTTP_401_UNAUTHORIZED):
    return Response({"detail": detail, "code": code}, status=http_status)


def _current_session_id(request):
    auth = getattr(request, "auth", None)
    if auth is None or not callable(getattr(auth, "get", None)):
        return ""
    return auth.get("session_id") or ""


def _current_device_id(request):
    auth = getattr(request, "auth", None)
    if auth is None or not callable(getattr(auth, "get", None)):
        return ""
    return auth.get("device_id") or ""


def _model_display(device_type, device_model):
    if device_model:
        return device_model
    return PHONE_MODEL_UNKNOWN if (device_type or "") in ("phone", "tablet") else MODEL_UNKNOWN


class LoginView(TokenObtainPairView):
    serializer_class = UserTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = serializer.user

        device_id = (request.data.get("device_id") or "").strip()[:64]
        if not device_id:
            # Legacy client — device bindingsiz login (session nazorati yo'q).
            return Response(data)

        ua = request.META.get("HTTP_USER_AGENT", "")
        browser, bv, os_name, os_ver = parse_user_agent(ua)
        device_type = (request.data.get("device_type") or "").strip()[:16].lower()
        if device_type not in DEVICE_TYPES:
            device_type = device_type_from_ua(ua)
        device_model = (request.data.get("device_model") or "").strip()[:255]
        device_name = (request.data.get("device_name") or "").strip()[:255]
        if not device_name:
            device_name = device_name_for(user.get_username(), device_type)

        device = (
            Device.objects.select_related("blocked_by")
            .filter(user=user, device_id=device_id)
            .first()
        )

        # BLOCKED device — parol to'g'ri bo'lsa ham login rad etiladi.
        if device and device.status == Device.Status.BLOCKED:
            record_login_event(
                user, request, "blocked", device_id,
                device.device_name, device.device_model, device.device_type,
            )
            device_audit(
                None, user, ActiveAction.LOGIN_BLOCKED,
                device_id=device_id, device_name=device.device_name, request=request,
            )
            return _error(BLOCKED_DETAIL, "device_blocked", status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        auto_model = _model_display(device_type, device_model or "")
        if device is None:
            device = Device.objects.create(
                user=user,
                device_id=device_id,
                device_name=device_name,
                device_model=auto_model,
                device_type=device_type,
                browser=browser,
                browser_version=bv,
                os=os_name,
                os_version=os_ver,
                ip_address=get_client_ip(request),
                user_agent=ua,
                last_login_at=now,
            )
        else:
            updates = {
                "browser": browser,
                "browser_version": bv,
                "os": os_name,
                "os_version": os_ver,
                "ip_address": get_client_ip(request),
                "user_agent": ua,
                "last_login_at": now,
                "last_seen_at": now,
            }
            # Birinchi marta aniqlangan nom/model — keyingi loginlarda ustiga
            # yozilmaydi (egasi qo'lda tahrirlagan bo'lsa ham saqlanadi).
            if not device.is_name_manual and not device.device_name:
                updates["device_name"] = device_name
            if not device.is_model_manual and not device.device_model:
                updates["device_model"] = auto_model
            Device.objects.filter(pk=device.pk).update(**updates)

        # Bitta qurilmada eski active sessiyani almashtiramiz (bir vaqtda faqat bitta active).
        DeviceSession.objects.filter(
            device=device, status=DeviceSession.Status.ACTIVE
        ).update(status=DeviceSession.Status.EXPIRED)

        session = DeviceSession.objects.create(
            device=device,
            session_id=str(uuid.uuid4()),
            ip_address=get_client_ip(request),
            user_agent=ua,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )

        # Tokenlarga session claim'larini qo'shamiz.
        access = AccessToken(data["access"])
        access["session_id"] = session.session_id
        access["device_id"] = device_id
        data["access"] = str(access)
        refresh = RefreshToken(data["refresh"])
        refresh["session_id"] = session.session_id
        refresh["device_id"] = device_id
        data["refresh"] = str(refresh)

        session.refresh_jti = refresh.payload.get("jti", "")
        session.save(update_fields=["refresh_jti"])
        Device.objects.filter(pk=device.pk).update(last_seen_at=now)

        data["session_id"] = session.session_id
        data["device_id"] = device_id
        record_login_event(
            user, request, "success", device_id,
            device.device_name, device.device_model, device.device_type,
        )
        device_audit(
            user, user, ActiveAction.LOGIN,
            device_id=device_id, device_name=device.device_name,
            session_id=session.session_id, request=request,
        )
        return Response(data)


class RefreshView(TokenRefreshView):
    serializer_class = SessionTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        raw = request.data.get("refresh", "")
        try:
            token = RefreshToken(raw)
        except Exception:
            return _error("Refresh token yaroqsiz.", "invalid_refresh")

        session_id = token.payload.get("session_id")
        session = None
        if session_id:
            session = (
                DeviceSession.objects.select_related("device")
                .filter(session_id=session_id)
                .first()
            )
            if not session:
                return _error("Sessiya topilmadi.", "session_expired")
            if (
                session.status == DeviceSession.Status.REVOKED
                or session.device.status == Device.Status.BLOCKED
            ):
                return _error(REVOKED_DETAIL, "session_revoked")
            if session.status != DeviceSession.Status.ACTIVE:
                # EXPIRED (chiqish/almashtirilgan) — refresh ishlamaydi.
                return _error(EXPIRED_DETAIL, "session_expired")
            # Rotation tekshiruvi — eski (almashtirilgan) refresh ishlamaydi.
            if session.refresh_jti and token.payload.get("jti") != session.refresh_jti:
                return _error(REVOKED_DETAIL, "session_revoked")

        response = super().post(request, *args, **kwargs)
        if session and 200 <= response.status_code < 300:
            try:
                new_refresh = RefreshToken(response.data["refresh"])
            except Exception:
                new_refresh = None
            now = timezone.now()
            DeviceSession.objects.filter(pk=session.pk).update(
                refresh_jti=new_refresh.payload.get("jti", "") if new_refresh else "",
                last_active_at=now,
                last_login_at=now,
            )
            Device.objects.filter(pk=session.device_id).update(last_seen_at=now)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        session_id = ""
        raw = request.data.get("refresh")
        try:
            token = RefreshToken(raw)
            session_id = token.payload.get("session_id") or ""
        except Exception:
            session_id = _current_session_id(request)

        if session_id:
            session = (
                DeviceSession.objects.select_related("device")
                .filter(session_id=session_id)
                .first()
            )
            if session and session.status == DeviceSession.Status.ACTIVE:
                session.status = DeviceSession.Status.EXPIRED
                session.save(update_fields=["status"])
                dev = session.device
                record_login_event(
                    dev.user, request, "logout", dev.device_id,
                    dev.device_name, dev.device_model, dev.device_type,
                )
                device_audit(
                    dev.user, dev.user, ActiveAction.LOGOUT,
                    device_id=dev.device_id, device_name=dev.device_name,
                    session_id=session_id, request=request,
                )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _devices_queryset(user):
    """Unique Device row'lar + sessiya agregatsiyalari (bitta query)."""
    latest = DeviceSession.objects.filter(device_id=OuterRef("pk"))
    return (
        Device.objects.filter(user=user)
        .select_related("blocked_by")
        .annotate(
            active_count=Count(
                "sessions", filter=Q(sessions__status=DeviceSession.Status.ACTIVE)
            ),
            sessions_count=Count("sessions", distinct=True),
            latest_session_id=Subquery(
                latest.order_by("-last_active_at").values("session_id")[:1]
            ),
            latest_active_at=Subquery(
                latest.order_by("-last_active_at").values("last_active_at")[:1]
            ),
        )
    )


def _device_dict(d, current_device_id):
    """Bitta Device uchun API kartasi (unique — bir qurilma = bitta karta)."""
    dtype = d.device_type or device_type_from_ua(d.user_agent)
    latest_active = getattr(d, "latest_active_at", None) or d.last_seen_at
    return {
        "id": d.id,
        "session_id": getattr(d, "latest_session_id", "") or "",
        "device_id": d.device_id,
        "device_name": d.device_name or "",
        "device_model": _model_display(dtype, d.device_model),
        "device_type": dtype,
        "browser": d.browser,
        "browser_version": d.browser_version,
        "os": d.os,
        "os_version": d.os_version,
        "device_kind": device_kind(d.user_agent),
        "ip_address": d.ip_address or "",
        "location": d.location or "Noma'lum joylashuv",
        "status": d.status,
        "is_name_manual": d.is_name_manual,
        "is_model_manual": d.is_model_manual,
        "created_at": d.first_seen_at,
        "last_login_at": d.last_login_at or d.first_seen_at,
        "last_active_at": latest_active,
        "revoked_at": d.blocked_at,
        "revoked_by_name": d.blocked_by.username if d.blocked_by_id else "",
        "is_current": bool(current_device_id) and d.device_id == current_device_id,
        "active_sessions": getattr(d, "active_count", 0),
        "sessions_count": getattr(d, "sessions_count", 1),
    }


def _device_list_payload(request):
    """Unique canonical Device kartalari ro'yxati (sessiyalar alohida)."""
    qs = _devices_queryset(request.user)
    devices = [_device_dict(d, _current_device_id(request)) for d in qs]
    devices.sort(
        key=lambda d: (
            not d["is_current"],
            d["status"] == "blocked",
            -d["last_active_at"].timestamp(),
        )
    )
    return Response(
        {"count": len(devices), "results": DeviceSerializer(devices, many=True).data}
    )


class DeviceListView(APIView):
    """Admin uchun o'z hisobidagi unique qurilmalar (bitasi = bitta device)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return _device_list_payload(request)


class DeviceCurrentView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        current_device_id = _current_device_id(request)
        if not current_device_id:
            return _error("Faol qurilma topilmadi.", "session_expired")
        d = Device.objects.filter(
            user=request.user, device_id=current_device_id
        ).first()
        if not d:
            return _error("Faol qurilma topilmadi.", "session_expired")
        return Response(_device_dict(d, current_device_id))


class DeviceSessionsView(generics.ListAPIView):
    """Bitta qurilmaning session tarixi (login/logout/revoke).

    Device card bitta, tarix shu yerda — har sessionni alohida device
    deb ko'rsatmaymiz.
    """

    serializer_class = DeviceSessionSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        device = Device.objects.filter(
            pk=self.kwargs["pk"], user=self.request.user
        ).first()
        if not device:
            return DeviceSession.objects.none()
        return (
            DeviceSession.objects.filter(device=device)
            .select_related("device", "revoked_by")
            .order_by("-last_active_at")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["current_session_id"] = _current_session_id(self.request)
        return ctx


class DeviceHistoryView(generics.ListAPIView):
    """Kirish tarixi (login/chiqish/rad etilgan hodisalar)."""

    serializer_class = LoginEventSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        limit = min(int(self.request.query_params.get("page_size", 50)), 200)
        return LoginEvent.objects.filter(user=self.request.user).order_by("-created_at")[:limit]


def _get_own_device(request, pk):
    return Device.objects.filter(pk=pk, user=request.user).first()


class DeviceBlockView(APIView):
    """Qurilmani bloklash — unga tegishli active sessiyalar REVOKED.

    BLOCKED device'dan keyingi loginlar (parol to'g'ri bo'lsa ham) rad
    etiladi. Device record o'chirilmaydi — tarix saqlanib qoladi.
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        device = _get_own_device(request, pk)
        if not device:
            return Response({"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        DeviceSession.objects.filter(
            device=device, status=DeviceSession.Status.ACTIVE
        ).update(
            status=DeviceSession.Status.REVOKED,
            revoked_at=now,
            revoked_by=request.user,
        )
        Device.objects.filter(pk=device.pk).update(
            status=Device.Status.BLOCKED,
            blocked_at=now,
            blocked_by=request.user,
        )
        device_audit(
            request.user, request.user, ActiveAction.ADMIN_REVOKED_DEVICE,
            device_id=device.device_id, device_name=device.device_name,
            request=request,
        )
        return Response({"detail": "Qurilma bloklandi va chiqarildi."})


class DeviceRevokeSessionView(APIView):
    """Faqat sessiyani tugatish — Device o'zi ACTIVE qoladi.

    Revoke SESSION va BLOCK DEVICE farqi shu: bu yerda faqat joriy login
    tugaydi, qurilma keyingi loginlarga ochiq bo'ladi.
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        device = _get_own_device(request, pk)
        if not device:
            return Response({"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        current = _current_session_id(request)
        now = timezone.now()
        qs = DeviceSession.objects.filter(
            device=device, status=DeviceSession.Status.ACTIVE
        )
        if current:
            qs = qs.exclude(session_id=current)
        count = qs.update(
            status=DeviceSession.Status.REVOKED,
            revoked_at=now,
            revoked_by=request.user,
        )
        device_audit(
            request.user, request.user, ActiveAction.REVOKE_ALL,
            device_id=device.device_id, device_name=device.device_name,
            request=request, detail={"revoked_sessions": count},
        )
        msg = "Sessiya tugatildi."
        if count:
            msg = f"{count} ta sessiya tugatildi."
        return Response({"detail": msg})


class DeviceUnblockView(APIView):
    """Bloklangan qurilmaga qayta ruxsat berish (BLOCKED → ACTIVE)."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        device = _get_own_device(request, pk)
        if not device:
            return Response({"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        Device.objects.filter(pk=device.pk).update(
            status=Device.Status.ACTIVE,
            blocked_at=None,
            blocked_by=None,
        )
        device_audit(
            request.user, request.user, ActiveAction.ADMIN_UNBLOCKED_DEVICE,
            device_id=device.device_id, device_name=device.device_name,
            request=request,
        )
        return Response({"detail": "Qurilmaga qayta kirishga ruxsat berildi."})


class DeviceUpdateView(APIView):
    """Qurilma nomi/modelini qo'lda tahrirlash.

    Tahrirlangan qiymat keyingi loginlarda avtomatik aniqlash bilan
    ustidan yozilmaydi (is_*_manual flag saqlanadi).
    """

    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        device = _get_own_device(request, pk)
        if not device:
            return Response({"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND)

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

        device_audit(
            request.user, request.user, ActiveAction.ADMIN_EDITED_DEVICE,
            device_id=device.device_id,
            device_name=updates.get("device_name", device.device_name),
            request=request,
            detail=updates,
        )
        return Response({"detail": "Qurilma ma'lumotlari yangilandi."})


class DeviceBlockOthersView(APIView):
    """Boshqa barcha (joriydan tashqari) active qurilmalarni bloklash.

    Faqat active sessiyaga ega qurilmalar bloklanadi va ularning sessiyalari
    REVOKED bo'ladi. Device recordlar o'chirilmaydi.
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        current = _current_session_id(request)
        active_qs = DeviceSession.objects.filter(
            device__user=request.user, status=DeviceSession.Status.ACTIVE
        )
        if current:
            active_qs = active_qs.exclude(session_id=current)
        device_ids = list(active_qs.values_list("device_id", flat=True).distinct())
        now = timezone.now()
        count_sessions = active_qs.update(
            status=DeviceSession.Status.REVOKED,
            revoked_at=now,
            revoked_by=request.user,
        )
        count_devices = Device.objects.filter(pk__in=device_ids).update(
            status=Device.Status.BLOCKED,
            blocked_at=now,
            blocked_by=request.user,
        )
        device_audit(
            request.user, request.user, ActiveAction.REVOKE_ALL,
            request=request,
            detail={"devices": count_devices, "sessions": count_sessions},
        )
        return Response({"detail": f"{count_devices} ta qurilma chiqarildi."})


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