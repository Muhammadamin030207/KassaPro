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

  # Superuser do'konga bog'lanmagan bo'lsa, uning uchun do'kon yaratamiz.
  # SUPER_ADMIN platforma roli — kassir/owner emas. Idempotent qadam.
  python manage.py shell -c "
from django.contrib.auth import get_user_model
from shops.models import Shop
User = get_user_model()
u = User.objects.filter(username='${DJANGO_SUPERUSER_USERNAME}').first()
if u is not None:
    changed = []
    if u.shop_id is None:
        shop = Shop.objects.create(name='Asosiy do\u0027kon', owner=u)
        u.shop = shop
        changed.append('shop')
    if u.role != 'super_admin':
        u.role = 'super_admin'
        changed.append('role')
    if changed:
        u.save(update_fields=['shop', 'role'])
        print('updated:', ', '.join(changed), 'for', u.username)
    else:
        print('ok for', u.username)
else:
    print('user missing')
"
fi
