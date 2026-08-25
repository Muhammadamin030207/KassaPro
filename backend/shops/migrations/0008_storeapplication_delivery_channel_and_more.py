import secrets

from django.db import migrations, models


def populate_tracking_codes(apps, schema_editor):
    StoreApplication = apps.get_model("shops", "StoreApplication")
    for app in StoreApplication.objects.filter(tracking_code=""):
        code = f"TRK-{secrets.token_hex(5).upper()}"
        while StoreApplication.objects.filter(tracking_code=code).exists():
            code = f"TRK-{secrets.token_hex(5).upper()}"
        app.tracking_code = code
        app.save(update_fields=["tracking_code"])


class Migration(migrations.Migration):
    dependencies = [
        ("shops", "0007_auditlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="storeapplication",
            name="email",
            field=models.EmailField(blank=True),
        ),
        migrations.AddField(
            model_name="storeapplication",
            name="delivery_channel",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="storeapplication",
            name="tracking_code",
            field=models.CharField(blank=True, max_length=24),
        ),
        migrations.RunPython(populate_tracking_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="storeapplication",
            name="tracking_code",
            field=models.CharField(blank=True, max_length=24, unique=True),
        ),
    ]
