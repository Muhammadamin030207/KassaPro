#!/usr/bin/env bash
# SmartKassa — lokal ishga tushirish skripti (backend + frontend)
# Foydalanish:  ./start.sh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8010}"
FRONTEND_PORT="${FRONTEND_PORT:-5280}"

# Virtual env: avval .venv, aks holda venv
PY=""
for cand in "$ROOT/backend/.venv/bin/python" "$ROOT/backend/venv/bin/python"; do
  if [ -x "$cand" ]; then PY="$cand"; break; fi
done

echo "▶ Backend tayyorlanmoqda... (port $BACKEND_PORT)"
if [ -z "$PY" ]; then
  echo "  ⚠  virtual env topilmadi — .venv yaratilmoqda"
  python3 -m venv "$ROOT/backend/.venv"
  PY="$ROOT/backend/.venv/bin/python"
  "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

cd "$ROOT/backend"
"$PY" manage.py migrate --noinput >/dev/null
"$PY" manage.py seed_demo --owner owner --password owner12345 --shop "Smart Do'kon" >/dev/null 2>&1 || true
nohup "$PY" manage.py runserver "0.0.0.0:$BACKEND_PORT" > /tmp/smartkassa-backend.log 2>&1 &
BACK_PID=$!
echo "  ✔ backend: http://localhost:$BACKEND_PORT  (pid $BACK_PID)"

echo "▶ Frontend tayyorlanmoqda... (port $FRONTEND_PORT)"
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
VITE_PROXY_TARGET="http://127.0.0.1:$BACKEND_PORT" \
  nohup npx vite --host 0.0.0.0 --port "$FRONTEND_PORT" > /tmp/smartkassa-frontend.log 2>&1 &
FRONT_PID=$!
echo "  ✔ frontend: http://localhost:$FRONTEND_PORT  (pid $FRONT_PID)"

sleep 4
LAN=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "=========================================================="
echo "  SmartKassa ishga tushdi!"
echo "  Manzil:      http://localhost:$FRONTEND_PORT"
[ -n "$LAN" ] && echo "  Tarmoq:      http://$LAN:$FRONTEND_PORT  (telefon/planshet uchun)"
echo "  Admin login: owner / owner12345"
echo "  To'xtatish:  kill $BACK_PID $FRONT_PID"
echo "=========================================================="