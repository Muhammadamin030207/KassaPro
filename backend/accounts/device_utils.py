"""Qurilma metadata yordamchilari.

User-Agent faqat metadata (display) uchun parse qilinadi — device identity
EMAS. Asosiy identifikator: persistent device_id (UUID v4, localStorage).
"""
import re

_VERSION_RE = re.compile(r"([\d.]+)")


def _version_after(ua, marker):
    idx = ua.find(marker)
    if idx == -1:
        return ""
    rest = ua[idx + len(marker):]
    m = _VERSION_RE.search(rest)
    return m.group(1) if m else ""


def parse_user_agent(ua):
    """User-Agent'dan browser va OS nomi/versiyasini ajratadi."""
    ua = ua or ""
    browser, version = "", ""

    if "Edg/" in ua:
        browser, version = "Edge", _version_after(ua, "Edg/")
    elif "OPR/" in ua:
        browser, version = "Opera", _version_after(ua, "OPR/")
    elif "SamsungBrowser/" in ua:
        browser, version = "Samsung Internet", _version_after(ua, "SamsungBrowser/")
    elif "CriOS/" in ua:
        browser, version = "Chrome (iOS)", _version_after(ua, "CriOS/")
    elif "FxiOS/" in ua:
        browser, version = "Firefox (iOS)", _version_after(ua, "FxiOS/")
    elif "Firefox/" in ua:
        browser, version = "Firefox", _version_after(ua, "Firefox/")
    elif "Chrome/" in ua:
        browser, version = "Chrome", _version_after(ua, "Chrome/")
    elif "Safari/" in ua:
        browser, version = "Safari", _version_after(ua, "Version/")
    elif "OPera" in ua:
        browser = "Opera"
    else:
        browser = "Noma'lum"

    os_name, os_ver = "", ""
    if "Windows NT 10" in ua:
        os_name, os_ver = "Windows", "10/11"
    elif "Windows NT 6.3" in ua:
        os_name, os_ver = "Windows", "8.1"
    elif "Windows NT 6.1" in ua:
        os_name, os_ver = "Windows", "7"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "Android" in ua:
        os_name, os_ver = "Android", _version_after(ua, "Android ")
    elif "iPad" in ua:
        os_name, os_ver = "iPadOS", _version_after(ua, "OS ")
    elif "iPhone" in ua:
        os_name, os_ver = "iOS", _version_after(ua, "OS ")
    elif "Mac OS X" in ua:
        os_name, os_ver = "macOS", _version_after(ua, "Mac OS X ").replace("_", ".")
    elif "CrOS" in ua:
        os_name = "ChromeOS"
    elif "Ubuntu" in ua:
        os_name = "Ubuntu"
    elif "Linux" in ua:
        os_name = "Linux"
    elif "X11" in ua:
        os_name = "Linux"
    else:
        os_name = "Noma'lum OS"

    return browser, version, os_name, os_ver


def get_client_ip(request):
    """Mijoz IP — proxy/load-balancer (Render) orqali ham ishlaydi."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def device_kind(user_agent):
    """Qurilma turi — ikona tanlash uchun (mobile/tablet/desktop)."""
    ua = user_agent or ""
    if "Tablet" in ua or "iPad" in ua:
        return "tablet"
    if "Mobile" in ua:
        return "mobile"
    return "desktop"


DEVICE_TYPES = {"laptop", "desktop", "tablet", "phone"}
MODEL_UNKNOWN = "Noutbuk modeli aniqlanmadi"
PHONE_MODEL_UNKNOWN = "Qurilma modeli aniqlanmadi"


def device_type_from_ua(user_agent):
    """User-Agent'dan qurilma turini tahlil qiladi (laptop/desktop/tablet/phone).

    Browser UA laptop bilan desktopni aniq ajrata olmaydi — client tomonidan
    yuborilgan `device_type` yetakchi, bu faqat fallback.
    """
    ua = user_agent or ""
    if "Tablet" in ua or "iPad" in ua:
        return "tablet"
    if "Mobile" in ua:
        return "phone"
    return "desktop"


DEVICE_TYPE_LABELS = {
    "laptop": "Laptop",
    "desktop": "Desktop",
    "tablet": "Tablet",
    "phone": "Smartphone",
}


def device_name_for(username, device_type=""):
    """Avtomatik qurilma nomi: "Muhammadamin's Laptop".

    Client haqiqiy nom yubormagan bo'lsa ishlatiladi. HOSTNAME brauzer orqali
    olinmaydi — username + tur kombinatsiyasi eng aniq haqiqiy nom.
    """
    label = DEVICE_TYPE_LABELS.get((device_type or "").strip().lower(), "Qurilma")
    base = (username or "Foydalanuvchi").strip()
    if not base:
        base = "Foydalanuvchi"
    name = f"{base[0].upper()}{base[1:]}'s {label}"
    return name[:255]
