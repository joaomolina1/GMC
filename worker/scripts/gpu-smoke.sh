#!/usr/bin/env bash
# Smoke test do ASR (WhisperX + pyannote) num pod GPU, sem passar pela fila:
# extrai os primeiros N segundos de um ficheiro de vídeo/áudio real, transcreve com
# diarização e mostra os primeiros segmentos. Serve para validar modelos, HF_TOKEN e cuDNN
# antes de arrancar o worker.
#
#   gpu-smoke.sh /caminho/video.mp4 [segundos=90]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INPUT="${1:-}"
SECONDS_TO_TEST="${2:-90}"

die() { printf '\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }
[ -n "$INPUT" ] && [ -f "$INPUT" ] || die "Uso: gpu-smoke.sh /caminho/para/video-ou-audio [segundos]"
[ -f "$WORKER_DIR/.gpu-env.sh" ] || die "Corre primeiro scripts/gpu-bootstrap.sh"

set -a
# shellcheck disable=SC1091
source "$WORKER_DIR/.gpu-env.sh"
[ -f "$WORKER_DIR/.env" ] && source "$WORKER_DIR/.env"
# shellcheck disable=SC1091
source "$WORKER_DIR/.gpu-env.sh"
set +a
[ -n "${HF_TOKEN:-}" ] || die "HF_TOKEN em falta (worker/.env) — necessário para a diarização pyannote"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
WAV="$TMP/sample.wav"
OUT="$TMP/transcript.json"

echo "==> a extrair ${SECONDS_TO_TEST}s de áudio (mono 16 kHz) de $INPUT"
ffmpeg -hide_banner -loglevel error -y -i "$INPUT" -t "$SECONDS_TO_TEST" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$WAV"

echo "==> WhisperX ${WHISPER_MODEL:-large-v3} em ${WHISPERX_DEVICE:-cuda} (${WHISPERX_COMPUTE_TYPE:-float16}) + diarização"
START=$(date +%s)
"$PYTHON_BIN" "$WORKER_DIR/asr/transcribe.py" \
  --audio "$WAV" --out "$OUT" \
  --model "${WHISPER_MODEL:-large-v3}" --device "${WHISPERX_DEVICE:-cuda}" \
  --compute-type "${WHISPERX_COMPUTE_TYPE:-float16}" --batch-size "${WHISPERX_BATCH_SIZE:-16}" \
  --language "${CLIPS_LANGUAGE:-pt}" --diarize
echo "==> concluído em $(( $(date +%s) - START ))s"

"$PYTHON_BIN" - "$OUT" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
segs = data.get("segments", [])
words = sum(len(s.get("words", [])) for s in segs)
speakers = sorted({s.get("speaker") for s in segs if s.get("speaker")})
print(f"segmentos: {len(segs)} | palavras alinhadas: {words} | oradores: {speakers or '-'} | língua: {data.get('language')}")
for s in segs[:8]:
    print(f"  [{s['start']:7.2f} → {s['end']:7.2f}] {s.get('speaker') or '?'}: {s['text']}")
if not segs:
    print("ATENÇÃO: sem segmentos — áudio sem fala, ou modelo/HF_TOKEN mal configurados.")
PY
