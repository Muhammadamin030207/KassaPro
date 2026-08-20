from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from shops.models import StoreApplication
from shops.views import ApplicationCreateView
from telegrambot.models import BotLog


class ApplicationCreateViewTests(APITestCase):
    """Web form orqali ariza qabul qilish (POST /api/applications/)."""

    URL = "/api/applications/"

    def _payload(self, **overrides):
        data = {
            "store_name": "Test Do'kon",
            "owner_name": "Aliyev Alisher",
            "phone": "+998 90 123 45 67",
            "address": "Toshkent, Chilonzor",
        }
        data.update(overrides)
        return data

    @mock.patch("shops.views.send_admin_notification", return_value=True)
    def test_valid_application_saved_and_notified(self, mock_send):
        resp = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["telegram_sent"])
        self.assertIn("muvaffaqiyatli", resp.data["message"])

        self.assertEqual(StoreApplication.objects.count(), 1)
        app = StoreApplication.objects.first()
        self.assertEqual(app.store_name, "Test Do'kon")
        self.assertEqual(app.phone, "+998901234567")
        self.assertEqual(app.status, StoreApplication.Status.PENDING)

        # Admin xabari professional formatda va barcha fieldlarni o'z ichiga oladi
        mock_send.assert_called_once()
        msg = mock_send.call_args[0][0]
        self.assertIn("YANGI ARIZA", msg)
        self.assertIn("Test Do'kon", msg)
        self.assertIn("Aliyev Alisher", msg)
        self.assertIn("+998901234567", msg)
        self.assertIn("Toshkent, Chilonzor", msg)

    @mock.patch("shops.views.send_admin_notification", return_value=False)
    def test_telegram_failure_still_saved_and_reported(self, mock_send):
        resp = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(resp.data["telegram_sent"])
        self.assertEqual(StoreApplication.objects.count(), 1)
        # Xato yashirin o'tib ketmasligi uchun BotLog'ga yoziladi
        self.assertTrue(BotLog.objects.filter(text="Web ariza").exists())

    def test_public_no_auth_required(self):
        with mock.patch("shops.views.send_admin_notification", return_value=False):
            resp = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_missing_store_name_rejected(self):
        resp = self.client.post(self.URL, self._payload(store_name="   "), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(StoreApplication.objects.count(), 0)
        self.assertIn("Do'kon nomi", str(resp.data))

    def test_missing_owner_name_rejected(self):
        resp = self.client.post(self.URL, self._payload(owner_name=""), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_phone_rejected(self):
        resp = self.client.post(self.URL, self._payload(phone="abc"), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Telefon raqami", str(resp.data))

    def test_short_phone_rejected(self):
        resp = self.client.post(self.URL, self._payload(phone="+998 12"), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_throttle_scope_configured(self):
        self.assertEqual(ApplicationCreateView.throttle_scope, "application")


class ApplicationDetailViewTests(APITestCase):
    """Admin: ariza ko'rish/status/o'chirish (GET/PATCH/DELETE /api/admin/applications/<pk>/)."""

    def setUp(self):
        from accounts.models import User
        from shops.models import Shop

        self.admin = User.objects.create_user(
            username="root",
            password="xpass1",
            is_staff=True,
            is_superuser=True,
        )
        self.shop = Shop.objects.create(name="Asosiy", owner=self.admin)
        self.admin.shop = self.shop
        self.admin.save()
        self.app = StoreApplication.objects.create(
            store_name="Ariza Do'kon", owner_name="Ali", phone="+998901234567"
        )

    def _auth(self, user=None):
        self.client.force_authenticate(user=user or self.admin)

    def test_non_admin_denied(self):
        from accounts.models import User
        from shops.models import Shop

        staff = User.objects.create_user(username="kassir", password="xpass1")
        staff.shop = self.shop
        staff.save()
        self._auth(staff)
        resp = self.client.get(f"/api/admin/applications/{self.app.id}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_detail_get_and_patch_status(self):
        self._auth()
        resp = self.client.get(f"/api/admin/applications/{self.app.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "pending")

        resp = self.client.patch(
            f"/api/admin/applications/{self.app.id}/", {"status": "rejected", "note": "Hujjat yetmayapti"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, "rejected")
        self.assertEqual(self.app.note, "Hujjat yetmayapti")
        self.assertEqual(self.app.processed_by, self.admin)

    def test_delete_removes_application(self):
        self._auth()
        resp = self.client.delete(f"/api/admin/applications/{self.app.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StoreApplication.objects.filter(id=self.app.id).exists())

    def test_not_found(self):
        self._auth()
        resp = self.client.get("/api/admin/applications/99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ShopSettingsViewTests(APITestCase):
    """Do'kon sozlamalari: owner/admin tahrirlaydi, kassir faqat o'qiydi."""

    URL = "/api/stores/settings/"

    def setUp(self):
        from accounts.models import User
        from shops.models import Shop

        self.owner = User.objects.create_user(
            username="owner1", password="xpass1", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Do'kon A", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()

        self.cashier = User.objects.create_user(
            username="kassir1", password="xpass1", role=User.Role.CASHIER
        )
        self.cashier.shop = self.shop
        self.cashier.save()

        self.admin = User.objects.create_user(
            username="root", password="xpass1",
            is_staff=True, is_superuser=True, role=User.Role.SUPER_ADMIN,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_owner_get_and_patch(self):
        self._auth(self.owner)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["shop_id"], self.shop.id)
        self.assertEqual(resp.data["shop_name"], "Do'kon A")

        resp = self.client.patch(
            self.URL, {"payme_merchant_id": "5e01ea93c6d9c24334933856"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["payme_merchant_id"], "5e01ea93c6d9c24334933856")

    def test_admin_can_patch_settings(self):
        """Bug-fix: admin (super_admin) endi sozlamalarni tahrirlay oladi."""
        self._auth(self.admin)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.patch(
            self.URL, {"qr_holder": "ASATOVA NILUFAR", "qr_card_number": "9860123456789012"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["qr_holder"], "ASATOVA NILUFAR")
        self.shop.settings.refresh_from_db()
        self.assertEqual(self.shop.settings.qr_card_number, "9860123456789012")

    def test_cashier_reads_but_cannot_patch(self):
        self._auth(self.cashier)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.patch(self.URL, {"qr_holder": "KASSA"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_denied(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_shop_id_param_selects_shop(self):
        from accounts.models import User
        from shops.models import Shop

        other_shop = Shop.objects.create(name="Do'kon B", owner=self.owner)
        self._auth(self.admin)
        resp = self.client.get(f"{self.URL}?shop_id={other_shop.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["shop_id"], other_shop.id)


class StoreAdminCloseTests(APITestCase):
    """Admin: do'konlar ro'yxati + do'konni yopish (yumshoq o'chirish)."""

    def setUp(self):
        from accounts.models import Device, User
        from shops.models import Shop  # noqa: PLC0415 — import order by file convention

        self.admin = User.objects.create_user(
            username="root", password="xpass1", is_staff=True, is_superuser=True
        )
        self.owner = User.objects.create_user(
            username="ega", password="egapass", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Yopiladigan Do'kon", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()
        self.client.force_authenticate(user=self.admin)

    def test_admin_lists_stores(self):
        resp = self.client.get("/api/admin/stores/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = [s["name"] for s in resp.data["results"]]
        self.assertIn("Yopiladigan Do'kon", names)
        row = next(s for s in resp.data["results"] if s["name"] == "Yopiladigan Do'kon")
        self.assertTrue(row["is_active"])
        self.assertEqual(row["status_display"], "Faol")

    def test_admin_close_store_blocks_owner(self):
        from accounts.models import Device, User

        Device.objects.create(
            user=self.owner, device_id="dev-1", device_name="Telefon",
            device_type="phone", device_model="iPhone",
        )
        cashier = User.objects.create_user(
            username="kassir1", password="xpass", role=User.Role.CASHIER
        )
        cashier.shop = self.shop
        cashier.save()
        Device.objects.create(
            user=cashier, device_id="dev-2", device_name="Kassir telefoni",
            device_type="phone", device_model="Android",
        )
        resp = self.client.post(f"/api/admin/stores/{self.shop.id}/close/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.shop.refresh_from_db()
        self.owner.refresh_from_db()
        cashier.refresh_from_db()
        self.assertFalse(self.shop.is_active)
        self.assertFalse(self.owner.is_active)
        self.assertFalse(cashier.is_active)
        self.assertFalse(Device.objects.filter(user__in=[self.owner, cashier]).exists())

        # O'chirilgan ega va kassir endi kira olmaydi
        self.client.force_authenticate(user=None)
        for username, password in [("ega", "egapass"), ("kassir1", "xpass")]:
            login = self.client.post(
                "/api/auth/login/",
                {"username": username, "password": password},
                format="json",
            )
            self.assertEqual(login.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_close_already_closed_rejected(self):
        self.client.post(f"/api/admin/stores/{self.shop.id}/close/")
        resp = self.client.post(f"/api/admin/stores/{self.shop.id}/close/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_denied(self):
        from accounts.models import User

        cashier = User.objects.create_user(username="kassir", password="x")
        cashier.shop = self.shop
        cashier.save()
        self.client.force_authenticate(user=cashier)
        resp = self.client.get("/api/admin/stores/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        resp = self.client.post(f"/api/admin/stores/{self.shop.id}/close/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_reopen_restores_shop_and_members(self):
        from accounts.models import User

        cashier = User.objects.create_user(
            username="reopen-kassir", password="xpass", role=User.Role.CASHIER
        )
        cashier.shop = self.shop
        cashier.save()

        self.client.post(f"/api/admin/stores/{self.shop.id}/close/")
        self.shop.refresh_from_db()
        self.assertFalse(self.shop.is_active)

        resp = self.client.post(f"/api/admin/stores/{self.shop.id}/reopen/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.shop.refresh_from_db()
        self.owner.refresh_from_db()
        cashier.refresh_from_db()
        self.assertTrue(self.shop.is_active)
        self.assertTrue(self.owner.is_active)
        self.assertTrue(cashier.is_active)

        # Ega qayta kirish imkoniga ega
        self.client.force_authenticate(user=None)
        login = self.client.post(
            "/api/auth/login/",
            {"username": "ega", "password": "egapass"},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_reopen_active_store_rejected(self):
        resp = self.client.post(f"/api/admin/stores/{self.shop.id}/reopen/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class StoreApplicationDecisionTests(APITestCase):
    """Admin: ariza qarorini o'zgartirish (approved/rejected -> pending)."""

    def setUp(self):
        from accounts.models import User
        from shops.models import Shop, StoreApplication

        self.admin = User.objects.create_user(
            username="root", password="xpass1", is_staff=True, is_superuser=True
        )
        self.owner = User.objects.create_user(
            username="ega2", password="egapass", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Ariza Do'koni", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()
        self.app = StoreApplication.objects.create(
            store_name="Ro'yxatga ariza",
            owner_name="Aliyev",
            phone="+998900000002",
            created_shop=self.shop,
            status=StoreApplication.Status.APPROVED,
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_can_move_approved_back_to_pending(self):
        resp = self.client.patch(
            f"/api/admin/applications/{self.app.id}/",
            {"status": "pending"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, "pending")
