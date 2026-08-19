import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_alter_devicesession_status"),
    ]

    operations = [
        migrations.DeleteModel(
            name="DeviceSession",
        ),
        migrations.DeleteModel(
            name="LoginEvent",
        ),
        migrations.DeleteModel(
            name="DeviceAuditLog",
        ),
        migrations.DeleteModel(
            name="Device",
        ),
        migrations.CreateModel(
            name="Device",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("device_id", models.CharField(db_index=True, max_length=64)),
                ("device_name", models.CharField(blank=True, max_length=255)),
                (
                    "device_model",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                (
                    "device_type",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("laptop", "Laptop"),
                            ("desktop", "Desktop"),
                            ("phone", "Smartphone"),
                            ("tablet", "Tablet"),
                            ("other", "Boshqa"),
                        ],
                        default="",
                        max_length=16,
                    ),
                ),
                ("os", models.CharField(blank=True, max_length=64)),
                ("os_version", models.CharField(blank=True, max_length=32)),
                ("browser", models.CharField(blank=True, max_length=64)),
                ("browser_version", models.CharField(blank=True, max_length=32)),
                ("is_name_manual", models.BooleanField(default=False)),
                ("is_model_manual", models.BooleanField(default=False)),
                ("first_seen_at", models.DateTimeField(auto_now_add=True)),
                ("last_active_at", models.DateTimeField(auto_now_add=True)),
                ("last_login_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="devices",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-last_active_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="device",
            constraint=models.UniqueConstraint(
                fields=["user", "device_id"],
                name="accounts_device_user_device_id_uniq",
            ),
        ),
        migrations.AddIndex(
            model_name="device",
            index=models.Index(
                fields=["user", "device_id"], name="dev_user_device_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="device",
            index=models.Index(
                fields=["user", "last_active_at"], name="dev_last_active_idx"
            ),
        ),
    ]