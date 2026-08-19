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


def send_message(chat_id, text, reply_markup=None):
    """Telegram chat'ga xabar yuborish (ixtiyoriy inline keyboard bilan).

    reply_markup: Telegram InlineKeyboardMarkup dict (inline tugma ko'rsatadi).
    Xatolarni yutib yubormaydi, log qiladi.
    """
    if not chat_id or not _token():
        return False
    payload = {
        "chat_id": int(chat_id),
        "text": str(text),
        "parse_mode": "HTML",
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    req = urllib_request.Request(
        f"{API_BASE}{_token()}/sendMessage",
        data=json.dumps(payload).encode(),
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


def inline_keyboard(buttons_rows):
    """Inline tugmalar markup'ini yig'adi.

    buttons_rows: ro'yxatlar — har bir ro'yxat bitta qator.
    Har bir tugma dict: {"text": str, "callback_data": str} yoki
    {"text": str, "url": str}.
    """
    return {"inline_keyboard": buttons_rows}


def answer_callback_query(callback_query_id, text="", show_alert=False):
    """Callback tugmasi bosilganda bot "yuklanayotgan" holatni o'chiradi."""
    if not callback_query_id or not _token():
        return False
    payload = {
        "callback_query_id": str(callback_query_id),
        "text": str(text),
        "show_alert": bool(show_alert),
    }
    req = urllib_request.Request(
        f"{API_BASE}{_token()}/answerCallbackQuery",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except Exception as exc:  # noqa: BLE001
        logger.error("telegram answer_callback_query: %s", exc)
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


def format_support_application_message(app):
    """Bot /application orqali kelgan murojaat — admin Telegram xabari."""
    username = app.telegram_username or "—"
    telegram_label = f"@{username}" if username != "—" else "—"
    return (
        "📩 <b>YANGI ARIZA</b>\n"
        "━━━━━━━━━━━━━━\n"
        f"🆔 #{app.application_number or 'APP-?'}\n"
        f"👤 Ism: <b>{app.full_name}</b>\n"
        f"📞 Telefon: <code>{app.phone}</code>\n"
        f"📝 Murojaat: {app.message}\n"
        + (f"💬 Izoh: {app.note}\n" if app.note else "")
        + f"🕐 Vaqt: {_format_uz_datetime(app.created_at)}\n"
        f"👤 Telegram: {telegram_label}\n"
        "━━━━━━━━━━━━━━\n"
        "KassaPro"
    )


def set_bot_commands():
    """BotFather komandalarini ro'yxatga oladi (ihar command real ishlaydi)."""
    if not _token():
        return False
    payload = {
        "commands": [
            {"command": "start", "description": "🚀 Botni ishga tushirish"},
            {"command": "application", "description": "📝 Yangi ariza yuborish"},
            {"command": "status", "description": "📋 Ariza holatini tekshirish"},
            {"command": "help", "description": "📖 Botdan foydalanish bo'yicha yordam"},
            {"command": "contact", "description": "📞 KassaPro bilan bog'lanish"},
        ]
    }
    req = urllib_request.Request(
        f"{API_BASE}{_token()}/setMyCommands",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except Exception as exc:  # noqa: BLE001
        logger.error("telegram set_bot_commands: %s", exc)
        return False


def remove_reply_markup(chat_id, message_id):
    """Tugmalarni xabardan olib tashlash (tasdiqdan keyin qayta bosishning oldini olish)."""
    if not chat_id or not message_id or not _token():
        return False
    payload = {
        "chat_id": int(chat_id),
        "message_id": int(message_id),
        "reply_markup": {"inline_keyboard": []},
    }
    req = urllib_request.Request(
        f"{API_BASE}{_token()}/editMessageReplyMarkup",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except Exception as exc:  # noqa: BLE001
        logger.error("telegram remove_reply_markup: %s", exc)
        return False


def contact_info():
    """Bog'lanish ma'lumotlari — project config'dan (fake ma'lumot yozilmaydi).

    Website/Telegram default'lar real; telefon CONTACT_PHONE env'da bo'lmasa
    ko'rsatilmaydi (yaratma raqam chiqarib tashlanmaydi).
    """
    website = os.environ.get("CONTACT_WEBSITE", "").strip() or "https://smartkassa-1.onrender.com"
    telegram = os.environ.get("CONTACT_TELEGRAM", "").strip() or "@KassaPro_001_bot"
    phone = os.environ.get("CONTACT_PHONE", "").strip()
    tg_url = f"https://t.me/{telegram.lstrip('@')}"
    lines = ["📞 <b>KassaPro bilan bog'lanish</b>\n",
             "Savollar yoki muammolar bo'yicha biz bilan bog'laning.\n"]
    if phone:
        lines.append(f"📱 Telefon: <code>{phone}</code>")
    lines.append(f"✈️ Telegram: <b>{telegram}</b>")
    lines.append(f"🌐 Website: <code>{website}</code>")
    markup = {
        "inline_keyboard": [
            [{"text": f"✈️ {telegram}", "url": tg_url}],
            [{"text": "🌐 Saytimiz", "url": website}],
        ]
    }
    return "\n".join(lines), markup


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
        "allowed_updates": ["message", "callback_query"],
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