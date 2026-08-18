from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Device, DeviceAuditLog, DeviceSession, LoginEvent


def _device_id(i):
    return f"device-{i:08d}-abcdef-1234-5678-9abcdef01234"


class DeviceSystemApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = self._create_user("admin", pwd="admin123", superuser=True)
        self.user2 = self._create_user("other", pwd="admin123")

    def _create_user(self, username, pwd="admin123", role=None, superuser=False):
        from accounts.models import User

        kwargs = {"username": username}
        if role:
            kwargs["role"] = role
        user = User.objects.create_user(password=pwd, **kwargs)
        if superuser:
            user.is_superuser = True
            user.save(update_fields=["is_superuser"])
        return user

    def _login(self, username="admin", pwd="admin123", device_id=None, **extra):
        body = {"username": username, "password": pwd}
        if device_id:
            body["device_id"] = device_id
        body.update(extra)
        return self.client.post("/api/auth/login/", body, format="json")

    def _logout(self, refresh):
        return self.client.post(
            "/api/auth/logout/", {"refresh": refresh}, format="json"
        )

    def _auth_get(self, path, token):
        return self.client.get(
            path, **{"HTTP_AUTHORIZATION": f"Bearer {token}"}
        )

    def _auth_post(self, path, token, body=None):
        return self.client.post(
            path,
            body or {},
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
            content_type="application/json",
        )

    def _auth_patch(self, path, token, body):
        return self.client.patch(
            path,
            body,
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
            content_type="application/json",
        )

    # ================================================== ONE DEVICE = SAME CARD

    def test_login_creates_one_device_and_session(self):
        res = self._login(device_id=_device_id(1))
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        self.assertTrue(res.json()["session_id"])
        self.assertEqual(Device.objects.count(), 1)
        self.assertEqual(DeviceSession.objects.count(), 1)
        dev = Device.objects.get()
        self.assertEqual(dev.status, Device.Status.ACTIVE)
        self.assertEqual(dev.device_id, _device_id(1))
        self.assertEqual(
            LoginEvent.objects.filter(result="success").count(), 1
        )

    def test_many_logins_still_one_device(self):
        res = None
        for i in range(10):
            res = self._login(device_id=_device_id(1))
            self.assertEqual(res.status_code, 200)
            self._logout(res.json()["refresh"])
        self.assertEqual(Device.objects.count(), 1)
        sessions = DeviceSession.objects.filter(device__device_id=_device_id(1))
        self.assertEqual(sessions.count(), 10)
        self.assertEqual(
            sessions.filter(status=DeviceSession.Status.ACTIVE).count(), 0
        )

    def test_logout_login_cycle_single_device(self):
        res = self._login(device_id=_device_id(1))
        token = res.json()["access"]
        refresh = res.json()["refresh"]
        self._logout(refresh)
        session = DeviceSession.objects.get()
        self.assertEqual(session.status, DeviceSession.Status.EXPIRED)
        self.assertEqual(Device.objects.count(), 1)

        # logout'dan keyin refresh ham ishlamaydi
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_expired")
        self.assertEqual(self._auth_get("/api/auth/me/", token).status_code, 401)

        # qayta login — yana BITTA device (bloklanmagan)
        res = self._login(device_id=_device_id(1))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Device.objects.count(), 1)
        self.assertEqual(
            DeviceSession.objects.filter(device__device_id=_device_id(1)).count(), 2
        )

    def test_two_devices_two_cards(self):
        self._login(device_id=_device_id(1))
        self._login(device_id=_device_id(2))
        self.assertEqual(Device.objects.count(), 2)
        # yana laptop determinism — qurilmalar ko'paymaydi
        self._login(device_id=_device_id(1))
        self.assertEqual(Device.objects.count(), 2)
        self.assertEqual(DeviceSession.objects.count(), 3)

    def test_legacy_login_without_device_still_works(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        self.assertNotIn("session_id", res.json())
        self.assertEqual(Device.objects.count(), 0)
        self.assertEqual(DeviceSession.objects.count(), 0)

    # ================================================== metadata (name/model/type)

    def test_login_stores_device_metadata(self):
        res = self._login(
            device_id=_device_id(1),
            device_name="Muhammadamin's Laptop",
            device_model="Lenovo IdeaPad 3 15IAU7",
            device_type="laptop",
        )
        self.assertEqual(res.status_code, 200)
        dev = Device.objects.get(user=self.user, device_id=_device_id(1))
        self.assertEqual(dev.device_name, "Muhammadamin's Laptop")
        self.assertEqual(dev.device_model, "Lenovo IdeaPad 3 15IAU7")
        self.assertEqual(dev.device_type, "laptop")

    def test_model_unknown_when_not_detected(self):
        res = self.client.post(
            "/api/auth/login/",
            {
                "username": "admin",
                "password": "admin123",
                "device_id": _device_id(2),
            },
            HTTP_USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) Chrome/151.0",
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        dev = Device.objects.get(user=self.user, device_id=_device_id(2))
        self.assertEqual(dev.device_model, "Noutbuk modeli aniqlanmadi")
        self.assertEqual(dev.device_type, "desktop")

    def test_login_falls_back_to_username_device_name(self):
        res = self._login(device_id=_device_id(3))
        self.assertEqual(res.status_code, 200)
        dev = Device.objects.get(user=self.user, device_id=_device_id(3))
        self.assertTrue(dev.device_name)

    # ================================================== name/model persistence

    def test_manual_edit_persists_after_relogin(self):
        self._login(
            device_id=_device_id(1),
            device_name="Muhammadamin's Laptop",
            device_model="Lenovo IdeaPad 3 15IAU7",
            device_type="laptop",
        )
        ctrl = self._login(device_id=_device_id(9)).json()["access"]
        dev = Device.objects.get(user=self.user, device_id=_device_id(1))
        res = self._auth_patch(
            f"/api/devices/{dev.pk}/update/",
            ctrl,
            {"device_name": "Muhammadamin's Work Laptop", "device_model": "Lenovo Legion 5"},
        )
        self.assertEqual(res.status_code, 200)
        dev.refresh_from_db()
        self.assertTrue(dev.is_name_manual)
        self.assertTrue(dev.is_model_manual)
        self.assertTrue(
            DeviceAuditLog.objects.filter(
                action=DeviceAuditLog.Action.ADMIN_EDITED_DEVICE
            ).exists()
        )

        # logout + relogin — qo'lda kiritilgan nom/model saqlanib qoladi
        r1 = self._login(device_id=_device_id(1))
        self._logout(r1.json()["refresh"])
        self._login(device_id=_device_id(1), device_name="Avto nom", device_model="Boshqa model")
        dev.refresh_from_db()
        self.assertEqual(dev.device_name, "Muhammadamin's Work Laptop")
        self.assertEqual(dev.device_model, "Lenovo Legion 5")

    def test_auto_name_not_overwritten_on_relogin(self):
        self._login(device_id=_device_id(1), device_name="Muhammadamin's Laptop")
        self._login(device_id=_device_id(1), device_name="")
        dev = Device.objects.get(user=self.user, device_id=_device_id(1))
        self.assertEqual(dev.device_name, "Muhammadamin's Laptop")
        self.assertFalse(dev.is_name_manual)

    def test_update_blank_body_rejected(self):
        ctrl = self._login(device_id=_device_id(5)).json()["access"]
        self._login(device_id=_device_id(4))
        dev = Device.objects.get(user=self.user, device_id=_device_id(4))
        res = self._auth_patch(
            f"/api/devices/{dev.pk}/update/", ctrl, {}
        )
        self.assertEqual(res.status_code, 400)

    # ================================================== block / unblock / session

    def test_block_device_denies_login_and_kills_tokens(self):
        res1 = self._login(device_id=_device_id(1))
        old_token = res1.json()["access"]
        ctrl = self._login(device_id=_device_id(2)).json()["access"]
        dev = Device.objects.get(user=self.user, device_id=_device_id(1))

        res = self._auth_post(f"/api/devices/{dev.pk}/block/", ctrl)
        self.assertEqual(res.status_code, 200)
        dev.refresh_from_db()
        self.assertEqual(dev.status, Device.Status.BLOCKED)
        self.assertIsNotNone(dev.blocked_at)
        self.assertEqual(dev.blocked_by, self.user)
        sess = DeviceSession.objects.get(device=dev)
        self.assertEqual(sess.status, DeviceSession.Status.REVOKED)

        # eski access token endi o'lik
        res = self._auth_get("/api/auth/me/", old_token)
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_revoked")

        # bloklangan qurilma — parol to'g'ri bo'lsa ham login rad
        res = self._login(device_id=_device_id(1))
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "device_blocked")
        self.assertTrue(LoginEvent.objects.filter(result="blocked").exists())
        self.assertTrue(
            DeviceAuditLog.objects.filter(
                action=DeviceAuditLog.Action.LOGIN_BLOCKED
            ).exists()
        )

    def test_unblock_allows_relogin(self):
        self._login(device_id=_device_id(3))
        ctrl = self._login(device_id=_device_id(9)).json()["access"]
        dev = Device.objects.get(user=self.user, device_id=_device_id(3))
        self._auth_post(f"/api/devices/{dev.pk}/block/", ctrl)

        # login hali ham bloklangan
        res = self._login(device_id=_device_id(3))
        self.assertEqual(res.status_code, 403)

        res = self._auth_post(f"/api/devices/{dev.pk}/unblock/", ctrl)
        self.assertEqual(res.status_code, 200)
        dev.refresh_from_db()
        self.assertEqual(dev.status, Device.Status.ACTIVE)
        self.assertIsNone(dev.blocked_at)

        res = self._login(device_id=_device_id(3))
        self.assertEqual(res.status_code, 200)
        self.assertIn("session_id", res.json())
        latest = DeviceSession.objects.filter(device=dev).order_by("-id").first()
        self.assertEqual(latest.status, DeviceSession.Status.ACTIVE)
        self.assertTrue(
            DeviceAuditLog.objects.filter(
                action=DeviceAuditLog.Action.ADMIN_UNBLOCKED_DEVICE
            ).exists()
        )

    def test_revoke_session_only_kills_session(self):
        self._login(device_id=_device_id(1))
        ctrl = self._login(device_id=_device_id(2)).json()["access"]
        dev = Device.objects.get(user=self.user, device_id=_device_id(1))

        res = self._auth_post(f"/api/devices/{dev.pk}/revoke-session/", ctrl)
        self.assertEqual(res.status_code, 200)
        dev.refresh_from_db()
        self.assertEqual(dev.status, Device.Status.ACTIVE)  # device qolmadi blok
        self.assertEqual(
            DeviceSession.objects.get(device=dev).status,
            DeviceSession.Status.REVOKED,
        )

        # device BLOCKED emas — qayta login mumkin
        res = self._login(device_id=_device_id(1))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Device.objects.count(), 2)

    def test_refresh_rejected_after_block(self):
        res1 = self._login(device_id=_device_id(2))
        refresh = res1.json()["refresh"]
        ctrl = self._login(device_id=_device_id(3)).json()["access"]
        dev = Device.objects.get(user=self.user, device_id=_device_id(2))
        self._auth_post(f"/api/devices/{dev.pk}/block/", ctrl)
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_revoked")

    def test_block_others_keeps_current(self):
        r1 = self._login(device_id=_device_id(4))
        r2 = self._login(device_id=_device_id(5))
        token1 = r1.json()["access"]
        token2 = r2.json()["access"]

        res = self._auth_post("/api/devices/block-others/", token2)
        self.assertEqual(res.status_code, 200)
        d4 = Device.objects.get(user=self.user, device_id=_device_id(4))
        d5 = Device.objects.get(user=self.user, device_id=_device_id(5))
        self.assertEqual(d4.status, Device.Status.BLOCKED)
        self.assertEqual(d5.status, Device.Status.ACTIVE)
        # token1 invalid, token2 valid
        self.assertEqual(self._auth_get("/api/auth/me/", token1).status_code, 401)
        self.assertEqual(self._auth_get("/api/auth/me/", token2).status_code, 200)

    def test_other_user_cannot_block_my_device(self):
        self._login(device_id=_device_id(11))
        dev = Device.objects.get(user=self.user, device_id=_device_id(11))
        other_token = self._login(
            username="other", device_id=_device_id(12)
        ).json()["access"]
        res = self._auth_post(f"/api/devices/{dev.pk}/block/", other_token)
        self.assertEqual(res.status_code, 403)
        dev.refresh_from_db()
        self.assertEqual(dev.status, Device.Status.ACTIVE)

    # ================================================== list / history / refresh

    def test_list_returns_unique_devices_with_counts(self):
        self._login(device_id=_device_id(1))
        self._login(device_id=_device_id(1))
        self._login(device_id=_device_id(1))
        ctrl = self._login(device_id=_device_id(2)).json()["access"]

        res = self._auth_get("/api/devices/", ctrl)
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        self.assertEqual(len(results), 2)

        d1 = next(d for d in results if d["device_id"] == _device_id(1))
        d2 = next(d for d in results if d["device_id"] == _device_id(2))
        self.assertEqual(d1["sessions_count"], 3)
        self.assertEqual(d1["active_sessions"], 1)
        self.assertFalse(d1["is_current"])
        self.assertTrue(d2["is_current"])
        statuses = [d["status"] for d in results]
        for st in statuses:
            self.assertIn(st, ("active", "blocked"))

    def test_list_only_for_admin(self):
        self._login(device_id=_device_id(7))
        cashier = self._create_user("cash", role="cashier")
        res = self.client.post(
            "/api/auth/login/", {"username": "cash", "password": "admin123"},
            format="json",
        )
        cash_token = res.json()["access"]
        res = self._auth_get("/api/devices/", cash_token)
        self.assertEqual(res.status_code, 403)

        admin_token = self._login(device_id=_device_id(8)).json()["access"]
        res = self._auth_get("/api/devices/", admin_token)
        self.assertEqual(res.status_code, 200)
        device_ids = {d["device_id"] for d in res.json()["results"]}
        self.assertIn(_device_id(7), device_ids)
        self.assertIn(_device_id(8), device_ids)

    def test_device_sessions_history_endpoint(self):
        self._login(device_id=_device_id(1))
        self._login(device_id=_device_id(1))
        ctrl = self._login(device_id=_device_id(2)).json()["access"]
        dev = Device.objects.get(user=self.user, device_id=_device_id(1))
        res = self._auth_get(f"/api/devices/{dev.pk}/sessions/", ctrl)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 2)
        for s in res.json()["results"]:
            self.assertIn("session_id", s)
            self.assertIn("status", s)

    def test_login_history_endpoint(self):
        self._login(device_id=_device_id(1))
        ctrl = self._login(device_id=_device_id(10)).json()["access"]
        res = self._auth_get("/api/devices/history/", ctrl)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.json()["results"]), 2)

    def test_refresh_keeps_session_claims_and_rotates(self):
        res = self._login(device_id=_device_id(1))
        refresh1 = res.json()["refresh"]
        session = DeviceSession.objects.get()
        jti1 = session.refresh_jti
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh1}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        session.refresh_from_db()
        self.assertNotEqual(session.refresh_jti, jti1)
        # eski refresh endi rad etiladi (rotation)
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh1}, format="json"
        )
        self.assertEqual(res.status_code, 401)
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": data["refresh"]}, format="json"
        )
        self.assertEqual(res.status_code, 200)

    def test_last_active_throttle_not_broken(self):
        self._login(device_id=_device_id(13))
        token = self._login(device_id=_device_id(14)).json()["access"]
        res = self._auth_get("/api/auth/me/", token)
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(DeviceSession.objects.count())

    def test_current_device_endpoint(self):
        self._login(device_id=_device_id(1))
        ctrl = self._login(device_id=_device_id(2)).json()["access"]
        res = self._auth_get("/api/devices/current/", ctrl)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["device_id"], _device_id(2))
        self.assertTrue(res.json()["is_current"])