#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-$PORT}"

cd "$ROOT/backend"

echo "▶ Installing backend dependencies..."
pip install -r requirements.txt

echo "▶ Running migrations..."
python manage.py migrate --noinput

echo "▶ Creating demo data..."
python manage.py seed_demo --owner admin --password admin123 --shop "My Shop" || true

echo "▶ Starting Django..."
python manage.py runserver "0.0.0.0:$BACKEND_PORT" &
BACK_PID=$!

cd "$ROOT/frontend"

echo "▶ Installing frontend dependencies..."
npm install

echo "▶ Starting Vite..."
VITE_PROXY_TARGET="http://127.0.0.1:$BACKEND_PORT" \
npx vite --host 0.0.0.0 --port "$FRONTEND_PORT" &
FRONT_PID=$!

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null || true' EXIT

echo "======================================"
echo "SmartKassa started"
echo "Frontend port: $FRONTEND_PORT"
echo "Backend port: $BACKEND_PORT"
echo "======================================"

wait $FRONT_PID