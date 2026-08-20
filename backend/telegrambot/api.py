from rest_framework import generics, response, status, views
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.serializers import CharField, ChoiceField, ModelSerializer

from accounts.permissions import IsAdmin
from telegrambot.models import CustomerApplication


class BotApplicationSerializer(ModelSerializer):
    status_display = CharField(source="get_status_display", read_only=True)

    class Meta:
        model = CustomerApplication
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
            "created_at",
            "updated_at",
        ]


class BotApplicationPatchSerializer(ModelSerializer):
    status = ChoiceField(choices=CustomerApplication.Status.choices)

    class Meta:
        model = CustomerApplication
        fields = ["status", "note"]


class BotApplicationListView(generics.ListAPIView):
    """Admin: bot arizalari ro'yxati (status bo'yicha filtr)."""

    permission_classes = [IsAdmin]
    serializer_class = BotApplicationSerializer

    def get_queryset(self):
        qs = CustomerApplication.objects.all()
        st = self.request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs


class BotApplicationDetailView(views.APIView):
    """Admin: bitta ariza (GET), statusni o'zgartirish (PATCH), o'chirish (DELETE)."""

    permission_classes = [IsAdmin]

    def _get(self, pk):
        app = CustomerApplication.objects.filter(pk=pk).first()
        if not app:
            raise NotFound("Ariza topilmadi.")
        return app

    def get(self, request, pk):
        return response.Response(BotApplicationSerializer(self._get(pk)).data)

    def patch(self, request, pk):
        app = self._get(pk)
        serializer = BotApplicationPatchSerializer(app, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return response.Response(BotApplicationSerializer(app).data)

    def delete(self, request, pk):
        self._get(pk).delete()
        return response.Response(status=status.HTTP_204_NO_CONTENT)