from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contracts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="analysis_mode",
            field=models.CharField(
                choices=[("AI", "AI"), ("LOCAL_FALLBACK", "Local Fallback")],
                default="LOCAL_FALLBACK",
                max_length=20,
            ),
        ),
    ]
