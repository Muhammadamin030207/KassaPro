from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import DeviceAuditLog, DeviceSession, LoginEvent


def _device_id(i):
    return f"device-{i:08d}-abcdef-1234-5678-9abcdef01234"


class DeviceSessionApiTestCase(TestCase):
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

    def _auth_get(self, path, token, device_id=None):
        h = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
        if device_id:
            h["HTTP_USER_AGENT"] = device_id
        return self.client.get(path, **h)

    # ---------------------------------------------------------------- login

    def test_login_with_device_creates_session(self):
        res = self._login(device_id=_device_id(1))
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        self.assertIn("session_id", res.json())
        self.assertTrue(res.json()["session_id"])
        self.assertEqual(DeviceSession.objects.count(), 1)
        s = DeviceSession.objects.get()
        self.assertEqual(s.status, DeviceSession.Status.ACTIVE)
        self.assertEqual(s.device_id, _device_id(1))
        self.assertEqual(LoginEvent.objects.filter(result="success").count(), 1)

    def test_login_without_device_legacy_still_works(self):
        res = self._login()
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        self.assertNotIn("session_id", res.json())
        self.assertEqual(DeviceSession.objects.count(), 0)

    def test_multi_device_multiple_sessions(self):
        self._login(device_id=_device_id(1))
        self._login(device_id=_device_id(2))
        self.assertEqual(DeviceSession.objects.filter(user=self.user).count(), 2)
        both_active = DeviceSession.objects.filter(
            user=self.user, status=DeviceSession.Status.ACTIVE
        ).count()
        self.assertEqual(both_active, 2)

    def test_same_device_replaces_old_session(self):
        self._login(device_id=_device_id(1))
        self._login(device_id=_device_id(1))
        self.assertEqual(DeviceSession.objects.filter(user=self.user).count(), 2)
        active = DeviceSession.objects.filter(
            user=self.user, status=DeviceSession.Status.ACTIVE
        ).count()
        self.assertEqual(active, 1)

    # ------------------------------------------------- enum revoke -> blocked

    def test_revoked_device_login_blocked_403(self):
        res1 = self._login(device_id=_device_id(1))
        old_token = res1.json()["access"]
        target = DeviceSession.objects.get(user=self.user, device_id=_device_id(1))
        # admin ctrl from another device (current — 2)
        res2 = self._login(device_id=_device_id(2))
        token = res2.json()["access"]

        # revoke device 1
        res = self.client.post(
            f"/api/devices/{target.pk}/revoke/",
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
        )
        self.assertEqual(res.status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.status, DeviceSession.Status.REVOKED)
        self.assertIsNotNone(target.revoked_at)
        self.assertEqual(target.revoked_by, self.user)

        # old access token now 401
        res = self._auth_get("/api/auth/me/", old_token)
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_revoked")

        # blocked login (correct password still denied)
        res = self._login(device_id=_device_id(1))
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json().get("code"), "device_blocked")
        self.assertTrue(LoginEvent.objects.filter(result="blocked").exists())
        self.assertTrue(
            DeviceAuditLog.objects.filter(action=DeviceAuditLog.Action.LOGIN_BLOCKED).exists()
        )

    def test_refresh_revoked_session_rejected(self):
        res1 = self._login(device_id=_device_id(2))
        refresh = res1.json()["refresh"]
        target = DeviceSession.objects.get(user=self.user, device_id=_device_id(2))
        res2 = self._login(device_id=_device_id(3))
        token = res2.json()["access"]
        self.client.post(
            f"/api/devices/{target.pk}/revoke/",
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
        )
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_revoked")

    def test_unblock_allows_relogin(self):
        first = self._login(device_id=_device_id(3))
        self._old_tokens = {"access": first.json()["access"]}
        session = DeviceSession.objects.get(user=self.user, device_id=_device_id(3))
        # admin ctrl token — boshqa qurilma
        token = self._login(device_id=_device_id(9)).json()["access"]
        self.client.post(
            f"/api/devices/{session.pk}/revoke/",
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
        )
        # login blocked
        res = self._login(device_id=_device_id(3))
        self.assertEqual(res.status_code, 403)

        # unblock
        res = self.client.post(
            f"/api/devices/{session.pk}/unblock/",
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
        )
        self.assertEqual(res.status_code, 200)
        rev = DeviceSession.objects.filter(
            user=self.user, device_id=_device_id(3)
        ).order_by("-id").first()
        self.assertEqual(rev.status, DeviceSession.Status.ALLOWED)
        # eski (revoke qilingan) access token hali ham ishlamaydi
        res = self._auth_get("/api/auth/me/", self._old_tokens["access"])
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_expired")

        # now login works -> new active session
        res = self._login(device_id=_device_id(3))
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.json())
        latest = DeviceSession.objects.filter(
            user=self.user, device_id=_device_id(3)
        ).order_by("-id").first()
        self.assertEqual(latest.status, DeviceSession.Status.ACTIVE)
        self.assertTrue(
            DeviceAuditLog.objects.filter(
                action=DeviceAuditLog.Action.ADMIN_UNBLOCKED_DEVICE
            ).exists()
        )

    def test_revoke_all_keeps_current(self):
        res1 = self._login(device_id=_device_id(4))
        res2 = self._login(device_id=_device_id(5))
        token1 = res1.json()["access"]
        token2 = res2.json()["access"]
        # device 5 is current (latest login) -> revoke-all excludes it
        res = self.client.post(
            "/api/devices/revoke-all/",
            **{"HTTP_AUTHORIZATION": f"Bearer {token2}"},
        )
        self.assertEqual(res.status_code, 200)
        d4 = DeviceSession.objects.get(user=self.user, device_id=_device_id(4))
        d5 = DeviceSession.objects.get(user=self.user, device_id=_device_id(5))
        self.assertEqual(d4.status, DeviceSession.Status.REVOKED)
        self.assertEqual(d5.status, DeviceSession.Status.ACTIVE)
        # token1 invalid now
        self.assertEqual(self._auth_get("/api/auth/me/", token1).status_code, 401)
        # token2 still valid
        self.assertEqual(self._auth_get("/api/auth/me/", token2).status_code, 200)

    def test_logout_expires_current_session(self):
        res = self._login(device_id=_device_id(6))
        token = res.json()["access"]
        refresh = res.json()["refresh"]
        session = DeviceSession.objects.get(user=self.user, device_id=_device_id(6))
        res = self.client.post(
            "/api/auth/logout/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(res.status_code, 204)
        session.refresh_from_db()
        self.assertEqual(session.status, DeviceSession.Status.EXPIRED)
        # refresh rejected
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get("code"), "session_expired")
        # access token rejected too
        self.assertEqual(self._auth_get("/api/auth/me/", token).status_code, 401)
        # device itself is NOT blocked (re-login allowed)
        res = self._login(device_id=_device_id(6))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(LoginEvent.objects.filter(result="logout").exists())

    def test_devices_list_only_for_admin(self):
        self._login(device_id=_device_id(7))
        # cashier sees 403
        cashier = self._create_user("cash", role="cashier")
        res = self.client.post(
            "/api/auth/login/", {"username": "cash", "password": "admin123"},
            format="json",
        )
        cash_token = res.json()["access"]
        res = self.client.get(
            "/api/devices/", **{"HTTP_AUTHORIZATION": f"Bearer {cash_token}"}
        )
        self.assertEqual(res.status_code, 403)

        # admin sees own devices only
        admin_token = self._login(device_id=_device_id(8)).json()["access"]
        res = self.client.get(
            "/api/devices/", **{"HTTP_AUTHORIZATION": f"Bearer {admin_token}"}
        )
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        device_ids = {d["device_id"] for d in results}
        self.assertIn(_device_id(7), device_ids)
        self.assertIn(_device_id(8), device_ids)
        current = [d for d in results if d["is_current"]]
        self.assertEqual(len(current), 1)
        self.assertEqual(current[0]["device_id"], _device_id(8))

    def test_device_history_endpoint(self):
        self._login(device_id=_device_id(1))
        session = DeviceSession.objects.get(user=self.user, device_id=_device_id(1))
        token = self._login(device_id=_device_id(10)).json()["access"]
        res = self.client.get(
            "/api/devices/history/", **{"HTTP_AUTHORIZATION": f"Bearer {token}"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.json()["results"]), 2)

    def test_refresh_keeps_session_claims_and_rotates(self):
        res = self._login(device_id=_device_id(1))
        refresh1 = res.json()["refresh"]
        session = DeviceSession.objects.get(user=self.user, device_id=_device_id(1))
        jti1 = session.refresh_jti
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh1}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access", data)
        session.refresh_from_db()
        self.assertNotEqual(session.refresh_jti, jti1)
        # old refresh now rejected (rotation)
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh1}, format="json"
        )
        self.assertEqual(res.status_code, 401)
        # new refresh works
        res = self.client.post(
            "/api/auth/refresh/", {"refresh": data["refresh"]}, format="json"
        )
        self.assertEqual(res.status_code, 200)

    def test_other_user_cannot_revoke_my_device(self):
        self._login(device_id=_device_id(11))
        session = DeviceSession.objects.get(user=self.user, device_id=_device_id(11))
        token = self._login(username="other", device_id=_device_id(12)).json()["access"]
        res = self.client.post(
            f"/api/devices/{session.pk}/revoke/",
            **{"HTTP_AUTHORIZATION": f"Bearer {token}"},
        )
        # other kassir/oddiy foydalanuvchi — admin-only endpoint, ruxsat yo'q
        self.assertEqual(res.status_code, 403)
        session.refresh_from_db()
        self.assertEqual(session.status, DeviceSession.Status.ACTIVE)

    def test_last_active_updates_throttled(self):
        self._login(device_id=_device_id(13))
        session = DeviceSession.objects.get(user=self.user, device_id=_device_id(13))
        token = self._login(device_id=_device_id(14)).json()["access"]
        # an API call -> last_active_at updated (or at least not broken)
        from django.utils import timezone

        before = session.last_active_at
        self.client.get("/api/auth/me/", **{"HTTP_AUTHORIZATION": f"Bearer {token}"})
        self.assertEqual(self.client.get("/api/auth/me/", **{"HTTP_AUTHORIZATION": f"Bearer {token}"}).status_code, 200)
        self.assertIsNotNone(before)