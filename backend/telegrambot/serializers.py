from rest_framework import serializers

from telegrambot.models import SupportApplication


class SupportApplicationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    status_emoji = serializers.CharField(read_only=True)

    class Meta:
        model = SupportApplication
        fields = [
            "id",
            "application_number",
            "telegram_user_id",
            "telegram_username",
            "full_name",
            "phone",
            "message",
            "note",
            "status",
            "status_display",
            "status_emoji",
            "created_at",
            "updated_at",
        ]


class SupportApplicationPatchSerializer(serializers.ModelSerializer):
    """Admin: murojaat holatini o'zgartirish (PATCH)."""

    class Meta:
        model = SupportApplication
        fields = ["status"]

    def validate_status(self, value):
        choices = [c for c, _ in SupportApplication.Status.choices]
        if value not in choices:
            raise serializers.ValidationError("Noto'g'ri status.")
        return value