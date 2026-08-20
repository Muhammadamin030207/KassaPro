import hashlib
import hmac
import json
import logging
import os

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Device
from shops.models import StoreApplication
from telegrambot.models import BotLog

logger = logging.getLogger(__name__)

MAX_INIT_DATA_AGE = 12 * 60 * 60  # Telegram WebApp initData 1 kun amal qiladi;
# biz yanada qattiqroq — 12 soat (auth_date tekshiruvi).


def _bot_token():
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def validate_init_data(init_data):
    """Telegram WebApp initData imzosini HMAC-SHA256 bilan tekshiradi.

    Imzo bot tokeni (faqat backend ENV'da) bilan yaratiladi:
      1. secret_key = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
      2. data_check_string = sorted "key=value" qatorlari (\\n bilan birlashgan)
      3. hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
    Haqiqiy Telegram'mi yoki soxta so'rovmi — faqat shu tekshiruv orqali
    bilinadi. Javob: {"user": {...}} dict yoki None.
    """
    token = _bot_token()
    if not token or not init_data:
        return None
    try:
        pairs = {}
        for part in init_data.split("&"):
            if "=" not in part:
                continue
            k, _, v = part.partition("=")
            from urllib.parse import unquote

            pairs[k.strip()] = unquote(v)
        received_hash = pairs.pop("hash", "")
        if not received_hash:
            return None

        secret_key = hmac.new(
            key=b"WebAppData", msg=token.encode(), digestmod=hashlib.sha256
        ).digest()

        data_check_string = "\n".join(
            f"{k}={pairs[k]}" for k in sorted(pairs)
        )
        computed_hash = hmac.new(
            key=secret_key, msg=data_check_string.encode(), digestmod=hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(computed_hash, received_hash):
            return None

        auth_date = int(pairs.get("auth_date", 0))
        if auth_date and (timezone.now().timestamp() - auth_date) > MAX_INIT_DATA_AGE:
            return None

        user = json.loads(pairs.get("user") or "{}")
        if not user or not user.get("id"):
            return None
        return {"user": user, "auth_date": auth_date}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Telegram initData parse failed: %s", exc)
        return None


def _latest_application(chat_id):
    return (
        StoreApplication.objects.filter(telegram_chat_id=chat_id)
        .order_by("-id")
        .first()
    )


class MiniAppStatusView(APIView):
    """Mini App: ariza holati (initData bilan farqlanadi).

    POST /api/miniapp/status/
    {"init_data": "<Telegram WebApp.initData>"}
    """

    permission_classes = [AllowAny]

    def post(self, request):
        verified = validate_init_data(request.data.get("init_data", ""))
        if not verified:
            return Response(
                {"detail": "Telegram imzosi tasdiqlanmadi."},
                status=status.HTTP_403_FORBIDDEN,
            )
        chat_id = verified["user"]["id"]
        app = _latest_application(chat_id)
        if not app:
            return Response(
                {
                    "has_application": False,
                    "message": "Siz hali ariza qoldirmagansiz.",
                }
            )
        usable = bool(app.created_shop_id and app.status == StoreApplication.Status.APPROVED)
        return Response(
            {
                "has_application": True,
                "application": {
                    "id": app.id,
                    "store_name": app.store_name,
                    "owner_name": app.owner_name,
                    "phone": app.phone,
                    "status": app.status,
                    "status_display": app.get_status_display(),
                    "note": app.note,
                    "created_at": app.created_at.isoformat(),
                    "processed_at": (
                        app.processed_at.isoformat() if app.processed_at else None
                    ),
                },
                "username": verified["user"].get("username") or "",
                "first_name": verified["user"].get("first_name") or "",
                "can_login": usable,
            }
        )


class MiniAppLoginView(APIView):
    """Mini App: tasdiqlangan do'kon egasiga avto-login (JWT berish).

    Faqat arizasi APPROVED bo'lgan va uni tasdiqlash vaqtida
    telegram_chat_id qayd etilgan egaga JWT beriladi. Boshqa hech kim
    bu yo'l bilan kira olmaydi (imzo backend ENV dagi bot tokeni bilan
    tekshiriladi).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        verified = validate_init_data(request.data.get("init_data", ""))
        if not verified:
            return Response(
                {"detail": "Telegram imzosi tasdiqlanmadi."},
                status=status.HTTP_403_FORBIDDEN,
            )
        chat_id = verified["user"]["id"]
        app = _latest_application(chat_id)
        if not app or app.status != StoreApplication.Status.APPROVED or not app.created_shop_id:
            return Response(
                {
                    "detail": "Avto-login faqat tasdiqlangan do'kon egalari uchun.",
                    "status": app.status if app else None,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        shop = app.created_shop
        if not shop.is_active or not shop.owner.is_active:
            return Response(
                {"detail": "Do'kon yopilgan — kirish taqiqlangan."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user = shop.owner
        refresh = RefreshToken.for_user(user)
        self._record_device(request, user, verified["user"])
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "first_name": user.first_name,
                    "role": user.role,
                    "shop": user.shop_id,
                    "shop_name": shop.name,
                },
            }
        )

    def _record_device(self, request, user, tg_user):
        try:
            device_id = (
                f"tg-{tg_user.get('id', user.id)}-{(request.data.get('device_id') or '')[:40]}"
            ).strip("-")
            Device.objects.get_or_create(
                user=user,
                device_id=device_id,
                defaults={
                    "device_name": f"Telegram Mini App",
                    "device_model": (tg_user.get("first_name") or "")[:255],
                    "device_type": "phone",
                    "os": "Telegram",
                    "last_login_at": timezone.now(),
                    "last_active_at": timezone.now(),
                },
            )
        except Exception:  # noqa: BLE001 — device metadata loginni buzmaydi
            logger.exception("miniapp device record failed for %s", user.id)