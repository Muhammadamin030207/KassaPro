from django.utils import timezone
from rest_framework import response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Yengil health-check — server tirikligini tekshirish uchun.

    Keep-alive ping / monitoring shu endpointga uriladi. Hech qanday
    ma'lumot talab qilmaydi, auth shart emas.
    """
    return response.Response(
        {"status": "ok", "timestamp": timezone.now().isoformat()}
    )
