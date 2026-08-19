from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Device
from shops.models import Shop

User = get_user_model()


def _device_id(n):
    """Barqaror fake persistent device_id (client localStorage'dan keladi)."""
    return f"device-uuid-{n}"


def _login_payload(username, password, device_id, device_type="laptop"):
    return {
        "username": username,
        "password": password,
        "device_id": device_id,
        "device_type": device_type,
        "device_name": "",
        "device_model": "",
        "device_type_label": "",
    }


class DeviceSystemApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", password="pass12345", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Test Do'kon", owner=self.user)
        self.user.shop = self.shop
        self.user.save(update_fields=["shop"])
        self.client = APIClient()

    def _login(self, device_id, username="owner", password="pass12345", **kw):
        return self.client.post(
            "/api/auth/login/",
            _login_payload(username, password, device_id, **kw),
            format="json",
        )

    # ------------------------------------------------------------------
    # 1) LOGIN IS NEVER BLOCKED — asosiy talab
    # ------------------------------------------------------------------
    def test_wrong_password_fails(self):
        r = self._login(_device_id(1), password="wrong")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(Device.objects.count(), 0)

    def test_correct_login_succeeds(self):
        r = self._login(_device_id(1))
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)
        self.assertIn("refresh", r.data)
        self.assertEqual(r.data["user"]["username"], "owner")
        # login faqat username/password'ga tayanadi — qurilma record side-effect
        self.assertEqual(Device.objects.count(), 1)

    # ------------------------------------------------------------------
    # 2) ONE USER + ONE DEVICE_ID = ONE DEVICE (uniqueness)
    # ------------------------------------------------------------------
    def test_single_device_id_stays_single_after_many_logins(self):
        device_id = _device_id("chrome-pc")
        for _ in range(10):
            r = self._login(device_id)
            self.assertEqual(r.status_code, 200)
        self.assertEqual(Device.objects.count(), 1)
        dev = Device.objects.get()
        self.assertEqual(dev.device_id, device_id)
        self.assertEqual(dev.last_login_at is not None, True)

    def test_second_device_creates_second_account(self):
        self._login(_device_id("phone-1"), device_type="phone")
        self._login(_device_id("pc-2"))
        self.assertEqual(Device.objects.count(), 2)
        types = set(Device.objects.values_list("device_type", flat=True))
        self.assertTrue({"phone", "laptop"} <= types)

    def test_login_does_not_break_existing_device_metadata(self):
        dev_id = _device_id("pc")
        self._login(dev_id, device_type="laptop")
        first = Device.objects.get()
        self.assertEqual(first.first_seen_at is not None, True)
        # keyingi login — yangi bitta record, o'zgarmaydi
        self._login(dev_id, device_type="laptop")
        self.assertEqual(Device.objects.count(), 1)

    def test_device_id_missing_still_logs_in(self):
        payload = {"username": "owner", "password": "pass12345"}
        r = self.client.post("/api/auth/login/", payload, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Device.objects.count(), 0)

    # ------------------------------------------------------------------
    # 3) authorized: bo'sh/noto'g'ri device_id login'ni to'smaydi
    # ------------------------------------------------------------------
    def test_blank_device_id_ignored(self):
        r = self._login("")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Device.objects.count(), 0)

    def test_login_from_any_device_never_401(self):
        for dev in ["a", "b", "c", "d"]:
            r = self._login(dev)
            self.assertEqual(r.status_code, 200)

    # ------------------------------------------------------------------
    # 4) DEVICES API
    # ------------------------------------------------------------------
    def test_device_list_returns_only_own_devices(self):
        other = User.objects.create_user(
            username="other", password="pass12345", role=User.Role.CASHIER,
            shop=self.shop,
        )
        self._login(_device_id(1))
        self.client.force_authenticate(self.user)
        r = self.client.get("/api/devices/")
        self.assertEqual(r.status_code, 200)
        items = r.data["results"] if isinstance(r.data, dict) else r.data
        self.assertEqual(len(items), 1)

        self.client.force_authenticate(other)
        r = self.client.get("/api/devices/")
        items = r.data["results"] if isinstance(r.data, dict) else r.data
        self.assertEqual(len(items), 0)

    def test_device_detail_patch_name_model(self):
        self._login(_device_id("pc"))
        dev = Device.objects.get()
        self.client.force_authenticate(self.user)

        r = self.client.get(f"/api/devices/{dev.pk}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["device_id"], _device_id("pc"))

        r = self.client.patch(
            f"/api/devices/{dev.pk}/",
            {"device_name": "Asosiy Noutbuk", "device_model": "MacBook Pro M4"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        dev.refresh_from_db()
        self.assertTrue(dev.is_name_manual)
        self.assertTrue(dev.is_model_manual)

    def test_device_patch_rejects_empty(self):
        self._login(_device_id("pc"))
        dev = Device.objects.get()
        self.client.force_authenticate(self.user)
        r = self.client.patch(f"/api/devices/{dev.pk}/", {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_device_patch_forbidden_for_other_user(self):
        self._login(_device_id("pc"))
        dev = Device.objects.get()
        other = User.objects.create_user(
            username="other", password="pass12345", role=User.Role.CASHIER,
            shop=self.shop,
        )
        self.client.force_authenticate(other)
        r = self.client.patch(
            f"/api/devices/{dev.pk}/", {"device_name": "hack"}, format="json"
        )
        self.assertEqual(r.status_code, 404)

    def test_devices_require_auth(self):
        r = self.client.get("/api/devices/")
        self.assertEqual(r.status_code, 401)

    # ------------------------------------------------------------------
    # 5) OLD BLOCK/REVOKE ENDPOINTS NO LONGER EXIST
    # ------------------------------------------------------------------
    def test_old_block_endpoint_gone(self):
        self._login(_device_id("pc"))
        dev = Device.objects.get()
        self.client.force_authenticate(self.user)
        r = self.client.post(f"/api/devices/{dev.pk}/block/", format="json")
        self.assertIn(r.status_code, (404, 405))

    # ------------------------------------------------------------------
    # 6) clear_device_data command
    # ------------------------------------------------------------------
    def test_clear_device_data_only_clears_devices(self):
        self._login(_device_id("pc-1"))
        self._login(_device_id("pc-2"), device_type="phone")
        self.assertEqual(Device.objects.count(), 2)
        self.assertEqual(self.user.shop.name, "Test Do'kon")

        confirm = "y\n"
        import io
        from unittest import mock
        with mock.patch("sys.stdin", io.StringIO(confirm)):
            call_command("clear_device_data", "--yes")

        self.assertEqual(Device.objects.count(), 0)
        self.assertEqual(User.objects.count(), 1)  # user saqlanadi
        self.assertEqual(Shop.objects.count(), 1)  # shop saqlanadi

    def test_device_str(self):
        dev = Device.objects.create(
            user=self.user, device_id=_device_id(1), device_name="",
            device_type="laptop",
        )
        self.assertEqual(str(dev), dev.device_id)