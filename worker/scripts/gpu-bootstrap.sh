#!/usr/bin/env bash
# Prepara um pod GPU (RunPod/Lambda/VM Ubuntu 22.04+ com driver NVIDIA) para correr o
# clips-worker com WhisperX. Idempotente: pode ser corrido várias vezes.
#
# Uso (dentro do pod, como root):
#   curl -fsSL https://raw.githubusercontent.com/joaomolina1/GMC/main/worker/scripts/gpu-bootstrap.sh | bash
#   # ou, com branch específico:
#   GMC_BRANCH=cursor/clips-phase1-88e5 bash gpu-bootstrap.sh
#
# Variáveis opcionais:
#   GMC_REPO_URL  (default https://github.com/joaomolina1/GMC.git)
#   GMC_BRANCH    (default main)
#   GMC_DIR       (default /workspace/GMC — /workspace é o volume persistente no RunPod)
#   VENV_DIR      (default /workspace/whisperx-venv)
#   HF_HOME       (default /workspace/hf-cache — modelos Whisper/pyannote ficam no volume)
#   SKIP_APT=1 / SKIP_NODE=1 / SKIP_PYTHON=1  — saltar secções (para depuração)
set -euo pipefail

GMC_REPO_URL="${GMC_REPO_URL:-https://github.com/joaomolina1/GMC.git}"
GMC_BRANCH="${GMC_BRANCH:-main}"
GMC_DIR="${GMC_DIR:-/workspace/GMC}"
VENV_DIR="${VENV_DIR:-/workspace/whisperx-venv}"
HF_HOME="${HF_HOME:-/workspace/hf-cache}"
WORK_DIR="${CLIPS_WORK_DIR:-/workspace/clips-work}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mAVISO: %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "Precisa de root ou sudo"
  SUDO="sudo -n"
fi

# ---------------------------------------------------------------------------
log "GPU"
if command -v nvidia-smi >/dev/null; then
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true
else
  warn "nvidia-smi não encontrado — sem GPU visível. O WhisperX em CPU é inviável para VODs."
fi

# ---------------------------------------------------------------------------
if [ "${SKIP_APT:-0}" != "1" ]; then
  log "Pacotes do sistema (ffmpeg, git, tmux, python3-venv)"
  export DEBIAN_FRONTEND=noninteractive
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq --no-install-recommends ffmpeg git curl ca-certificates tmux python3 python3-venv python3-pip >/dev/null
fi
command -v ffmpeg >/dev/null || die "ffmpeg não instalado"
ffmpeg -version | head -1

# ---------------------------------------------------------------------------
if [ "${SKIP_NODE:-0}" != "1" ]; then
  NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
  if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
    log "Node.js 22 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash - >/dev/null
    $SUDO apt-get install -y -qq --no-install-recommends nodejs >/dev/null
  fi
fi
command -v node >/dev/null || die "node não instalado"
echo "node $(node -v) · npm $(npm -v)"

# ---------------------------------------------------------------------------
log "Repositório GMC em $GMC_DIR (branch $GMC_BRANCH)"
if [ -d "$GMC_DIR/.git" ]; then
  git -C "$GMC_DIR" fetch --quiet origin "$GMC_BRANCH"
  git -C "$GMC_DIR" checkout --quiet "$GMC_BRANCH"
  git -C "$GMC_DIR" pull --quiet --ff-only origin "$GMC_BRANCH"
else
  mkdir -p "$(dirname "$GMC_DIR")"
  git clone --quiet --branch "$GMC_BRANCH" "$GMC_REPO_URL" "$GMC_DIR"
fi
echo "commit $(git -C "$GMC_DIR" rev-parse --short HEAD)"

log "Dependências Node do worker"
npm ci --prefix "$GMC_DIR/worker" --no-audit --no-fund --loglevel=error
# Os imports "bare" feitos a partir de lib/ (zod, @anthropic-ai/sdk, @supabase/supabase-js)
# resolvem para cima até <repo>/node_modules — sem as deps da Next instaladas na raiz, aponta-se
# para as do worker (que contêm tudo o que lib/clips precisa em runtime).
if [ ! -e "$GMC_DIR/node_modules" ]; then
  ln -s "$GMC_DIR/worker/node_modules" "$GMC_DIR/node_modules"
  echo "symlink node_modules -> worker/node_modules"
fi

# ---------------------------------------------------------------------------
if [ "${SKIP_PYTHON:-0}" != "1" ]; then
  log "Python venv com WhisperX em $VENV_DIR (torch, faster-whisper, pyannote — demora alguns minutos)"
  if [ ! -x "$VENV_DIR/bin/python" ]; then
    python3 -m venv "$VENV_DIR"
  fi
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip wheel setuptools
  "$VENV_DIR/bin/pip" install --quiet -r "$GMC_DIR/worker/asr/requirements.txt"
fi
PYTHON_BIN="$VENV_DIR/bin/python"
[ -x "$PYTHON_BIN" ] || { warn "venv não encontrada em $VENV_DIR (SKIP_PYTHON?) — a usar python3 do sistema"; PYTHON_BIN="$(command -v python3)"; }

# ---------------------------------------------------------------------------
log "Ambiente GPU para o worker ($GMC_DIR/worker/.gpu-env.sh)"
# ctranslate2 (faster-whisper) precisa de encontrar o cuDNN 9/cuBLAS instalados por pip no venv;
# sem isto falha com "Unable to load libcudnn_ops.so.9".
CUDA_LIBS="$("$PYTHON_BIN" - <<'PY' 2>/dev/null || true
import importlib.util, pathlib
paths = []
for mod in ("nvidia.cudnn", "nvidia.cublas"):
    spec = importlib.util.find_spec(mod)
    if spec and spec.submodule_search_locations:
        paths.append(str(pathlib.Path(list(spec.submodule_search_locations)[0]) / "lib"))
print(":".join(paths))
PY
)"
mkdir -p "$HF_HOME" "$WORK_DIR"
cat > "$GMC_DIR/worker/.gpu-env.sh" <<EOF
# Gerado por gpu-bootstrap.sh — carregado pelo gpu-run.sh
export PYTHON_BIN="$PYTHON_BIN"
export HF_HOME="$HF_HOME"
export TORCH_HOME="$HF_HOME/torch"
export CLIPS_WORK_DIR="$WORK_DIR"
export LD_LIBRARY_PATH="${CUDA_LIBS:+$CUDA_LIBS:}\${LD_LIBRARY_PATH:-}"
EOF
cat "$GMC_DIR/worker/.gpu-env.sh"

# ---------------------------------------------------------------------------
if [ "${SKIP_PYTHON:-0}" != "1" ]; then
  log "Verificação: torch/CUDA/whisperx"
  # shellcheck disable=SC1090
  source "$GMC_DIR/worker/.gpu-env.sh"
  "$PYTHON_BIN" - <<'PY'
import torch, whisperx, ctranslate2
print("torch", torch.__version__, "| cuda disponível:", torch.cuda.is_available(),
      "| gpu:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "-")
print("whisperx", getattr(whisperx, "__version__", "?"), "| ctranslate2", ctranslate2.__version__,
      "| cuda devices (ct2):", ctranslate2.get_cuda_device_count())
PY
fi

# ---------------------------------------------------------------------------
ENV_FILE="$GMC_DIR/worker/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "A criar $ENV_FILE a partir de .env.example — PREENCHE as chaves antes de arrancar"
  cp "$GMC_DIR/worker/.env.example" "$ENV_FILE"
  sed -i 's|^CLIPS_WORK_DIR=.*|CLIPS_WORK_DIR='"$WORK_DIR"'|' "$ENV_FILE"
fi

cat <<EOF

$(printf '\033[1;32m')Bootstrap concluído.$(printf '\033[0m')

Próximos passos:
  1. Edita $ENV_FILE e preenche:
       SUPABASE_URL=https://wnhojvxnamxmpmdislcl.supabase.co
       SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   (Supabase → Project Settings → API Keys → secret)
       ANTHROPIC_API_KEY=sk-ant-...
       HF_TOKEN=hf_...                            (Hugging Face; aceitar termos dos modelos pyannote)
       WORKER_ID=runpod-\$(hostname)
  2. (opcional) Testa o ASR num ficheiro real:
       bash $GMC_DIR/worker/scripts/gpu-smoke.sh /caminho/para/video.mp4
  3. Arranca o worker em background (tmux) e segue os logs:
       bash $GMC_DIR/worker/scripts/gpu-run.sh start
       bash $GMC_DIR/worker/scripts/gpu-run.sh logs
EOF
