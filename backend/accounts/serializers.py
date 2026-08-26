from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import Device, User
from shops.models import Shop

UserModel = get_user_model()


class UserTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login javobiga foydalanuvchi ma'lumotlarini ham qo'shadi."""

    def validate(self, attrs):
        # Boshida/oxirida tashlab ketilgan bo'shliqlar hisobga olinmaydi
        if "username" in attrs and isinstance(attrs["username"], str):
            attrs["username"] = attrs["username"].strip()
        if "password" in attrs and isinstance(attrs["password"], str):
            attrs["password"] = attrs["password"].strip()
        data = super().validate(attrs)
        request = self.context.get("request")
        device_id = ""
        if request is not None:
            device_id = ((getattr(request, "data", {}) or {}).get("device_id") or "").strip()[:64]
        if device_id:
            from rest_framework_simplejwt.tokens import RefreshToken

            refresh = RefreshToken(data["refresh"])
            refresh["device_id"] = device_id
            data["refresh"] = str(refresh)
            data["access"] = str(refresh.access_token)
        data["user"] = UserSerializer(self.user).data
        return data


class UserSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source="shop.name", read_only=True)
    is_admin = serializers.SerializerMethodField()

    avatar = serializers.SerializerMethodField()

    class Meta:
        model = UserModel
        fields = ["id", "username", "first_name", "last_name", "phone", "avatar", "role", "shop", "shop_name", "is_admin"]

    def get_avatar(self, obj):
        return getattr(obj, "avatar", "") or None
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


class DeviceSerializer(serializers.ModelSerializer):
    """Bitta qurilma kartasi (informatsion)."""

    device_type_label = serializers.CharField(source="get_device_type_display", read_only=True)

    class Meta:
        model = Device
        fields = [
            "id",
            "device_id",
            "device_name",
            "device_model",
            "device_type",
            "device_type_label",
            "os",
            "os_version",
            "browser",
            "browser_version",
            "is_name_manual",
            "is_model_manual",
            "first_seen_at",
            "last_active_at",
            "last_login_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
        extra_kwargs = {"device_model": {"default": ""}}
