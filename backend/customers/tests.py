from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from customers.models import AuditLog, Customer, Debt, DebtPayment
from customers.utils import normalize_phone
from shops.models import Shop

User = get_user_model()


class NormalizePhoneTest(TestCase):
    def test_various_formats(self):
        cases = {
            "+998 94 003 55 71": "+998940035571",
            "998940035571": "+998940035571",
            "94 003 55 71": "+998940035571",
            "8940035571": "+998940035571",
            "+998(94)003-55-71": "+998940035571",
            "": "",
            None: "",
        }
        for raw, expected in cases.items():
            self.assertEqual(normalize_phone(raw), expected)


class DebtApiTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", password="owner12345", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Test Shop", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save(update_fields=["shop"])
        self.client = APIClient()
        resp = self.client.post(
            "/api/auth/login/",
            {"username": "owner", "password": "owner12345"},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {resp.json()['access']}"
        )

    def _customer(self, name="Ali", limit="1000000"):
        resp = self.client.post(
            "/api/customers/",
            {"name": name, "phone": "+998940003551", "credit_limit": limit},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()["id"]

    def _debt(self, customer_id, amount="200000", due=None):
        resp = self.client.post(
            "/api/debts/",
            {
                "customer_id": customer_id,
                "original_amount": amount,
                "due_date": due or str(timezone.localdate() + timedelta(days=7)),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()["id"]

    def _pay(self, debt_id, amount):
        return self.client.post(
            f"/api/debts/{debt_id}/payments/", {"amount": amount}, format="json"
        )

    def test_customer_phone_normalized(self):
        cid = self._customer()
        cust = Customer.objects.get(pk=cid)
        self.assertEqual(cust.phone, "+998940003551")

    def test_overpay_rejected(self):
        cid = self._customer()
        did = self._debt(cid, "200000")
        resp = self._pay(did, "999999")
        self.assertEqual(resp.status_code, 400)
        debt = Debt.objects.get(pk=did)
        self.assertEqual(debt.remaining_amount, Decimal("200000"))

    def test_partial_then_full_payment(self):
        cid = self._customer()
        did = self._debt(cid, "200000")
        resp = self._pay(did, "80000")
        self.assertEqual(resp.status_code, 201, resp.content)
        debt = Debt.objects.get(pk=did)
        self.assertEqual(debt.remaining_amount, Decimal("120000"))
        self.assertEqual(debt.status, Debt.Status.PARTIALLY_PAID)
        self.assertIsNone(debt.paid_at)

        resp = self._pay(did, "120000")
        self.assertEqual(resp.status_code, 201, resp.content)
        debt.refresh_from_db()
        self.assertEqual(debt.remaining_amount, Decimal("0"))
        self.assertEqual(debt.status, Debt.Status.PAID)
        self.assertIsNotNone(debt.paid_at)
        self.assertEqual(debt.paid_by, self.owner)
        self.assertEqual(DebtPayment.objects.filter(debt=debt).count(), 2)

    def test_acceptance_full_payment_leaves_active_and_enters_history(self):
        """Critical acceptance: Muhammadamin 6 000 — to'liq to'lovdan keyin
        active'da yo'q, history'da bor."""
        cid = self._customer("Muhammadamin")
        did = self._debt(cid, "6000")

        # Step 1: active debts — mavjud
        resp = self.client.get("/api/debts/")
        self.assertIn(did, [d["id"] for d in resp.json()["results"]])

        # Step 2: 6000 to'lash
        resp = self._pay(did, "6000")
        self.assertEqual(resp.status_code, 201, resp.content)

        # Step 3: active debts — YO'Q
        debt = Debt.objects.get(pk=did)
        self.assertEqual(debt.remaining_amount, Decimal("0"))
        self.assertEqual(debt.status, Debt.Status.PAID)
        resp = self.client.get("/api/debts/")
        self.assertNotIn(did, [d["id"] for d in resp.json()["results"]])

        # Step 4: history — BOR, status PAID
        resp = self.client.get("/api/debts/history/")
        hist = [h for h in (resp.json().get("results") or []) if h["id"] == did]
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0]["status"], Debt.Status.PAID)
        self.assertEqual(hist[0]["remaining_amount"], "0.00")

        # Step 6: customer balance — 0
        cust = Customer.objects.get(pk=cid)
        self.assertEqual(cust.balance, Decimal("0"))

        # Step 7: stats — debtors count 0
        stats = self.client.get("/api/debts/stats/").json()
        self.assertEqual(stats["debtors_count"], 0)
        self.assertEqual(Decimal(stats["total_debt"]), Decimal("0"))

    def test_active_query_only_open_debts(self):
        cid = self._customer()
        did = self._debt(cid, "200000")
        self._pay(did, "200000")
        resp = self.client.get("/api/debts/")
        ids = [d["id"] for d in resp.json()["results"]]
        self.assertNotIn(did, ids)
        # boshqa ochiq qarz ham bor bo'lsa status filter faqat active ichida
        did2 = self._debt(cid, "50000")
        resp = self.client.get("/api/debts/")
        self.assertIn(did2, [d["id"] for d in resp.json()["results"]])

    def test_persist_sync_remaining_zero_is_paid(self):
        """remaining_amount = 0 bo'lgan saqlanganda status avtomatik PAID."""
        cid = self._customer()
        did = self._debt(cid, "10000")
        resp = self._pay(did, "10000")
        debt = Debt.objects.get(pk=did)
        self.assertEqual(debt.status, Debt.Status.PAID)
        self.assertEqual(debt.remaining_amount, Decimal("0"))

    def test_overdue_effective_status(self):
        cid = self._customer()
        did = self._debt(cid, "200000", due=str(timezone.localdate() - timedelta(days=3)))
        resp = self.client.get("/api/debts/")
        debt = next(d for d in resp.json()["results"] if d["id"] == did)
        self.assertEqual(debt["effective_status"], Debt.Status.OVERDUE)
        resp = self.client.get("/api/debts/?due=overdue")
        self.assertIn(did, [d["id"] for d in resp.json()["results"]])

    def test_stats(self):
        cid = self._customer()
        self._debt(cid, "200000")
        resp = self.client.get("/api/debts/stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Decimal(resp.json()["total_debt"]), Decimal("200000"))
        self.assertEqual(resp.json()["debtors_count"], 1)

    def test_stats_exclude_paid(self):
        cid = self._customer()
        did = self._debt(cid, "300000")
        self._pay(did, "300000")
        resp = self.client.get("/api/debts/stats/")
        self.assertEqual(Decimal(resp.json()["total_debt"]), Decimal("0"))
        self.assertEqual(resp.json()["debtors_count"], 0)

    def test_top_debtors(self):
        cid = self._customer()
        self._debt(cid, "300000")
        resp = self.client.get("/api/debts/top/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()[0]["id"], cid)
        self.assertEqual(Decimal(resp.json()[0]["balance"]), Decimal("300000"))

    def test_credit_limit_change_logged(self):
        cid = self._customer(limit="100000")
        self.client.patch(
            f"/api/customers/{cid}/", {"credit_limit": "500000"}, format="json"
        )
        has_log = AuditLog.objects.filter(
            action=AuditLog.Action.CREDIT_LIMIT_CHANGED, entity_id=cid
        ).exists()
        self.assertTrue(has_log)

    def test_audit_log_for_owner(self):
        cid = self._customer()
        self._debt(cid, "200000")
        resp = self.client.get("/api/audit-logs/")
        self.assertEqual(resp.status_code, 200)
        actions = {e["action"] for e in resp.json()["results"]}
        self.assertIn(AuditLog.Action.DEBT_CREATED, actions)

    def test_race_guard_overpayment_rejected_after_full_pay(self):
        cid = self._customer()
        did = self._debt(cid, "5000")
        self._pay(did, "5000")
        # ikkinchi parallel to'lov rad etiladi — negative bo'lmaydi
        resp = self._pay(did, "5000")
        self.assertEqual(resp.status_code, 400)
        debt = Debt.objects.get(pk=did)
        self.assertEqual(debt.remaining_amount, Decimal("0"))
        self.assertEqual(DebtPayment.objects.filter(debt=debt).count(), 1)