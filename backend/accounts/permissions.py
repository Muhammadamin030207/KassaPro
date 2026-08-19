from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsOwner(BasePermission):
    """Faqat do'kon egasi (owner)."""

    message = "Faqat do'kon egasi bu amalni bajarishi mumkin."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_owner)


class IsOwnerOrAdmin(BasePermission):
    """Do'kon egasi (owner) yoki platforma admini.

    Admin (super_admin) ham do'kon egasi kabi boshqara oladi — masalan
    do'kon sozlamalari (to'lov rekvizitlari) admin tomonidan ham to'ldiriladi.
    """

    message = "Faqat do'kon egasi yoki admin bu amalni bajarishi mumkin."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and (user.is_owner or user.is_admin)
        )


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
        return getattr(obj, "shop", None) == user.shop


class IsShopMemberOrAdmin(BasePermission):
    """Do'kon xodimi (owner/kassir) yoki platforma admini.

    Admin do'konga biriktirilmagan bo'lsa ham sozlamalarni o'qiy oladi.
    """

    message = "Boshqa do'kon ma'lumotlariga kirish taqiqlangan."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        return user.shop is not None


class IsShopOwnerOrCashierReadOnly(BasePermission):
    """Owner (yoki o'z do'koniga birikkan platforma admini) to'liq huquq,
    kassir faqat o'qish."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        # Do'konga biriktirilgan super_admin ham o'z do'konini boshqara oladi
        if user.is_owner or user.is_admin:
            return True
        return request.method in SAFE_METHODS
