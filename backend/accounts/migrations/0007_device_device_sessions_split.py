import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def split_devices(apps, schema_editor):
    """Eski session-as-device ma'lumotlarini canonical Device ga ko'chiradi.

    Har bir (user, legacy_device_key) guruhi uchun BITTA Device yaratiladi —
    duplicate Record yo'q. Sessionlar (login tarixi) shu qurilmaga bog'lanadi,
    hech qanday tarix yo'qolmaydi. Idempotent: agar Device allaqachon bor
    bo'lsa, hech narsa qilinmaydi.
    """
    Device = apps.get_model("accounts", "Device")
    DeviceSession = apps.get_model("accounts", "DeviceSession")

    if Device.objects.exists():
        return

    created = {}
    for s in (
        DeviceSession.objects.exclude(legacy_device_key="")
        .order_by("user_id", "legacy_device_key", "-last_active_at", "-id")
    ):
        key = (s.user_id, s.legacy_device_key)
        if key in created:
            continue
        dev = Device.objects.create(
            user_id=s.user_id,
            device_id=s.legacy_device_key,
            device_name=s.device_name or "",
            device_model=s.device_model or "",
            device_type=s.device_type or "",
            browser=s.browser or "",
            browser_version=s.browser_version or "",
            os=s.os or "",
            os_version=s.os_version or "",
            ip_address=s.ip_address,
            user_agent=s.user_agent or "",
            location=s.location or "",
        )
        # auto_now_add maydonlarini yozib bo'lmagani uchun keyin to'g'rilaymiz
        Device.objects.filter(pk=dev.pk).update(
            first_seen_at=s.created_at,
            last_login_at=s.last_login_at,
        )
        created[key] = dev

    for s in DeviceSession.objects.all():
        if not s.legacy_device_key:
            s.delete()
            continue
        s.device_id = created[(s.user_id, s.legacy_device_key)].pk
        if s.status == "allowed":
            s.status = "expired"
        s.save(update_fields=["device_id", "status"])

    blocked_ids = set(
        DeviceSession.objects.filter(status="revoked", device_id__isnull=False)
        .values_list("device_id", flat=True)
    )
    for dev_id in blocked_ids:
        dev = Device.objects.filter(pk=dev_id).first()
        if not dev:
            continue
        latest = (
            DeviceSession.objects.filter(device_id=dev_id, status="revoked")
            .order_by("-revoked_at", "-id")
            .first()
        )
        dev.status = "blocked"
        dev.blocked_at = latest.revoked_at if latest else None
        dev.blocked_by_id = latest.revoked_by_id if latest else None
        dev.save(update_fields=["status", "blocked_at", "blocked_by_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_devicesession_device_model_devicesession_device_type_and_more"),
    ]

    operations = [
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
                    models.CharField(blank=True, default="", max_length=16),
                ),
                ("browser", models.CharField(blank=True, max_length=64)),
                ("browser_version", models.CharField(blank=True, max_length=32)),
                ("os", models.CharField(blank=True, max_length=64)),
                ("os_version", models.CharField(blank=True, max_length=32)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True)),
                ("location", models.CharField(blank=True, default="", max_length=128)),
                ("is_name_manual", models.BooleanField(default=False)),
                ("is_model_manual", models.BooleanField(default=False)),
                ("first_seen_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(auto_now_add=True)),
                ("last_login_at", models.DateTimeField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "Aktiv"), ("blocked", "Bloklangan")],
                        default="active",
                        max_length=16,
                    ),
                ),
                ("blocked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "blocked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="blocked_devices",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
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
                "ordering": ["-last_seen_at"],
            },
        ),
        migrations.RenameField(
            model_name="devicesession",
            old_name="device_id",
            new_name="legacy_device_key",
        ),
        migrations.AddField(
            model_name="devicesession",
            name="device",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sessions",
                to="accounts.device",
            ),
        ),
        migrations.AddField(
            model_name="devicesession",
            name="expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(split_devices, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="devicesession",
            name="device",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="sessions",
                to="accounts.device",
            ),
        ),
        migrations.RemoveField(
            model_name="devicesession", name="legacy_device_key"
        ),
        migrations.RemoveIndex(
            model_name="devicesession",
            name="accounts_de_user_id_520a07_idx",
        ),
        migrations.RemoveIndex(
            model_name="devicesession",
            name="accounts_de_user_id_edad7e_idx",
        ),
        migrations.RemoveField(model_name="devicesession", name="user"),
        migrations.RemoveField(model_name="devicesession", name="device_name"),
        migrations.RemoveField(model_name="devicesession", name="device_model"),
        migrations.RemoveField(model_name="devicesession", name="device_type"),
        migrations.RemoveField(model_name="devicesession", name="browser"),
        migrations.RemoveField(model_name="devicesession", name="browser_version"),
        migrations.RemoveField(model_name="devicesession", name="os"),
        migrations.RemoveField(model_name="devicesession", name="os_version"),
        migrations.RemoveField(model_name="devicesession", name="location"),
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
                fields=["user", "status"], name="accounts_de_user_id_1c4a6a_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="devicesession",
            index=models.Index(
                fields=["device", "status"], name="accounts_de_device__f13fe3_idx"
            ),
        ),
    ]