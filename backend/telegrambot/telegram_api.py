import json
import logging
import os
from urllib import request as urllib_request
from urllib.error import HTTPError

from django.utils import timezone

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot"

UZ_MONTHS = [
    "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
    "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
]


def _token():
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def _format_uz_datetime(dt):
    """Misol: 18 Avgust 2026, 23:40"""
    return (
        f"{dt.day} {UZ_MONTHS[dt.month - 1]} {dt.year}, "
        f"{dt:%H:%M}"
    )


def send_message(chat_id, text):
    """Telegram chat'ga xabar yuborish. Xatolarni yutib yubormaydi, log qiladi."""
    if not chat_id or not _token():
        return False
    payload = json.dumps({
        "chat_id": int(chat_id),
        "text": str(text),
        "parse_mode": "HTML",
    }).encode()
    req = urllib_request.Request(
        f"{API_BASE}{_token()}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except HTTPError as exc:
        logger.error("telegram send_message HTTP %s: %s", exc.code, exc.read()[:300])
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("telegram send_message: %s", exc)
        return False


def format_application_message(app, base_url="https://smartkassa-1.onrender.com"):
    """Yangi ariza haqida admin Telegram xabari (professional format)."""
    now = app.processed_at or app.created_at or timezone.now()
    address = (app.address or "").strip() or "—"
    return (
        "📩 <b>YANGI ARIZA</b>\n"
        "━━━━━━━━━━━━━━\n"
        f"🏬 Do'kon: <b>{app.store_name}</b>\n"
        f"👤 Egas: <code>{app.owner_name}</code>\n"
        f"📞 Telefon: <code>{app.phone or '—'}</code>\n"
        f"📍 Manzil: {address}\n"
        f"🕐 Vaqt: {_format_uz_datetime(now)}\n"
        "━━━━━━━━━━━━━━\n"
        f"Tasdiqlash: {base_url}\n"
        "KassaPro"
    )


def admin_chat_ids():
    """TELEGRAM_ADMIN_CHAT_ID — bitta yoki vergul bilan ajratilgan raqamlar."""
    raw = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
    return [x.strip() for x in raw.split(",") if x.strip().isdigit()]


def send_admin_notification(text):
    """Barcha admin chatlariga xabar yuboradi. Qaytaradi: bool (barchasi yetsa)."""
    ids = admin_chat_ids()
    if not ids:
        return False
    return all(send_message(i, text) for i in ids)


def set_webhook(url, secret_token=""):
    """Telegram'da webhook'ni o'rnatadi (Render URL uchun)."""
    if not _token():
        raise RuntimeError("TELEGRAM_BOT_TOKEN env o'rnatilmagan.")
    payload = {
        "url": url,
        "allowed_updates": ["message"],
    }
    if secret_token:
        payload["secret_token"] = secret_token
    body = json.dumps(payload).encode()
    req = urllib_request.Request(
        f"{API_BASE}{_token()}/setWebhook",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib_request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())