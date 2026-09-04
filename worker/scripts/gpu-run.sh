#!/usr/bin/env bash
# Arranca/pára/segue o clips-worker num pod GPU (depois do gpu-bootstrap.sh).
#
#   gpu-run.sh start    — arranca em background numa sessão tmux "clips-worker"
#   gpu-run.sh fg       — arranca em primeiro plano (Ctrl+C = SIGINT → liberta o lease e sai)
#   gpu-run.sh stop     — paragem limpa (SIGINT na sessão; o passo em curso é interrompido e o job volta à fila)
#   gpu-run.sh status   — mostra se está a correr
#   gpu-run.sh logs     — segue o log (Ctrl+C sai só do tail)
#   gpu-run.sh check    — valida configuração sem processar nada
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION="clips-worker"
LOG_FILE="${CLIPS_LOG_FILE:-/workspace/clips-worker.log}"

die() { printf '\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

load_env() {
  [ -f "$WORKER_DIR/.gpu-env.sh" ] || die "Falta $WORKER_DIR/.gpu-env.sh — corre primeiro scripts/gpu-bootstrap.sh"
  [ -f "$WORKER_DIR/.env" ] || die "Falta $WORKER_DIR/.env — copia de .env.example e preenche as chaves"
  set -a
  # shellcheck disable=SC1091
  source "$WORKER_DIR/.gpu-env.sh"
  # shellcheck disable=SC1091
  source "$WORKER_DIR/.env"
  set +a
  # .gpu-env.sh ganha ao .env para o que depende da máquina.
  # shellcheck disable=SC1091
  set -a; source "$WORKER_DIR/.gpu-env.sh"; set +a

  local missing=()
  for v in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY; do
    [ -n "${!v:-}" ] || missing+=("$v")
  done
  if [ "${CLIPS_TRANSCRIPTION_PROVIDER:-whisperx}" = "whisperx" ] && [ -z "${HF_TOKEN:-}" ]; then
    missing+=("HF_TOKEN")
  fi
  [ ${#missing[@]} -eq 0 ] || die "Variáveis em falta em $WORKER_DIR/.env: ${missing[*]}"
  case "$SUPABASE_URL" in
    https://*.supabase.co) ;;
    *) die "SUPABASE_URL deve ter a forma https://<ref>.supabase.co (recebido: $SUPABASE_URL)" ;;
  esac
  export WORKER_ID="${WORKER_ID:-gpu-$(hostname)}"
}

cmd="${1:-start}"
case "$cmd" in
  start)
    load_env
    if tmux has-session -t "=$SESSION" 2>/dev/null; then
      echo "Já está a correr (sessão tmux '$SESSION'). Usa 'stop' primeiro ou 'logs' para seguir."
      exit 0
    fi
    mkdir -p "$(dirname "$LOG_FILE")"
    # O ambiente de uma sessão tmux vem do *servidor* tmux, não desta shell — por isso o
    # comando volta a carregar .gpu-env.sh/.env (via `fg`) em vez de confiar na herança.
    # `tee` ignora o Ctrl+C para conseguir gravar as últimas linhas do worker ("SIGINT recebido…").
    tmux new-session -d -s "$SESSION" -c "$WORKER_DIR" \
      "bash '$SCRIPT_DIR/gpu-run.sh' fg 2>&1 | (trap '' INT; exec tee -a '$LOG_FILE')"
    sleep 3
    if tmux has-session -t "=$SESSION" 2>/dev/null; then
      echo "Worker a correr (WORKER_ID=$WORKER_ID). Log: $LOG_FILE"
      tail -n 5 "$LOG_FILE" 2>/dev/null || true
    else
      echo "O worker terminou logo — últimas linhas do log:"
      tail -n 20 "$LOG_FILE" 2>/dev/null || true
      exit 1
    fi
    ;;
  fg)
    load_env
    cd "$WORKER_DIR"
    exec "$WORKER_DIR/node_modules/.bin/tsx" src/index.ts
    ;;
  stop)
    if tmux has-session -t "=$SESSION" 2>/dev/null; then
      tmux send-keys -t "$SESSION" C-c
      for _ in $(seq 1 30); do
        tmux has-session -t "=$SESSION" 2>/dev/null || { echo "Worker parado (lease libertado)."; exit 0; }
        sleep 1
      done
      echo "Ainda a terminar (o passo em curso, ex. ffmpeg, está a ser interrompido)…"
    else
      echo "Não está a correr."
    fi
    ;;
  status)
    if tmux has-session -t "=$SESSION" 2>/dev/null; then
      echo "A correr (sessão tmux '$SESSION')."; tail -n 3 "$LOG_FILE" 2>/dev/null || true
    else
      echo "Parado."
    fi
    ;;
  logs)
    [ -f "$LOG_FILE" ] || die "Sem log em $LOG_FILE"
    exec tail -n 50 -f "$LOG_FILE"
    ;;
  check)
    load_env
    cd "$WORKER_DIR"
    echo "PYTHON_BIN=$PYTHON_BIN"
    "$PYTHON_BIN" -c "import torch; print('torch', torch.__version__, '| cuda:', torch.cuda.is_available())" 2>/dev/null || echo "(torch/whisperx não verificável — SKIP_PYTHON?)"
    CLIPS_WORKER_ENABLED=false "$WORKER_DIR/node_modules/.bin/tsx" src/index.ts
    echo "Configuração OK."
    ;;
  *)
    die "Comando desconhecido: $cmd (start|fg|stop|status|logs|check)"
    ;;
esac
