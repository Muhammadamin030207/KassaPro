import os
import threading
import time
import urllib.request

from django.apps import AppConfig
from django.utils import timezone


class HealthConfig(AppConfig):
    """Keep-alive: server o'zini muntazam ping qilib "uxlab" qolishini oldini oladi.

    Render.com va shu kabi tekin hostinglar bir necha daqiqa trafik bo'lmasa
    serviceni sleep rejimiga o'tkazadi. Buning oldini olish uchun, server
    ishga tushganda (gunicorn worker'laridan bittasida) har 10 daqiqada
    o'zining PUBLIC_URL domeniga HTTP GET ping yuboradigan daemon thread
    ishga tushiriladi.
    """

    name = "health"

    def ready(self):
        # Django autoreloader'da ready() ikki marta chaqiriladi — faqat
        # asosiy jarayonda (RUN_MAIN=true) ishga tushiramiz. Gunicorn worker
        # jarayonlarida RUN_MAIN bo'lmaydi, shuning uchun ular ham ishga
        # tushadi — bir nechta ping zararsiz (idempotent).
        run_main = os.environ.get("RUN_MAIN", "")
        if run_main == "true":
            return  # autoreload'ning asosiy jarayoni — gunicorn emas
        url = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
        if not url:
            url = os.environ.get("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
        if not url:
            return
        _start_keepalive(url)


def _start_keepalive(url):
    t = threading.Thread(target=_ping_loop, args=(url,), daemon=True, name="keepalive-ping")
    t.start()


def _ping_loop(url):
    while True:
        time.sleep(600)  # har 10 daqiqa
        try:
            urllib.request.urlopen(f"{url}/api/health/", timeout=15)
        except Exception:
            # Xato bo'lsa ham davom etamiz — keyingi aylanishda qayta uriniladi.
            pass
