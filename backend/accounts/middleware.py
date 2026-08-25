"""Qurilma o'chirilganda uning aktiv sessiyasini to'xtatish.

JWT stateless — lekin Device tombstone (is_removed=True) + token'dagi
`device_id` claim orqali o'chirilgan qurilmaning so'rovlari 401 oladi.
Qurilma qayta login bo'lsa tombstone tozalanadi (reactivate).
"""

import jwt as pyjwt
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse


def _revoked(user_id, device_id):
    key = f"devrev:{user_id}:{device_id}"
    val = cache.get(key)
    if val is not None:
        return val
    from accounts.models import Device

    val = Device.objects.filter(
        user_id=user_id, device_id=device_id, is_removed=True
    ).exists()
    cache.set(key, val, 30)
    return val


class DeviceRevokedMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Bearer ") and "/api/" in request.path:
            token = auth[7:].strip()
            try:
                claims = pyjwt.decode(
                    token, settings.SECRET_KEY, algorithms=["HS256"]
                )
                device_id = claims.get("device_id")
                user_id = claims.get("user_id")
                if device_id and user_id and _revoked(user_id, device_id):
                    return JsonResponse(
                        {"detail": "Qurilma o'chirilgan — qayta kiring."},
                        status=401,
                    )
            except Exception:  # noqa: BLE001 — token muammosi standart oqimda
                pass
        return self.get_response(request)
