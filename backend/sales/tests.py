from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Product
from sales.models import Sale, SaleItem
from shops.models import Shop


class SaleAutoDeleteExhaustedTests(APITestCase):
    """Sotilgach zahirasi 0 ga tushgan mahsulot avtomatik o'chadi, tarix saqlanadi."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="ega", password="xpass1", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Do'kon", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()
        self.client.force_authenticate(user=self.owner)

    def test_sold_out_product_auto_deleted_and_history_kept(self):
        p = Product.objects.create(
            shop=self.shop, name="Yakuniy tovar", barcode="SON", price=5000, stock_qty=1
        )
        resp = self.client.post(
            "/api/sales/",
            {"payment_method": "cash", "items": [{"product_id": p.id, "qty": 1}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        self.assertFalse(Product.objects.filter(id=p.id).exists())

        item = SaleItem.objects.get(sale_id=resp.data["id"])
        self.assertIsNone(item.product_id)
        self.assertEqual(item.product_name_snapshot, "Yakuniy tovar")
        self.assertEqual(item.barcode_snapshot, "SON")
        self.assertEqual(int(item.price_snapshot), 5000)

    def test_partial_sale_keeps_product(self):
        p = Product.objects.create(
            shop=self.shop, name="Qoladigan tovar", barcode="QOL", price=5000, stock_qty=5
        )
        resp = self.client.post(
            "/api/sales/",
            {"payment_method": "cash", "items": [{"product_id": p.id, "qty": 3}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Product.objects.filter(id=p.id).exists())
        p.refresh_from_db()
        self.assertEqual(int(p.stock_qty), 2)

    def test_multi_item_sale_deletes_only_exhausted(self):
        p1 = Product.objects.create(
            shop=self.shop, name="Oxirgi", barcode="OX1", price=1000, stock_qty=1
        )
        p2 = Product.objects.create(
            shop=self.shop, name="Ortib qolgan", barcode="OX2", price=1000, stock_qty=4
        )
        resp = self.client.post(
            "/api/sales/",
            {
                "payment_method": "cash",
                "items": [{"product_id": p1.id, "qty": 1}, {"product_id": p2.id, "qty": 2}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(Product.objects.filter(id=p1.id).exists())
        self.assertTrue(Product.objects.filter(id=p2.id).exists())


class SaleResponseItemsTests(APITestCase):
    """Sotuv javobida o'chirilgan mahsulot tarixi hali ham qaytadi."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="ega", password="xpass1", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Do'kon", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()
        self.client.force_authenticate(user=self.owner)

    def test_deleted_product_still_in_sale_response(self):
        p = Product.objects.create(
            shop=self.shop, name="Oxirgi", barcode="OX3", price=2500, stock_qty=1
        )
        resp = self.client.post(
            "/api/sales/",
            {"payment_method": "cash", "items": [{"product_id": p.id, "qty": 1}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        items = resp.data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["product_name"], "Oxirgi")
        self.assertEqual(items[0]["barcode_snapshot"], "OX3")


class ProfitSnapshotTests(APITestCase):
    """Foyda hisoboti: mahsulot stock=0 bo'lib o'chirilganda ham tannarx
    snapshot'idan to'g'ri hisoblanadi (product FK NULL bo'lib foyda shishmaydi)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="ega", password="xpass1", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Do'kon", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()
        self.client.force_authenticate(user=self.owner)

    def test_profit_uses_cost_snapshot_after_auto_delete(self):
        p = Product.objects.create(
            shop=self.shop,
            name="Sotilib tugadi",
            barcode="FOY1",
            price=5000,
            cost_price=1000,
            stock_qty=1,
        )
        resp = self.client.post(
            "/api/sales/",
            {"payment_method": "cash", "items": [{"product_id": p.id, "qty": 1}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(Product.objects.filter(id=p.id).exists())

        summary = self.client.get("/api/reports/summary/").json()
        self.assertEqual(summary["total_profit"], 4000)

    def test_profit_keeps_revenue_after_auto_delete(self):
        p1 = Product.objects.create(
            shop=self.shop,
            name="Birinchi",
            barcode="FOY2",
            price=3000,
            cost_price=1000,
            stock_qty=1,
        )
        p2 = Product.objects.create(
            shop=self.shop,
            name="Ikkinchi",
            barcode="FOY3",
            price=2000,
            cost_price=500,
            stock_qty=1,
        )
        self.client.post(
            "/api/sales/",
            {
                "payment_method": "cash",
                "items": [
                    {"product_id": p1.id, "qty": 1},
                    {"product_id": p2.id, "qty": 1},
                ],
            },
            format="json",
        )
        summary = self.client.get("/api/reports/summary/").json()
        self.assertEqual(summary["total_revenue"], 5000)
        self.assertEqual(summary["total_profit"], 3500)