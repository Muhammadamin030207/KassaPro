import logging

from django.utils import timezone
from django.urls import path

logger = logging.getLogger(__name__)

from rest_framework import generics, response, status, views
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny

from accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsShopMember, IsShopMemberOrAdmin
from shops.models import AuditLog, Shop, ShopSettings, StoreApplication
from shops.serializers import (
    ApplicationCreateSerializer,
    ApplicationPatchSerializer,
    ShopSettingsSerializer,
    StoreAdminSerializer,
    StoreApplicationSerializer,
    StoreCreateSerializer,
)
from telegrambot.models import BotLog
from telegrambot.telegram_api import (
    format_application_message,
    send_admin_notification,
    send_message,
)


def write_audit(user, action, application=None, shop=None, detail=""):
    """Admin harakatini AuditLog ga yozadi (hech qachon tashlamaydi)."""
    try:
        AuditLog.objects.create(
            actor=user if (user and user.is_authenticated) else None,
            action=action,
            application=application,
            shop=shop,
            detail=str(detail or "")[:2000],
        )
    except Exception:  # noqa: BLE001 — audit xatosi biznes amalni buzmaydi
        pass


class ApplicationCreateView(views.APIView):
    """Ochiq (auth siz): yangi do'kon arizasini web form orqali qabul qilish.

    POST /api/applications/
    {
      "store_name": "Asosiy Savdo",
      "owner_name": "Aliyev Alisher",
      "phone": "+998 90 123 45 67",
      "address": "Toshkent, Chilonzor 8" (ixtiyoriy)
    }

    Ariza DBga saqlanadi (PENDING) va admin Telegram chatiga xabar yuboriladi.
    Telegram muvaffaqiyatsiz bo'lsa ham ariza yo'qolmaydi — javobda
    `telegram_sent: false` qaytadi (frontend fake-success ko'rsatmaydi).
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "application"

    def post(self, request):
        serializer = ApplicationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        app = StoreApplication.objects.create(
            store_name=serializer.validated_data["store_name"],
            owner_name=serializer.validated_data["owner_name"],
            phone=serializer.validated_data["phone"],
            email=(serializer.validated_data.get("email") or "").strip(),
            address=serializer.validated_data.get("address", ""),
            telegram_username=serializer.validated_data.get("telegram_username", "")
            or "",
            status=StoreApplication.Status.PENDING,
        )
        sent = send_admin_notification(format_application_message(app))
        if not sent:
            BotLog.objects.create(
                chat_id=None,
                text="Web ariza",
                error=(
                    "Telegram admin xabarnomasi yuborilmadi — "
                    "TELEGRAM_ADMIN_CHAT_ID yoki TELEGRAM_BOT_TOKEN tekshiring."
                ),
            )
        return response.Response(
            {
                "id": app.id,
                "store_name": app.store_name,
                "owner_name": app.owner_name,
                "phone": app.phone,
                "email": app.email,
                "address": app.address,
                "status": app.status,
                "tracking_code": app.tracking_code,
                "telegram_sent": sent,
                "message": (
                    "Ariza muvaffaqiyatli yuborildi."
                    if sent
                    else (
                        "Ariza saqlandi, lekin Telegram xabarnomasi yuborilmadi. "
                        "Admin bilan bog'lanib, arizangizni tasdiqlating."
                    )
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class ShopSettingsView(views.APIView):
    """Do'kon sozlamalari.

    GET   /api/stores/settings/              — o'qish (kassir ham ko'radi — dinamik QR uchun)
    PATCH /api/stores/settings/              — yangilash (owner yoki admin)
    PATCH /api/stores/settings/?shop_id=N    — admin boshqa do'konni ham yangilay oladi
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsShopMemberOrAdmin()]
        return [IsOwnerOrAdmin()]

    def _resolve_shop(self, request):
        user = request.user
        # Owner/kassir — o'z do'konida ishlaydi (kassir faqat o'qiydi).
        if user.is_owner or user.is_cashier:
            return user.shop
        # Admin — ?shop_id= orqali istalgan do'konni, aks holda o'z do'konini,
        # u bo'lmasa birinchi do'konni boshqaradi.
        shop_id = request.query_params.get("shop_id")
        if shop_id:
            return Shop.objects.filter(pk=shop_id).first()
        if user.shop:
            return user.shop
        return Shop.objects.order_by("id").first()

    def _get_or_create(self, request):
        shop = self._resolve_shop(request)
        if shop is None:
            raise NotFound("Do'kon topilmadi.")
        settings, _ = ShopSettings.objects.get_or_create(shop=shop)
        return settings

    def get(self, request):
        settings = self._get_or_create(request)
        return response.Response(ShopSettingsSerializer(settings).data)

    def patch(self, request):
        settings = self._get_or_create(request)
        serializer = ShopSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return response.Response(serializer.data)


class ApplicationListView(generics.ListAPIView):
    """Admin: barcha arizalar ro'yxati (pagination bilan)."""

    permission_classes = [IsAdmin]
    serializer_class = StoreApplicationSerializer

    def get_queryset(self):
        qs = StoreApplication.objects.all()
        st = self.request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs


class ApplicationRejectView(views.APIView):
    """Admin: arizani rad etadi (o'chirilmaydi)."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        app = StoreApplication.objects.filter(pk=pk).first()
        if not app:
            return response.Response(
                {"detail": "Ariza topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        note = (request.data.get("note") or "").strip()
        if not note:
            return response.Response(
                {"detail": "Rad etish sababi (note) kiritilishi shart."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        app.status = StoreApplication.Status.REJECTED
        app.processed_at = timezone.now()
        app.processed_by = request.user
        app.note = note[:255]
        app.save()
        if app.telegram_chat_id:
            send_message(
                app.telegram_chat_id,
                "❌ Arizangiz rad etildi.\n"
                f"Izoh: <b>{app.note}</b>\n"
                "Savollar uchun admin bilan bog'laning.",
            )
        write_audit(
            request.user,
            "application.rejected",
            application=app,
            detail=f"Izoh: {app.note}",
        )
        return response.Response(StoreApplicationSerializer(app).data)


class ApplicationDetailView(views.APIView):
    """Admin: bitta ariza (GET), holatini o'zgartirish (PATCH), o'chirish (DELETE)."""

    permission_classes = [IsAdmin]

    def _get(self, pk):
        app = StoreApplication.objects.filter(pk=pk).first()
        if not app:
            raise NotFound("Ariza topilmadi.")
        return app

    def get(self, request, pk):
        return response.Response(StoreApplicationSerializer(self._get(pk)).data)

    def patch(self, request, pk):
        app = self._get(pk)
        serializer = ApplicationPatchSerializer(app, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        app = serializer.save(processed_at=timezone.now(), processed_by=request.user)
        return response.Response(StoreApplicationSerializer(app).data)

    def delete(self, request, pk):
        app = self._get(pk)
        app.delete()
        return response.Response(status=status.HTTP_204_NO_CONTENT)


class StoreAdminView(views.APIView):
    """Admin: do'konlar ro'yxati (GET) + yangi do'kon/arizani tasdiqlash (POST).

    GET  /api/admin/stores/?closed=true  — do'konlar (Faol/Yopiq)
    POST /api/admin/stores/              — yangi do'kon yaratish yoki ariza tasdiqlash
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = Shop.objects.all()
        if request.query_params.get("closed") == "true":
            qs = qs.filter(is_active=False)
        qs = qs.select_related("owner").order_by("-created_at")
        serializer = StoreAdminSerializer(qs, many=True)
        return response.Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request):
        serializer = StoreCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        vd = serializer.validated_data

        # Arizadan tasdiqlanganda chat_id va email avtomatik olinadi
        chat_id = vd.get("telegram_chat_id")
        application_id = vd.get("application_id")
        app_email = ""
        if application_id:
            app = StoreApplication.objects.filter(id=application_id).first()
            if app:
                if not chat_id:
                    chat_id = app.telegram_chat_id
                app_email = (app.email or "").strip()

        data = {
            "store_name": vd["store_name"],
            "owner_name": vd["owner_name"],
            "phone": vd.get("phone", ""),
            "address": vd.get("address", ""),
            "user_id": user.id,
            "username": vd["username"],
            "password": vd["password"],
            "shop_id": user.shop.id,
        }

        if application_id:
            app = StoreApplication.objects.filter(id=application_id).first()
            if app:
                write_audit(
                    request.user,
                    "application.approved",
                    application=app,
                    shop=user.shop,
                    detail=(
                        f"Do'kon yaratildi (id={user.shop.id}), "
                        f"owner={vd['username']}."
                    ),
                )
        else:
            write_audit(
                request.user,
                "store.created",
                shop=user.shop,
                detail=f"owner={vd['username']}.",
            )

        sent = False
        if chat_id:
            sent = send_message(
                chat_id,
                "✅ <b>Do'koningiz KassaPro'ga ulandi!</b>\n\n"
                f"Do'kon: <b>{data['store_name']}</b>\n"
                f"Sayt: https://smartkassa-1.onrender.com\n\n"
                f"Login: <code>{data['username']}</code>\n"
                f"Parol: <code>{data['password']}</code>\n\n"
                "Parolni o'zgartirish uchun profilda Admin bilan bog'laning.",
            )

        # Telegram bo'lmasa — email fallback (SMTP sozlangan bo'lsa).
        email_sent = False
        email_error = ""
        delivery_channel = "telegram" if chat_id else "email"
        if not chat_id and app_email:
            from django.core.mail import send_mail

            try:
                send_mail(
                    subject="KassaPro hisobingiz tayyor",
                    message=(
                        "Assalomu alaykum!\n\n"
                        "KassaPro'ga arizangiz tasdiqlandi.\n\n"
                        f"Do'kon: {data['store_name']}\n"
                        f"Kirish: https://smartkassa-1.onrender.com/login\n\n"
                        f"Login: {data['username']}\n"
                        f"Parol: {data['password']}\n\n"
                        "Birinchi kirishdan keyin parolingizni almashtiring."
                    ),
                    from_email=None,
                    recipient_list=[app_email],
                    fail_silently=False,
                )
                email_sent = True
            except Exception as exc:  # noqa: BLE001
                logger.exception("credential email failed")
                email_error = str(exc)[:300]
        elif not chat_id and not app_email:
            delivery_channel = "none"

        # Holat kuzatuvi uchun arizada qaysi kanal ishlatilgani saqlanadi
        if application_id:
            StoreApplication.objects.filter(id=application_id).update(
                delivery_channel=delivery_channel if (sent or email_sent) else ""
            )

        data["telegram_sent"] = sent
        data["email_sent"] = email_sent
        data["delivery_channel"] = delivery_channel
        if email_sent:
            data["sent_to_email"] = app_email
        if email_error:
            data["email_error"] = email_error
        return response.Response(data, status=status.HTTP_201_CREATED)


class StoreCloseView(views.APIView):
    """Admin: do'konni yopadi (yumshoq o'chirish).

    Do'kon va egasi deaktiv qilinadi — egasi endi kira olmaydi,
    barcha qurilma seanslari bekor qilinadi. Hisob-kitob tarixi
    (savdolar, qarzlar, mijozlar) arxiv sifatida saqlanadi.
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        shop = Shop.objects.select_related("owner").filter(pk=pk).first()
        if not shop:
            raise NotFound("Do'kon topilmadi.")
        if not shop.is_active:
            return response.Response(
                {"detail": "Bu do'kon allaqachon yopilgan."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from accounts.models import Device, User as UserModel

        shop.is_active = False
        shop.save(update_fields=["is_active"])

        # Do'konning barcha a'zolari (ega + kassirlar) deaktiv — kirish bloklanadi.
        # Platforma super-admini hech qachon bloklanmaydi (is_superuser) —
        # aks holda admin o'zi bog'langan do'kon yopilganda lockout bo'lardi.
        members = UserModel.objects.filter(shop=shop, is_superuser=False)
        members.update(is_active=False)
        Device.objects.filter(user__in=members).delete()
        shop = Shop.objects.select_related("owner").get(pk=shop.pk)

        # Egasiga Telegram xabari (chat_id faqat approval ichida saqlangan bo'lsa)
        app = (
            StoreApplication.objects.filter(
                created_shop=shop, status=StoreApplication.Status.APPROVED
            ).first()
            or shop.applications.first()
        )
        if app and app.telegram_chat_id:
            try:
                send_message(
                    app.telegram_chat_id,
                    f"🏪 <b>{shop.name}</b> — do'koningiz yopildi.\n\n"
                    "Barcha ma'lumotlaringiz arxivda saqlanadi. "
                    "Qayta ochish uchun admin bilan bog'laning.",
                )
            except Exception:  # noqa: BLE001 — Telegram xatosi yopishni buzmaydi
                pass

        write_audit(
            request.user,
            "store.closed",
            shop=shop,
            application=app,
            detail=f"A'zolar: {members.count()} (deaktiv)",
        )
        return response.Response(StoreAdminSerializer(shop).data)


class StoreReopenView(views.APIView):
    """Admin: yopilgan do'konni qayta ochadi.

    Do'kon va uning a'zolari (ega + kassirlar) qayta faollashtiriladi —
    yopilish vaqtida deaktivlangan edi. Savdo/qarz tarixi arxivda saqlanadi.
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        from accounts.models import User as UserModel

        shop = Shop.objects.select_related("owner").filter(pk=pk).first()
        if not shop:
            raise NotFound("Do'kon topilmadi.")
        if shop.is_active:
            return response.Response(
                {"detail": "Bu do'kon allaqachon faol."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shop.is_active = True
        shop.save(update_fields=["is_active"])

        # Yopilishda deaktivlangan barcha a'zolar qayta ochiladi
        UserModel.objects.filter(shop=shop).update(is_active=True)

        app = (
            StoreApplication.objects.filter(
                created_shop=shop, status=StoreApplication.Status.APPROVED
            ).first()
            or shop.applications.first()
        )
        if app and app.telegram_chat_id:
            try:
                send_message(
                    app.telegram_chat_id,
                    f"🏪 <b>{shop.name}</b> — do'koningiz qayta ochildi!\n\n"
                    "Endi avvalgi login va parol bilan kira olasiz.",
                )
            except Exception:  # noqa: BLE001 — Telegram xatosi ochishni buzmaydi
                pass

        write_audit(
            request.user,
            "store.reopened",
            shop=shop,
            application=app,
            detail="Barcha a'zolar qayta faollashtirildi.",
        )
        return response.Response(StoreAdminSerializer(shop).data)

class ApplicationStatusView(views.APIView):
    """Ochiq: foydalanuvchi o'z arizasi holatini tracking_code bilan kuzatadi.

    GET /api/applications/status/?code=TRK-XXXXXXXX
    Faqat xavfsiz maydonlar qaytadi — login/parol HECH QACHON qaytmaydi.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        code = (request.query_params.get("code") or "").strip().upper()
        if not code:
            return response.Response(
                {"detail": "tracking_code kiritilmagan."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        app = StoreApplication.objects.filter(tracking_code=code).first()
        if not app:
            return response.Response(
                {"detail": "Ariza topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )

        status_text = {
            StoreApplication.Status.PENDING: "Kutilmoqda",
            StoreApplication.Status.APPROVED: "Tasdiqlangan",
            StoreApplication.Status.REJECTED: "Rad etilgan",
        }.get(app.status, app.status)

        delivered_to = ""
        if app.status == StoreApplication.Status.APPROVED and app.delivery_channel:
            delivered_to = (
                "email" if app.delivery_channel == "email" else "telegram"
                if app.delivery_channel == "telegram"
                else ""
            )

        return response.Response(
            {
                "tracking_code": app.tracking_code,
                "store_name": app.store_name,
                "status": app.status,
                "status_display": status_text,
                "note": app.note or "",
                "delivery_channel": app.delivery_channel,
                "delivered_to": delivered_to,
                "created_at": app.created_at,
                "processed_at": app.processed_at,
            }
        )
