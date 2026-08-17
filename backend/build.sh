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

  # Superuser do'konga bog'langan bo'lmasa, uning uchun do'kon yaratamiz va
  # rolini owner (egasi) qilamiz. Idempotent: allaqachon bo'lsa qayta yaratmaydi.
  python manage.py shell -c "
from django.contrib.auth import get_user_model
from shops.models import Shop
User = get_user_model()
u = User.objects.filter(username='${DJANGO_SUPERUSER_USERNAME}').first()
if u is not None:
    changed = []
    if u.shop_id is None and Shop.objects.filter(owner=u).exists():
        u.shop = Shop.objects.filter(owner=u).first()
        changed.append('shop')
    elif u.shop_id is None:
        shop = Shop.objects.create(name='Asosiy do\u0027kon', owner=u)
        u.shop = shop
        changed.append('shop')
    if u.role != 'owner':
        u.role = 'owner'
        changed.append('role')
    if changed:
        u.save(update_fields=['shop', 'role'])
        print('updated:', ', '.join(changed), 'for', u.username)
    else:
        print('shop ok for', u.username)
else:
    print('user missing')
"
fi
