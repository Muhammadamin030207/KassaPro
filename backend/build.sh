#!/usr/bin/env bash
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

if [ -n "$DJANGO_SUPERUSER_USERNAME" ]; then
  python manage.py createsuperuser --noinput \
    --username "$DJANGO_SUPERUSER_USERNAME" \
    --email "${DJANGO_SUPERUSER_EMAIL:-admin@smartkassa.uz}" 2>/dev/null || true

  # Superuser do'konga bog'langan bo'lmasa, uning uchun do'kon yaratamiz.
  # Bu qadam idempotent: do'kon allaqachon bog'langan bo'lsa qayta yaratmaydi.
  python manage.py shell -c "
from django.contrib.auth import get_user_model
from shops.models import Shop
User = get_user_model()
u = User.objects.filter(username='$DJANGO_SUPERUSER_USERNAME').first()
if u is not None and u.shop_id is None:
    shop = Shop.objects.create(name='Asosiy do\u0027kon', owner=u)
    u.shop = shop
    u.save(update_fields=['shop'])
    print('shop created for', u.username)
else:
    print('shop ok or user missing')
"
fi
