#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT_DIR/certificacion_academica"
PID_DIR="$ROOT_DIR/.pids"
LOG_DIR="$ROOT_DIR/.logs"
LEDGER_DIR="$ROOT_DIR/.solana-ledger"
MODE="${1:-persist}"
DEPLOY_ANCHOR="${DEPLOY_ANCHOR:-}"

WALLETS=(
  "B8qunAnaG16EdD14ZpbLBBq7b8t7TYRgLJbYEtfQ6SZd"
  "4FG4iMMSuNuDBnhUbcQc6oTu8qJnCJjNT5tFnX1mT7ds"
  "CeW137pi692LZkK8CnzJYeYqCEJAJZVoWfJXZ9cMNatc"
  "9aEykqngWwkPoXuKC3JjGA3shL6DddDexVN82NdZN6yv"
  "Can3or48BKzeiZHZXg6evBWkrtuK5Jj3HuzsR2ArouQU"
)

if [[ "$MODE" != "reset" && "$MODE" != "persist" ]]; then
  echo "Uso: $0 [reset|persist]" >&2
  exit 1
fi

if [[ -z "$DEPLOY_ANCHOR" ]]; then
  if [[ "$MODE" == "reset" ]]; then
    DEPLOY_ANCHOR="1"
  else
    DEPLOY_ANCHOR="0"
  fi
fi

if [[ "$DEPLOY_ANCHOR" != "0" && "$DEPLOY_ANCHOR" != "1" ]]; then
  echo "DEPLOY_ANCHOR debe ser 0 o 1 (actual: $DEPLOY_ANCHOR)" >&2
  exit 1
fi

mkdir -p "$LOG_DIR" "$PID_DIR" "$LEDGER_DIR"

if ! command -v solana-test-validator >/dev/null 2>&1; then
  echo "Falta solana-test-validator" >&2
  exit 1
fi

if ! command -v anchor >/dev/null 2>&1; then
  echo "Falta anchor" >&2
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Falta ngrok" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Falta node (requerido para parsear API de ngrok)" >&2
  exit 1
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "Falta yarn" >&2
  exit 1
fi

if [[ -z "${NGROK_AUTHTOKEN:-}" ]]; then
  echo "Aviso: NGROK_AUTHTOKEN no definido. Se intentara levantar ngrok para 8899 sin configurar token." >&2
fi

if [[ "${NGROK_AUTHTOKEN:-}" == "TU_TOKEN_DE_NGROK" ]]; then
  echo "Aviso: NGROK_AUTHTOKEN tiene un placeholder invalido; se ignorara y se usara la configuracion persistente de ngrok." >&2
  unset NGROK_AUTHTOKEN
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

start_validator() {
  local args=(--ledger "$LEDGER_DIR")
  if [[ "$MODE" == "reset" ]]; then
    args+=(--reset)
  fi

  kill_by_pidfile "$PID_DIR/validator.pid"
  pkill -f "solana-test-validator" >/dev/null 2>&1 || true

  nohup solana-test-validator "${args[@]}" >"$LOG_DIR/validator.log" 2>&1 &
  echo $! >"$PID_DIR/validator.pid"
  sleep 4
}

wait_for_rpc() {
  local rpc_url="http://127.0.0.1:8899"

  for _ in $(seq 1 45); do
    if curl -sS -m 2 -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
      "$rpc_url" | grep -q '"result"'; then
      return 0
    fi
    sleep 1
  done

  return 1
}

deploy_anchor_with_retry() {
  local max_attempts=3
  local attempt=1

  while [[ $attempt -le $max_attempts ]]; do
    if anchor deploy >/dev/null; then
      return 0
    fi

    echo "anchor deploy fallo (intento $attempt/$max_attempts). Reintentando..." >&2
    wait_for_rpc || true
    sleep 2
    attempt=$((attempt + 1))
  done

  return 1
}

start_web() {
  local rpc_url="$1"

  if [[ -f "$PID_DIR/web.pid" ]] && kill -0 "$(cat "$PID_DIR/web.pid" 2>/dev/null || true)" >/dev/null 2>&1; then
    return
  fi

  nohup env \
    NEXT_PUBLIC_VERIFY_BASE_URL="http://127.0.0.1:3000" \
    NEXT_PUBLIC_NGROK_VERIFY_URL="" \
    NGROK_PUBLIC_URL="$rpc_url" \
    yarn dev >"$LOG_DIR/web.log" 2>&1 &
  echo $! >"$PID_DIR/web.pid"
  sleep 4
}

restart_ngrok_rpc() {
  kill_by_pidfile "$PID_DIR/ngrok.pid"
  kill_by_pidfile "$PID_DIR/ngrok_rpc.pid"
  kill_by_pidfile "$PID_DIR/ngrok_verify.pid"
  pkill -f "ngrok http 8899" >/dev/null 2>&1 || true
  pkill -f "ngrok http 3000" >/dev/null 2>&1 || true
  pkill -f "ngrok start --all" >/dev/null 2>&1 || true

  if [[ -n "${NGROK_AUTHTOKEN:-}" ]]; then
    ngrok config add-authtoken "$NGROK_AUTHTOKEN" >/dev/null 2>&1 || true
  fi

  nohup ngrok http 8899 >"$LOG_DIR/ngrok.log" 2>&1 &
  echo $! >"$PID_DIR/ngrok.pid"
}

obtener_ngrok_url() {
  local expected_target="$1"
  local url=""

  for _ in $(seq 1 45); do
    if curl -s "http://127.0.0.1:4040/api/tunnels" >/tmp/ngrok_tunnels.json 2>/dev/null; then
      url="$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync("/tmp/ngrok_tunnels.json","utf8")); const t=(j.tunnels||[]).find(x => x && x.config && x.config.addr===process.argv[1]); if (t && t.public_url) process.stdout.write(t.public_url);' "$expected_target" 2>/dev/null || true)"
      if [[ -n "$url" ]]; then
        echo "$url"
        return 0
      fi
    fi
    sleep 1
  done

  return 1
}

# 1) Levanta validador local (reset o persist)
start_validator

if ! wait_for_rpc; then
  echo "El RPC local (127.0.0.1:8899) no quedo disponible a tiempo." >&2
  exit 1
fi

# 2) Levanta/valida ngrok solo para RPC 8899 (temprano para no depender de deploy)
restart_ngrok_rpc

if grep -q "ERR_NGROK_4018" "$LOG_DIR/ngrok.log" 2>/dev/null; then
  echo "ngrok requiere cuenta verificada y authtoken. Exporte NGROK_AUTHTOKEN o configure ngrok globalmente." >&2
  exit 1
fi

# 3) Espera URL pública de ngrok para RPC
NGROK_RPC_URL="$(obtener_ngrok_url "http://localhost:8899" || true)"

if [[ -z "$NGROK_RPC_URL" ]]; then
  echo "No se pudo obtener URL publica de ngrok para RPC (8899)" >&2
  exit 1
fi

# 4) Build + deploy de Anchor (opcional)
cd "$APP_DIR"
if [[ "$DEPLOY_ANCHOR" == "1" ]]; then
  anchor build >/dev/null
  if ! deploy_anchor_with_retry; then
    echo "Fallo anchor deploy tras varios intentos. Revisa $LOG_DIR/validator.log" >&2
    exit 1
  fi
else
  echo "DEPLOY_ANCHOR=0 -> se omite build/deploy de Anchor en el arranque."
fi

# 5) Airdrop 5 SOL solo en modo reset
if [[ "$MODE" == "reset" ]]; then
  for wallet in "${WALLETS[@]}"; do
    solana airdrop 5 "$wallet" --url "http://127.0.0.1:8899" >/dev/null
    echo "Airdrop OK -> $wallet"
  done
else
  echo "Modo persist: no se realiza airdrop; se conservan saldos previos."
fi

# 6) Levanta web Next.js con RPC público
start_web "$NGROK_RPC_URL"

echo ""
echo "NGROK_PUBLIC_URL=$NGROK_RPC_URL"
echo "NEXT_PUBLIC_VERIFY_BASE_URL=http://127.0.0.1:3000"
echo ""
echo "Servicios activos:"
echo "- Solana validator: http://127.0.0.1:8899"
echo "- Web local: http://127.0.0.1:3000"
echo "- RPC publico (ngrok): $NGROK_RPC_URL"
echo "- Modo validator: $MODE"
echo ""
echo "Nota wallet: en modo reset se aplica airdrop inicial; en modo persist se conserva el saldo existente."
echo ""
echo "Logs:"
echo "- $LOG_DIR/validator.log"
echo "- $LOG_DIR/web.log"
echo "- $LOG_DIR/ngrok.log"
