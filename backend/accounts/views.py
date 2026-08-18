import uuid

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.device_utils import (
    device_audit,
    device_kind,
    get_client_ip,
    parse_user_agent,
    record_login_event,
)
from accounts.models import DeviceAuditLog, DeviceSession, LoginEvent
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

        # REVOKED device — parol to'g'ri bo'lsa ham login rad etiladi.
        if DeviceSession.objects.filter(
            user=user, device_id=device_id, status=DeviceSession.Status.REVOKED
        ).exists():
            record_login_event(user, request, "blocked", device_id)
            device_audit(
                None, user, ActiveAction.LOGIN_BLOCKED,
                device_id=device_id, request=request,
            )
            return _error(BLOCKED_DETAIL, "device_blocked", status.HTTP_403_FORBIDDEN)

        ua = request.META.get("HTTP_USER_AGENT", "")
        browser, bv, os_name, os_ver = parse_user_agent(ua)
        device_name = (request.data.get("device_name") or "").strip()[:255]
        if not device_name:
            device_name = f"{browser} — {os_name}".strip(" —")

        # Bitta qurilmada eski active sessiyani almashtiramiz (duplicate oldini).
        DeviceSession.objects.filter(
            user=user, device_id=device_id, status=DeviceSession.Status.ACTIVE
        ).update(status=DeviceSession.Status.EXPIRED)

        session = DeviceSession.objects.create(
            user=user,
            device_id=device_id,
            session_id=str(uuid.uuid4()),
            device_name=device_name,
            browser=browser,
            browser_version=bv,
            os=os_name,
            os_version=os_ver,
            ip_address=get_client_ip(request),
            user_agent=ua,
        )

        # Tokenlarga session claim'larini qo'shamiz.
        access = AccessToken(data["access"])
        access["session_id"] = session.session_id
        if device_id:
            access["device_id"] = device_id
        data["access"] = str(access)
        refresh = RefreshToken(data["refresh"])
        refresh["session_id"] = session.session_id
        if device_id:
            refresh["device_id"] = device_id
        data["refresh"] = str(refresh)

        session.refresh_jti = refresh.payload.get("jti", "")
        session.save(update_fields=["refresh_jti"])

        data["session_id"] = session.session_id
        data["device_id"] = device_id
        record_login_event(user, request, "success", device_id, session.device_name)
        device_audit(
            user, user, ActiveAction.LOGIN,
            device_id=device_id, device_name=session.device_name,
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
            session = DeviceSession.objects.filter(session_id=session_id).first()
            if not session:
                return _error("Sessiya topilmadi.", "session_expired")
            if session.status == DeviceSession.Status.REVOKED:
                return _error(REVOKED_DETAIL, "session_revoked")
            if session.status == DeviceSession.Status.EXPIRED:
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
            DeviceSession.objects.filter(pk=session.pk).update(
                refresh_jti=new_refresh.payload.get("jti", "") if new_refresh else "",
                last_active_at=timezone.now(),
                last_login_at=timezone.now(),
            )
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
            session = DeviceSession.objects.filter(session_id=session_id).first()
            if session and session.status == DeviceSession.Status.ACTIVE:
                session.status = DeviceSession.Status.EXPIRED
                session.save(update_fields=["status"])
                user = session.user
                record_login_event(user, request, "logout", session.device_id, session.device_name)
                device_audit(
                    user, user, ActiveAction.LOGOUT,
                    device_id=session.device_id, device_name=session.device_name,
                    session_id=session_id, request=request,
                )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _device_list_payload(request, qs):
    """device_id bo'yicha guruhlangan qurilmalar ro'yxati."""
    current = _current_session_id(request)
    groups = {}
    for s in qs:
        group = groups.setdefault(
            s.device_id,
            {
                "created_at": s.created_at,
                "last_login_at": s.last_login_at,
                "last_active_at": s.last_active_at,
                "last": s,
                "active_sessions": 0,
            },
        )
        if s.created_at < group["created_at"]:
            group["created_at"] = s.created_at
        if s.last_login_at > group["last_login_at"]:
            group["last_login_at"] = s.last_login_at
        if s.last_active_at > group["last_active_at"]:
            group["last_active_at"] = s.last_active_at
        if s.status == DeviceSession.Status.ACTIVE:
            group["active_sessions"] += 1

    devices = []
    for device_id, g in groups.items():
        s = g["last"]
        sessions = [sess for sess in qs if sess.device_id == device_id]
        is_current = bool(current) and any(
            sess.session_id == current for sess in sessions
        )
        devices.append(
            {
                "id": s.id,
                "session_id": s.session_id,
                "device_id": s.device_id,
                "device_name": s.device_name,
                "browser": s.browser,
                "browser_version": s.browser_version,
                "os": s.os,
                "os_version": s.os_version,
                "device_kind": device_kind(s.user_agent),
                "ip_address": s.ip_address or "",
                "location": "Noma'lum joylashuv",
                "status": s.status,
                "created_at": g["created_at"],
                "last_login_at": g["last_login_at"],
                "last_active_at": g["last_active_at"],
                "revoked_at": s.revoked_at,
                "revoked_by_name": s.revoked_by.username if s.revoked_by_id else "",
                "is_current": is_current,
                "active_sessions": g["active_sessions"],
            }
        )
    devices.sort(
        key=lambda d: (
            not d["is_current"],
            d["status"] == "expired",
            d["status"] == "allowed",
            -d["last_active_at"].timestamp(),
        )
    )
    return Response(
        {"count": len(devices), "results": DeviceSerializer(devices, many=True).data}
    )


class DeviceListView(APIView):
    """Admin uchun o'z hisobidagi barcha qurilmalar."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = (
            DeviceSession.objects.filter(user=request.user)
            .select_related("revoked_by")
            .order_by("-last_active_at")
        )
        return _device_list_payload(request, qs)


class DeviceCurrentView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        current = _current_session_id(request)
        if not current:
            return _error("Faol sessiya topilmadi.", "session_expired")
        session = (
            DeviceSession.objects.filter(session_id=current, user=request.user)
            .select_related("revoked_by")
            .first()
        )
        if not session:
            return _error("Faol sessiya topilmadi.", "session_expired")
        return Response(
            DeviceSessionSerializer(session, context={"current_session_id": current}).data
        )


class DeviceHistoryView(generics.ListAPIView):
    """Kirish tarixi (login/chiqish/rad etilgan hodisalar)."""

    serializer_class = LoginEventSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        limit = min(int(self.request.query_params.get("page_size", 50)), 200)
        return LoginEvent.objects.filter(user=self.request.user).order_by("-created_at")[:limit]


class DeviceRevokeView(APIView):
    """Qurilmani chiqarish — unga tegishli barcha sessiyalar REVOKED."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        session = (
            DeviceSession.objects.filter(pk=pk, user=request.user)
            .select_related("revoked_by")
            .first()
        )
        if not session:
            return Response({"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        current = _current_session_id(request)
        now = timezone.now()
        qs = DeviceSession.objects.filter(user=request.user, device_id=session.device_id)
        qs.exclude(session_id=current).update(
            status=DeviceSession.Status.REVOKED,
            revoked_at=now,
            revoked_by=request.user,
        )
        device_audit(
            request.user, request.user, ActiveAction.ADMIN_REVOKED_DEVICE,
            device_id=session.device_id, device_name=session.device_name,
            session_id=session.session_id, request=request,
        )
        return Response({"detail": "Qurilma chiqarildi."})


class DeviceUnblockView(APIView):
    """Bloklangan qurilmaga qayta ruxsat berish (REVOKED → ALLOWED)."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        session = (
            DeviceSession.objects.filter(pk=pk, user=request.user)
            .select_related("revoked_by")
            .first()
        )
        if not session:
            return Response({"detail": "Qurilma topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        qs = DeviceSession.objects.filter(user=request.user, device_id=session.device_id)
        qs.filter(status=DeviceSession.Status.REVOKED).update(
            status=DeviceSession.Status.ALLOWED,
            revoked_at=None,
            revoked_by=None,
        )
        device_audit(
            request.user, request.user, ActiveAction.ADMIN_UNBLOCKED_DEVICE,
            device_id=session.device_id, device_name=session.device_name,
            session_id=session.session_id, request=request,
        )
        return Response({"detail": "Qurilmaga qayta kirishga ruxsat berildi."})


class DeviceRevokeAllView(APIView):
    """Boshqa barcha (joriydan tashqari) active sessiyalarni chiqarish."""

    permission_classes = [IsAdmin]

    def post(self, request):
        current = _current_session_id(request)
        qs = DeviceSession.objects.filter(
            user=request.user, status=DeviceSession.Status.ACTIVE
        )
        if current:
            qs = qs.exclude(session_id=current)
        now = timezone.now()
        count = qs.count()
        qs.update(
            status=DeviceSession.Status.REVOKED,
            revoked_at=now,
            revoked_by=request.user,
        )
        device_audit(
            request.user, request.user, ActiveAction.REVOKE_ALL,
            request=request, detail={"revoked_sessions": count},
        )
        return Response({"detail": f"{count} ta qurilma chiqarildi."})


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