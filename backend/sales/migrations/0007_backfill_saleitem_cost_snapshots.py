# Eski SaleItem larning cost_price_snapshot larini to'ldiradi.
#
# cost_price_snapshot maydoni (0006) qo'shilishidan oldin yaratilgan qatorlar
# bu maydonda NULL turgan. Hisobot bunday qatorlar uchun mahsulotning hozirgi
# cost_price qiymatiga qaytadi (Coalesce), natijada kelajakda tannarx o'zgarsa
# eski foyda ham noto'g'ri ko'rinadi.
#
# Bu migratsiya hali ham baza mahsulotiga bog'langan qatorlar uchun tannarxni
# hozirgi qiymatdan snapshot'ga ko'chiradi (history freeze). Mahsuloti o'chib
# ketgan (product NULL) qatorlarni tiklab bo'lmaydi — ular NULL qoladi.
#
# Ushbu ish 2.3 "Hisobotlarni nolga tushirish" talabining bir qismi:
# hisobotlar skript skemada rejimda on-the-fly hisoblanadi (stored yig'ma yo'q),
# shuning uchun "nolga tushirish" o'rniga eski qatorlar to'g'ri qayta hisoblanadi.

from django.db import migrations


def backfill_cost_snapshots(apps, schema_editor):
    SaleItem = apps.get_model("sales", "SaleItem")

    rows = list(
        SaleItem.objects.select_related("product")
        .filter(cost_price_snapshot__isnull=True, product__isnull=False)
    )
    if not rows:
        return

    Product = apps.get_model("catalog", "Product")
    products = {
        prod.pk: prod
        for prod in Product.objects.filter(pk__in={r.product_id for r in rows})
    }

    for row in rows:
        product = products.get(row.product_id)
        if product is not None:
            row.cost_price_snapshot = product.cost_price
            row.save(update_fields=["cost_price_snapshot"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0006_saleitem_cost_price_snapshot"),
    ]

    operations = [
        migrations.RunPython(backfill_cost_snapshots, reverse_noop),
    ]