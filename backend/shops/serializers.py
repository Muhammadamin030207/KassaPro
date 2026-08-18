import secrets
import string

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from shops.models import Shop, ShopSettings, StoreApplication


class ShopSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSettings
        fields = [
            "payme_merchant_id",
            "payme_card",
            "click_service_id",
            "click_merchant_id",
            "click_card",
            "paynet_merchant_id",
            "paynet_card",
            "qr_card_number",
            "qr_holder",
        ]
        read_only_fields = []

    @staticmethod
    def _clean(value):
        if not value:
            return ""
        return str(value).strip()

    def validate(self, attrs):
        for field in [
            "payme_merchant_id",
            "payme_card",
            "click_service_id",
            "click_merchant_id",
            "click_card",
            "paynet_merchant_id",
            "paynet_card",
            "qr_card_number",
            "qr_holder",
        ]:
            if field in attrs:
                attrs[field] = self._clean(attrs[field])
        return attrs


class StoreApplicationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = StoreApplication
        fields = [
            "id",
            "store_name",
            "owner_name",
            "phone",
            "address",
            "telegram_chat_id",
            "telegram_username",
            "status",
            "status_display",
            "note",
            "created_at",
            "processed_at",
            "created_shop",
        ]
        read_only_fields = fields


class StoreCreateSerializer(serializers.Serializer):
    """Super Admin tomonidan yangi do'kon yaratish / arizani tasdiqlash.

    Do'kon + owner User yaratiladi. Login avtomatik generatsiya qilinadi
    (do'kon nomi asosida), parol ham avtomatik. Telegram chat_id berilgan
    bo'lsa, kredensiallar mijozga shu yerda yuboriladi.
    """

    store_name = serializers.CharField(max_length=150)
    owner_name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    telegram_chat_id = serializers.IntegerField(required=False, allow_null=True)
    application_id = serializers.IntegerField(required=False, allow_null=True)

    def _gen_username(self, store_name):
        base = "".join(ch for ch in store_name.lower() if ch.isalnum())[:20] or "dokon"
        candidate = base
        n = 1
        while User.objects.filter(username=candidate).exists():
            candidate = f"{base}{n}"
            n += 1
        return candidate

    def _gen_password(self):
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(8))

    def validate(self, attrs):
        from customers.utils import normalize_phone

        phone = attrs.get("phone", "")
        if phone:
            normalized = normalize_phone(phone)
            if not normalized:
                raise serializers.ValidationError(
                    {"phone": "Telefon raqam noto'g'ri formatda."}
                )
            attrs["phone"] = normalized
        attrs["username"] = self._gen_username(attrs["store_name"])
        attrs["password"] = self._gen_password()
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        application_id = validated_data.get("application_id")
        if application_id:
            app = StoreApplication.objects.filter(id=application_id).first()
            if not app:
                raise serializers.ValidationError(
                    {"application_id": "Ariza topilmadi."}
                )
            if app.status != StoreApplication.Status.PENDING:
                raise serializers.ValidationError(
                    {"application_id": "Bu ariza allaqachon ko'rib chiqilgan."}
                )

        phone = validated_data.get("phone", "")
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            first_name=validated_data["owner_name"],
            role=User.Role.OWNER,
            phone=phone,
        )
        shop = Shop.objects.create(
            name=validated_data["store_name"],
            owner=user,
            address=validated_data.get("address", ""),
        )
        user.shop = shop
        user.save(update_fields=["shop"])
        user._generated_password = validated_data["password"]

        if application_id:
            StoreApplication.objects.filter(id=application_id).update(
                status=StoreApplication.Status.APPROVED,
                processed_at=timezone.now(),
                created_shop=shop,
            )
        return user