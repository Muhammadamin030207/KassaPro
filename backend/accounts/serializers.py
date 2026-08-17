from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import User
from shops.models import Shop

UserModel = get_user_model()


class UserTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login javobiga foydalanuvchi ma'lumotlarini ham qo'shadi."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
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
