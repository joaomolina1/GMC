# syntax=docker/dockerfile:1
#
# Worker de clips (GPU). Construir A PARTIR DA RAIZ DO REPO, porque copia lib/ e worker/:
#   docker build -f worker/Dockerfile -t gmc-clips-worker .
#   docker run --gpus all --env-file worker/.env gmc-clips-worker
#
# Base CUDA 12 + cuDNN 9 (faster-whisper/ctranslate2 ≥ 4.5 precisam de cuDNN 9).

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    HF_HOME=/models/hf \
    TORCH_HOME=/models/torch \
    CLIPS_WORK_DIR=/work

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg ffmpeg python3 python3-pip python3-venv git procps \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python: torch CUDA 12.4 + WhisperX + pyannote.
COPY worker/asr/requirements.txt /app/worker/asr/requirements.txt
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cu124 \
    && python3 -m pip install --no-cache-dir -r /app/worker/asr/requirements.txt

WORKDIR /app/worker

# Node: dependências do worker (tsx corre TypeScript diretamente e resolve @lib/* via tsconfig).
COPY worker/package.json worker/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# Código partilhado + worker. Os imports "bare" (zod, @anthropic-ai/sdk, @supabase/supabase-js)
# feitos a partir de /app/lib resolvem para cima até /app/node_modules — daí o symlink.
COPY lib /app/lib
COPY worker/tsconfig.json ./
COPY worker/src ./src
COPY worker/asr ./asr
RUN ln -s /app/worker/node_modules /app/node_modules

RUN useradd --system --uid 10001 --create-home worker \
    && mkdir -p /work /models && chown -R worker:worker /work /models /app
USER worker

# Sem porta: é um consumidor de fila. O healthcheck confirma que o processo está vivo.
HEALTHCHECK --interval=60s --timeout=5s --start-period=120s --retries=3 \
  CMD pgrep -f "tsx src/index.ts" > /dev/null || exit 1

CMD ["npx", "tsx", "src/index.ts"]
