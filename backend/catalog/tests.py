from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from catalog.models import Product
from shops.models import Shop


class ProductListDeleteTests(APITestCase):
    """Boshqaruv ro'yxatida zahirasi 0 mahsulot ham ko'rinishi + o'chirish."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="ega", password="xpass1", role=User.Role.OWNER
        )
        self.shop = Shop.objects.create(name="Do'kon", owner=self.owner)
        self.owner.shop = self.shop
        self.owner.save()
        self.client.force_authenticate(user=self.owner)

    def _mk(self, name, stock):
        return Product.objects.create(
            shop=self.shop, name=name, barcode=f"B-{stock}", price=10000, stock_qty=stock
        )

    def test_zero_stock_product_still_in_management_list(self):
        out = self._mk("Sotilgan maxsulot", 0)
        self._mk("Mavjud maxsulot", 5)
        resp = self.client.get("/api/products/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = [p["name"] for p in resp.data.get("results", resp.data)]
        self.assertIn("Sotilgan maxsulot", names)

    def test_zero_stock_still_editable_via_upsert(self):
        out = self._mk("Sotilgan maxsulot", 0)
        resp = self.client.put(
            "/api/products/upsert-by-barcode/",
            {"barcode": out.barcode, "name": "Qayta kirgan", "price": 12000, "stock_qty": 20},
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
        out.refresh_from_db()
        self.assertEqual(out.name, "Qayta kirgan")
        self.assertEqual(int(out.stock_qty), 20)

    def test_zero_stock_still_deletable(self):
        out = self._mk("Sotilgan maxsulot", 0)
        resp = self.client.delete(f"/api/products/{out.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Product.objects.filter(id=out.id).exists())

    def test_cashier_cannot_delete(self):
        kassir = User.objects.create_user(
            username="kassir", password="xpass1", role=User.Role.CASHIER
        )
        kassir.shop = self.shop
        kassir.save()
        p = self._mk("Tovar", 3)
        self.client.force_authenticate(user=kassir)
        resp = self.client.delete(f"/api/products/{p.id}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_with_shop_can_edit_and_delete(self):
        admin = User.objects.create_user(
            username="platform-admin", password="xpass1", is_superuser=True
        )
        admin.shop = self.shop
        admin.save()
        p = self._mk("Admin tovari", 2)

        resp = self.client.put(
            "/api/products/upsert-by-barcode/",
            {"barcode": p.barcode, "name": "Admin tahriri", "price": 15000, "stock_qty": 7},
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
        admin = User.objects.get(username="platform-admin")
        self.client.force_authenticate(user=admin)
        resp = self.client.delete(f"/api/products/{p.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)