from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.models import DeviceSession, LoginEvent, User
from shops.models import Shop

UserModel = get_user_model()


class UserTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login javobiga foydalanuvchi ma'lumotlarini ham qo'shadi."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class SessionTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh'da yangi tokenlarga session_id/device_id claim'larini ko'chiradi."""

    def validate(self, attrs):
        data = super().validate(attrs)
        try:
            old = RefreshToken(attrs["refresh"])
        except Exception:
            return data
        session_id = old.payload.get("session_id")
        device_id = old.payload.get("device_id")
        if session_id and data.get("access") and data.get("refresh"):
            access = AccessToken(data["access"])
            access["session_id"] = session_id
            if device_id:
                access["device_id"] = device_id
            data["access"] = str(access)
            new_refresh = RefreshToken(data["refresh"])
            new_refresh["session_id"] = session_id
            if device_id:
                new_refresh["device_id"] = device_id
            data["refresh"] = str(new_refresh)
        return data


class UserSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source="shop.name", read_only=True)
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = UserModel
        fields = ["id", "username", "first_name", "last_name", "phone", "role", "shop", "shop_name", "is_admin"]
        read_only_fields = ["id"]

    def get_is_admin(self, obj):
        return obj.is_admin


class StaffCreateSerializer(serializers.ModelSerializer):
    """Owner tomonidan yangi kassir qo'shish."""

    password = serializers.CharField(write_only=True, min_length=6)
    generated_password = serializers.SerializerMethodField()

    class Meta:
        model = UserModel
        fields = ["id", "username", "first_name", "last_name", "phone", "password", "role", "generated_password"]
        read_only_fields = ["id", "role"]

    def validate_username(self, value):
        if UserModel.objects.filter(username=value).exists():
            raise serializers.ValidationError("Bu login band.")
        return value

    def get_generated_password(self, obj):
        # Faqat yangi yaratilgan holatda ko'rsatiladi
        return getattr(obj, "_generated_password", None)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = UserModel(**validated_data)
        user.role = User.Role.CASHIER
        user.shop = self.context["request"].user.shop
        user.set_password(password)
        user.save()
        user._generated_password = password
        return user


class OwnerRegisterSerializer(serializers.Serializer):
    """Yangi do'kon egasi ro'yxatdan o'tishi + do'kon yaratish."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=6)
    shop_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_username(self, value):
        if UserModel.objects.filter(username=value).exists():
            raise serializers.ValidationError("Bu login band.")
        return value

    def validate(self, attrs):
        phone = attrs.get("phone", "")
        if phone:
            from customers.utils import normalize_phone

            normalized = normalize_phone(phone)
            if not normalized:
                raise serializers.ValidationError(
                    {"phone": "Telefon raqam noto'g'ri formatda."}
                )
            attrs["phone"] = normalized
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = UserModel.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            phone=validated_data.get("phone", ""),
            role=User.Role.OWNER,
        )
        shop = Shop.objects.create(
            name=validated_data["shop_name"],
            owner=user,
            address=validated_data.get("address", ""),
        )
        user.shop = shop
        user.save(update_fields=["shop"])
        return user


class DeviceSessionSerializer(serializers.ModelSerializer):
    """Bitta sessiya/qurilma ma'lumotlari."""

    device_kind = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()
    revoked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DeviceSession
        fields = [
            "id",
            "session_id",
            "device_id",
            "device_name",
            "device_model",
            "device_type",
            "browser",
            "browser_version",
            "os",
            "os_version",
            "device_kind",
            "ip_address",
            "location",
            "user_agent",
            "status",
            "created_at",
            "last_login_at",
            "last_active_at",
            "revoked_at",
            "revoked_by_name",
            "is_current",
        ]

    def get_device_kind(self, obj):
        from accounts.device_utils import device_kind

        return device_kind(getattr(obj, "user_agent", "") or "")

    def get_is_current(self, obj):
        current = self.context.get("current_session_id")
        return bool(current) and obj.session_id == current

    def get_revoked_by_name(self, obj):
        if obj.revoked_by_id:
            return getattr(obj.revoked_by, "username", "")
        return ""


class DeviceSerializer(serializers.Serializer):
    """device_id bo'yicha guruhlangan qurilma kartasi."""

    id = serializers.IntegerField()
    session_id = serializers.CharField()
    device_id = serializers.CharField()
    device_name = serializers.CharField()
    device_model = serializers.CharField()
    device_type = serializers.CharField()
    browser = serializers.CharField()
    browser_version = serializers.CharField()
    os = serializers.CharField()
    os_version = serializers.CharField()
    device_kind = serializers.CharField()
    ip_address = serializers.CharField()
    location = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    last_login_at = serializers.DateTimeField()
    last_active_at = serializers.DateTimeField()
    revoked_at = serializers.DateTimeField(allow_null=True)
    revoked_by_name = serializers.CharField()
    is_current = serializers.BooleanField()
    active_sessions = serializers.IntegerField()


class LoginEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoginEvent
        fields = [
            "id",
            "device_name",
            "device_model",
            "device_type",
            "browser",
            "browser_version",
            "os",
            "os_version",
            "ip_address",
            "result",
            "created_at",
        ]
