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
