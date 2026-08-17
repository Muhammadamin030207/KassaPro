from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsOwner(BasePermission):
    """Faqat do'kon egasi (owner)."""

    message = "Faqat do'kon egasi bu amalni bajarishi mumkin."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_owner)


class IsAdmin(BasePermission):
    """Faqat Super Admin (platforma administratori).

    Super admin hech qaysi do'konga egalik qilmaydi, arizalarni ko'radi,
    yangi do'konlar yaratadi va tasdiqlaydi. Owner/kassir buni ko'ra olmaydi.
    Django superuser (is_superuser) ham admin hisoblanadi.
    """

    message = "Faqat Super Admin bu amalni bajarishi mumkin."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class IsShopMember(BasePermission):
    """Foydalanuvchi o'z do'koniga tegishli ob'ektlarga kirish huquqini tekshiradi."""

    message = "Boshqa do'kon ma'lumotlariga kirish taqiqlangan."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.shop is not None)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_owner:
            return getattr(obj, "shop", None) == user.shop
        return getattr(obj, "shop", None) == user.shop


class IsShopOwnerOrCashierReadOnly(BasePermission):
    """Owner to'liq huquq, kassir faqat o'qish."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_owner:
            return True
        return request.method in SAFE_METHODS
