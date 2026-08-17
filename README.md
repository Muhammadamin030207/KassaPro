# SmartKassa — Do'kon uchun shtrix-kodli kassa tizimi

Kichik va o'rta do'konlar uchun shtrix-kod asosida ishlaydigan, Korzinka/Havas
darajasidagi UI/UX'ga ega kassa (POS) tizimi. Mahsulot skanerlanganda narx
avtomatik chiqadi, bir xil mahsulot qayta skanerlansa miqdori oshadi, sotuv
yakunlanganda chek shakllanadi va hisobot saqlanadi.

## Texnologik stack

| Qatlam | Texnologiya |
|---|---|
| Backend | Django 5 + Django REST Framework, JWT (SimpleJWT) |
| Ma'lumotlar bazasi | PostgreSQL (Render) / SQLite (lokal) |
| Frontend | React 18 + Vite, Zustand, React Query, Framer Motion, Recharts, qrcode.react |
| Chek chop etish | `window.print()` — 80mm termal formatdagi CSS |
| To'lov | Naqd / Karta / Click / Payme — onlayn usullarda QR + karta modali |
| Deploy | Render (backend) + Vercel (frontend) |

## Loyiha tuzilishi

```
smartkassa/
├── backend/                  # Django API
│   ├── accounts/             # User, JWT, register/login, staff
│   ├── shops/                # Shop modeli
│   ├── catalog/              # Category, Product (upsert-by-barcode)
│   ├── sales/                # Sale, SaleItem, reports
│   └── smartkassa/           # settings, urls
├── frontend/                 # React (Vite)
│   └── src/
│       ├── pages/            # Kassa, Mahsulotlar, Hisobotlar, Kassirlar, Login
│       ├── components/       # Scene3D, TiltCard, ReceiptTape, ReceiptPrint, PaymentModal, SuccessOverlay...
│       ├── api/              # REST klienti (JWT refresh bilan)
│       ├── stores/           # Zustand (auth, cart)
│       └── hooks/            # useBarcodeScanner, useCountUp
└── start.sh                  # Lokal ishga tushirish skripti
```

## Lokal ishga tushirish (tezkor yo'l)

```bash
./start.sh
```

Skript backend va frontendni ishga tushiradi (login: `admin` / `admin123`,
demo do'kon va 12 ta mahsulot avtomatik yaratiladi).

## Lokal ishga tushirish (qo'lda)

### 1. Backend (Django)

```bash
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env            # kerak bo'lsa tahrirlang
venv/bin/python manage.py migrate
venv/bin/python manage.py seed_demo --owner admin --password admin123 --shop "My Shop"
venv/bin/python manage.py runserver 0.0.0.0:8001
```

> Eslatma: agar `8000` port boshqa xizmat band qilgan bo'lsa — boshqa port
> ishlating va `frontend/.env` da `VITE_PROXY_TARGET` ni shu portga qo'ying.

### 2. Frontend (React/Vite)

```bash
cd frontend
npm install
cp .env.example .env.local      # VITE_PROXY_TARGET=http://127.0.0.1:8001
npm run dev                     # → http://localhost:5173
```

### 3. Demo hisoblar

| Rol | Login | Parol |
|---|---|---|
| Do'kon egasi (owner) | `admin` | `admin123` |
| Kassir (o'zingiz qo'shasiz) | — | — |

## API endpointlari

```
POST  /api/auth/login/                  → JWT (access + refresh + user)
POST  /api/auth/refresh/                → token yangilash
POST  /api/auth/register/               → yangi do'kon egasi + do'kon
GET   /api/auth/me/                     → joriy foydalanuvchi

GET   /api/products/?search=&page=      → mahsulotlar (paginatsiya)
POST  /api/products/                    → yangi mahsulot (faqat owner)
PUT   /api/products/upsert-by-barcode/  → create-or-update (skaner formasi)
GET   /api/products/by-barcode/<code>/  → kassa uchun aniq qidiruv
PATCH /api/products/<id>/               → yangilash
DELETE /api/products/<id>/              → o'chirish (owner)

POST  /api/sales/                       → sotuv yaratish {payment_method, items[]}
GET   /api/sales/?date=&from=&to=       → sotuvlar tarixi
GET   /api/sales/<id>/                  → bitta chek (chop etish uchun)

GET   /api/reports/daily/?date=         → kunlik hisobot
GET   /api/reports/summary/?from=&to=   → davr hisoboti (foyda, kassirlar, top-10)

GET   /api/staff/                       → kassirlar (owner)
POST  /api/staff/                       → yangi kassir (owner)
DELETE /api/staff/<id>/                 → kassirni o'chirish (owner)
```

## Muhim biznes-qoidalar

- **Narxlar faqat backenddan olinadi** — frontend yuborgan narxga ishonilmaydi
  (`SaleCreateSerializer` har `product_id` narxini bazadan oladi).
- **Snapshot** — `SaleItem` chekdagi nom/barcode/narxni snapshot qilib saqlaydi,
  shuning uchun mahsulot narxi o'zgargan taqdirda eski cheklar buzilmaydi.
- **Tranzaksiya** — sotuv `transaction.atomic()` ichida bajariladi; zahira yetarli
  bo'lmasa butun chek bekor qilinadi.
- **Barcode uniqueness** — `(shop, barcode)` DB darajasida unique constraint,
  serializer validatsiyasi qo'shimcha ravishda clean 400 qaytaradi (500 emas).
  `by-barcode` lookup case-insensitive — fizik skanerlar katta/kichik harfda
  yuborsa ham bitta natija qaytadi.
- **Nomavjud mahsulot** — kassada kod topilmasa oqim TO'XTAMAYDI: skaner ostida
  inline panel ochiladi va kassir yozishda davom etishi mumkin.
- **To'lov** — Naqd/Karta to'g'ridan-to'g'ri; Click/Payme tanlansa to'lov modali
  (QR + karta raqami) chiqadi va tasdiqlangach sotuv yoziladi.
- **Rollar** — owner mahsulot/kassir boshqaradi, kassir faqat kassa ekranida
  sotuv qiladi. Barcha querysets `shop` bo'yicha filtrlanadi.

## Deploy

### Backend — Render

1. `backend/render.yaml` fayli Render Blueprint sifatida xizmat qiladi
   (Postgres + web service avtomatik yaratiladi).
2. Render dashboard → "New Blueprint" → repo tanlang.
3. `DJANGO_SUPERUSER_USERNAME` / `DJANGO_SUPERUSER_PASSWORD` env o'rnating
   (first-run superuser yaratish uchun).
4. `CORS_ALLOWED_ORIGINS` ga Vercel manzilini kiriting.

### Frontend — Vercel

1. Repo import → Vercel framework "Vite"ni avtomatik topadi.
2. Env: `VITE_API_URL=https://<sizning-backend>.onrender.com/api`
3. `vercel.json` SPA rewrite'larini sozlaydi.

## Qo'shimcha izohlar

- Chek 80mm termal printerga mos: brauzerda `Ctrl+P` → "Chop etish" (kassa
  ekranida chek yakunlanganda).
- Kassa sahifasi fizik shtrix kod skanerlariga tayyor — skaner klaviatura
  rejimida ishlaydi (Enter bilan kodni yuboradi).
- Fizik skaner yo'q bo'lsa, kodni klaviaturada yozib Enter bosing.

Kengaytirish g'oyalari (keyingi bosqichlar): Telegram-bot hisobotlari,
offline rejim (IndexedDB sinxronlash), ko'p do'konli rejim, aqlli tahlil moduli.
