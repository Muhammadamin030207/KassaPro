import json
import logging
import os
from urllib import request as urllib_request
from urllib.error import HTTPError

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot"


def _token():
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


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