"""Sessiyaga bog'langan JWT autentifikatsiya.

Har bir API so'rovda token ichidagi `session_id` database'da mavjudligi va
statusi tekshiriladi. REVOKED/EXPIRED sessiya — eski access token amalga ega
bo'lsa ham 401 qaytariladi (server-side revocation).
"""
from django.utils import timezone

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from accounts.models import DeviceSession

LAST_ACTIVE_INTERVAL = 60  # sekund — har so'rovda DB write qilmaymiz


class SessionJWTAuthentication(JWTAuthentication):
    """JWT + DeviceSession status tekshiruvi."""

    keyword = "Bearer"

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        session_id = validated_token.get("session_id")
        if not session_id:
            # Legacy token (device systemdan oldin chiqarilgan) — imkon beramiz.
            return user

        session = DeviceSession.objects.only(
            "id", "user_id", "status", "last_active_at"
        ).filter(session_id=session_id, user_id=user.id).first()
        if not session:
            raise AuthenticationFailed(
                {"detail": "Sessiya topilmadi. Qayta kiring.", "code": "session_expired"},
                code="session_expired",
            )
        if session.status == DeviceSession.Status.REVOKED:
            raise AuthenticationFailed(
                {
                    "detail": "Ushbu qurilma administrator tomonidan chiqarildi.",
                    "code": "session_revoked",
                },
                code="session_revoked",
            )
        if session.status != DeviceSession.Status.ACTIVE:
            # EXPIRED (chiqish/almashish) yoki ALLOWED (unblock) — eski token
            # ishlamaydi, qurilma qayta login qilishi kerak.
            raise AuthenticationFailed(
                {"detail": "Sessiya tugagan. Qayta kiring.", "code": "session_expired"},
                code="session_expired",
            )
        # active sessiya — last_active ni 60 sekundda bir marta yangilaymiz.
        now = timezone.now()
        if not session.last_active_at or (now - session.last_active_at).total_seconds() > LAST_ACTIVE_INTERVAL:
            DeviceSession.objects.filter(pk=session.pk).update(last_active_at=now)
        return user
