#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/.pids"

kill_by_pidfile() {
  local pid_file="$1"
  local name="$2"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      echo "Detenido $name (PID $pid)"
    fi
    rm -f "$pid_file"
  fi
}

mkdir -p "$PID_DIR"

kill_by_pidfile "$PID_DIR/ngrok.pid" "ngrok"
kill_by_pidfile "$PID_DIR/ngrok_rpc.pid" "ngrok-rpc"
kill_by_pidfile "$PID_DIR/ngrok_verify.pid" "ngrok-verify"
kill_by_pidfile "$PID_DIR/web.pid" "web"
kill_by_pidfile "$PID_DIR/validator.pid" "validator"

pkill -f "ngrok http 8899" >/dev/null 2>&1 || true
pkill -f "ngrok http 3000" >/dev/null 2>&1 || true
pkill -f "ngrok start --all" >/dev/null 2>&1 || true
pkill -f "next dev" >/dev/null 2>&1 || true
pkill -f "solana-test-validator" >/dev/null 2>&1 || true

echo "Servicios detenidos."
