from django.db import migrations, models


def backfill_source(apps, schema_editor):
    StoreApplication = apps.get_model("shops", "StoreApplication")
    StoreApplication.objects.filter(telegram_chat_id__isnull=False).exclude(
        telegram_chat_id=None
    ).update(source="bot")
    StoreApplication.objects.filter(telegram_chat_id__isnull=True).update(source="web")


class Migration(migrations.Migration):
    dependencies = [
        ("shops", "0008_storeapplication_delivery_channel_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="storeapplication",
            name="source",
            field=models.CharField(
                choices=[("bot", "Telegram bot"), ("web", "Websayt")],
                default="web",
                max_length=10,
            ),
        ),
        migrations.RunPython(backfill_source, migrations.RunPython.noop),
    ]
