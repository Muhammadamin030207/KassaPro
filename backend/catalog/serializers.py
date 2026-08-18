from rest_framework import serializers

from catalog.models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category = serializers.PrimaryKeyRelatedField(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.none(),
        source="category",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "barcode",
            "name",
            "price",
            "cost_price",
            "category",
            "category_id",
            "category_name",
            "stock_qty",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["category_id"].queryset = Category.objects.filter(
                shop=request.user.shop
            )

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Narx 0 dan katta bo'lishi kerak.")
        return value

    def validate_barcode(self, value):
        value = str(value).strip()
        if not value:
            raise serializers.ValidationError("Shtrix kod kiritilishi shart.")
        # Do'kon ichida barcode qat'iy unique bo'lishi kerak
        qs = Product.objects.filter(shop=self.context["request"].user.shop)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        dup = qs.filter(barcode__iexact=value).first()
        if dup:
            raise serializers.ValidationError(
                f"Bu shtrix kod '{dup.name}' mahsulotiga tegishli."
            )
        return value

    def validate_stock_qty(self, value):
        if value < 0:
            raise serializers.ValidationError("Miqdor manfiy bo'lishi mumkin emas.")
        return value

    def validate(self, attrs):
        if attrs.get("cost_price"):
            if attrs["cost_price"] <= 0:
                raise serializers.ValidationError(
                    {"cost_price": "Tannarx 0 dan katta bo'lishi kerak."}
                )
        return attrs


class ProductUpsertSerializer(serializers.ModelSerializer):
    """Shtrix kod bo'yicha create-or-update (upsert)."""

    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.none(), required=False, allow_null=True
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "barcode",
            "name",
            "price",
            "cost_price",
            "category",
            "stock_qty",
            "is_active",
        ]
        read_only_fields = ["id"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["category"].queryset = Category.objects.filter(
                shop=request.user.shop
            )

    def validate_barcode(self, value):
        value = str(value).strip()
        if not value:
            raise serializers.ValidationError("Shtrix kod kiritilishi shart.")
        # Do'kon ichida barcode qat'iy unique bo'lishi kerak.
        # Upsert usulida instance mavjud bo'lmasa ham boshqa mahsulotga tegishli
        # kodni qabul qilmaymiz (case-insensitive moslik).
        qs = Product.objects.filter(shop=self.context["request"].user.shop)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        dup = qs.filter(barcode__iexact=value).first()
        if dup:
            raise serializers.ValidationError(
                f"Bu shtrix kod '{dup.name}' mahsulotiga tegishli."
            )
        return value

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Narx 0 dan katta bo'lishi kerak.")
        return value

    def validate(self, attrs):
        # Kassa tezkor qo'shishida stock berilmasa 0 chiqib ketadi va mahsulot
        # ro'yxatda ko'rinmaydi. Default 1 qilamiz — tez qo'shilgan mahsulot
        # darhol "Mahsulotlar" bo'limida ko'rinadi va qayta skanerlansa topiladi.
        if "stock_qty" not in attrs:
            attrs["stock_qty"] = 1
        return attrs