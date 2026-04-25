#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT_DIR/certificacion_academica"
PID_DIR="$ROOT_DIR/.pids"
LOG_DIR="$ROOT_DIR/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

if ! command -v yarn >/dev/null 2>&1; then
  echo "Falta yarn" >&2
  exit 1
fi

kill_by_pidfile() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi
}

# Detiene instancia previa de la web (si existe)
kill_by_pidfile "$PID_DIR/web.pid"
pkill -f 'NEXT_DIST_DIR=.next-dev next dev' >/dev/null 2>&1 || true
pkill -f 'certificacion_academica/node_modules/.bin/next dev' >/dev/null 2>&1 || true
pkill -f '/yarn dev' >/dev/null 2>&1 || true

# Si algo sigue ocupando el 3000, aborta para no degradar estilos por fallback a 3001
if ss -ltnp 2>/dev/null | grep -q ':3000 '; then
  echo "El puerto 3000 sigue ocupado. Cierre la instancia existente y vuelva a ejecutar restart_web.sh" >&2
  exit 1
fi

# Levanta web con variables consistentes con iniciar_servicios.sh
cd "$APP_DIR"
nohup env \
  NEXT_PUBLIC_VERIFY_BASE_URL="${NEXT_PUBLIC_VERIFY_BASE_URL:-http://127.0.0.1:3000}" \
  NEXT_PUBLIC_NGROK_VERIFY_URL="${NEXT_PUBLIC_NGROK_VERIFY_URL:-}" \
  NGROK_PUBLIC_URL="${NGROK_PUBLIC_URL:-}" \
  yarn dev >"$LOG_DIR/web.log" 2>&1 &

echo $! >"$PID_DIR/web.pid"

# Espera corta para confirmar que respondió
for _ in $(seq 1 20); do
  if curl -sS -m 2 "http://127.0.0.1:3000/api/salud" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Web reiniciada"
echo "- PID: $(cat "$PID_DIR/web.pid")"
echo "- URL: http://127.0.0.1:3000"
echo "- Log: $LOG_DIR/web.log"
