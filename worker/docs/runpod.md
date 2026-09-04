# Levantar o worker (WhisperX) numa GPU alugada — guia passo a passo

Objetivo: correr o `clips-worker` real (ffmpeg + WhisperX large-v3 + pyannote + Claude) num pod GPU
do [RunPod](https://www.runpod.io), apontado ao Supabase da GMC, para testar a feature com um
programa real. Sem Docker: os scripts em `worker/scripts/` instalam tudo diretamente no pod.

Custo indicativo (Secure Cloud, on-demand): L4 24 GB ≈ $0,49/h, RTX 4090 ≈ $0,74–1,10/h, mais
$0,10/GB/mês de disco. Um teste de uma tarde fica abaixo de $5. **Pára o pod quando acabares**
— um pod parado ainda cobra o volume ($0,20/GB/mês); *terminar* o pod apaga tudo.

## 0. O que precisas de ter à mão

| Coisa | Onde obter |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`) | Supabase → projeto GMC → Project Settings → API Keys → *Secret keys* (é a mesma que está nos secrets do Cursor) |
| `ANTHROPIC_API_KEY` | A mesma da Vercel |
| `HF_TOKEN` | huggingface.co → Settings → Access Tokens → *New token* (tipo **Read**) |
| Termos dos modelos pyannote aceites | Com sessão iniciada no Hugging Face, abrir **e aceitar** em cada página: [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1) e [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0). Sem isto a transcrição falha com 401/403 no primeiro job. |
| Conta RunPod com créditos | runpod.io → Billing → carregar $10 (exige ≥ 1 h de créditos para arrancar um pod) |

## 1. Criar o pod

1. RunPod → **Pods** → **Deploy**.
2. Escolhe a GPU: **NVIDIA L4 (24 GB)** ou **RTX 4090 (24 GB)**. Qualquer placa com ≥ 16 GB serve
   (large-v3 em float16 usa ~5 GB + pyannote ~2 GB); com 24 GB podes subir o `WHISPERX_BATCH_SIZE`.
3. Template: procura **"RunPod PyTorch"** (imagem `runpod/pytorch:…-cuda12.x-…-ubuntu22.04`). Qualquer
   versão 2.x serve — o bootstrap cria um venv próprio para o WhisperX.
4. **Edit template / Storage configuration**:
   - *Container disk*: 30 GB.
   - *Volume disk*: 60 GB, montado em `/workspace` (é onde ficam repo, venv, modelos e VODs em
     processamento; sobrevive a *stop/start*). Se quiseres reutilizar entre pods, cria antes um
     *Network volume* em Storage e seleciona-o aqui.
5. Não precisas de portas expostas (o worker só faz ligações de saída). Podes deixar o Jupyter
   ligado — dá-te um terminal no browser.
6. **Deploy On-Demand**. Espera até o estado ficar *Running*.

## 2. Entrar no pod

No cartão do pod → **Connect** → **Start Web Terminal** (ou *Jupyter Lab* → *Terminal*). Tens uma
shell root em Ubuntu 22.04 com o driver NVIDIA já instalado. Confirma:

```bash
nvidia-smi
```

## 3. Instalar tudo (um comando)

```bash
GMC_BRANCH=main bash <(curl -fsSL https://raw.githubusercontent.com/joaomolina1/GMC/main/worker/scripts/gpu-bootstrap.sh)
```

Enquanto o PR #53 não estiver em `main`, usa o branch do PR nos dois sítios:

```bash
GMC_BRANCH=cursor/clips-phase1-88e5 bash <(curl -fsSL https://raw.githubusercontent.com/joaomolina1/GMC/cursor/clips-phase1-88e5/worker/scripts/gpu-bootstrap.sh)
```

O script (idempotente, podes repetir):

- instala `ffmpeg`, `git`, `tmux`, Node 22;
- clona o repo em `/workspace/GMC` e instala as deps do worker;
- cria `/workspace/whisperx-venv` e instala o WhisperX (torch, faster-whisper, pyannote —
  **5–10 minutos**, ~4 GB);
- escreve `worker/.gpu-env.sh` com o `LD_LIBRARY_PATH` do cuDNN 9 (sem isto o faster-whisper
  falha com `Unable to load libcudnn_ops.so.9`), `HF_HOME=/workspace/hf-cache` e `PYTHON_BIN`;
- verifica `torch.cuda.is_available()` e cria `worker/.env` a partir do exemplo.

## 4. Configurar

```bash
nano /workspace/GMC/worker/.env
```

Preenche (o resto pode ficar como está):

```
SUPABASE_URL=https://wnhojvxnamxmpmdislcl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
ANTHROPIC_API_KEY=sk-ant-...
HF_TOKEN=hf_...
WORKER_ID=runpod-teste-1
CLIPS_TRANSCRIPTION_PROVIDER=whisperx
WHISPERX_DEVICE=cuda
WHISPERX_COMPUTE_TYPE=float16
```

Valida sem processar nada:

```bash
bash /workspace/GMC/worker/scripts/gpu-run.sh check
```

## 5. Smoke test do ASR (recomendado, 2 minutos)

Copia um vídeo/áudio real para o pod (arrasta-o para o Jupyter, ou `curl -o` de um link) e corre:

```bash
bash /workspace/GMC/worker/scripts/gpu-smoke.sh /workspace/exemplo.mp4 90
```

A primeira execução descarrega os modelos (large-v3 ~3 GB, alinhamento pt ~1,2 GB, pyannote) para
`/workspace/hf-cache` — demora alguns minutos; as seguintes não. Deves ver segmentos com
`SPEAKER_00`/`SPEAKER_01` e texto em português. Se falhar:

| Erro | Causa / solução |
|---|---|
| `401`/`403`/`gated` ao carregar pyannote | Termos não aceites nas duas páginas do Hugging Face, ou `HF_TOKEN` errado |
| `Unable to load libcudnn_ops.so.9` | `worker/.gpu-env.sh` sem `LD_LIBRARY_PATH` — volta a correr o bootstrap |
| `CUDA out of memory` | `WHISPERX_COMPUTE_TYPE=int8_float16` e/ou `WHISPERX_BATCH_SIZE=8` no `.env` |
| `torch.cuda.is_available()` = False | Pod sem GPU ou driver antigo — troca de GPU/host no RunPod |

## 6. Arrancar o worker e testar na UI

```bash
bash /workspace/GMC/worker/scripts/gpu-run.sh start
bash /workspace/GMC/worker/scripts/gpu-run.sh logs      # Ctrl+C sai só do log
```

Na app (produção ou o preview do PR): **Clips → Novo vídeo**, carrega um excerto real de 10–20 min
(2–3 oradores, áudio de estúdio, pt-PT), cria o job e segue o progresso. Tempos esperados numa L4:
20 min de VOD → ~1 min de deteção de planos, ~2–3 min de transcrição+diarização, ~30 s de Claude.
Depois: rever candidatos, ajustar in/out, aprovar um → o render aparece em ~1 min.

Testes operacionais do plano (opcionais):

```bash
# matar o worker a meio do passo "transcribe" — o job volta a 'queued' no mesmo passo e é retomado
bash /workspace/GMC/worker/scripts/gpu-run.sh stop && bash /workspace/GMC/worker/scripts/gpu-run.sh start
```

## 7. No fim

```bash
bash /workspace/GMC/worker/scripts/gpu-run.sh stop
```

e no RunPod **Stop** (mantém o volume, cobra $0,20/GB/mês) ou **Terminate** (apaga tudo, custo zero).

## Para produção (não é este guia)

Um pod on-demand 24/7 custa $350–800/mês, a maior parte parado. Quando for para produção,
escolher entre: (a) WhisperX numa GPU on-prem/reservada da GMC (áudio não sai de casa);
(b) RunPod Serverless com um handler à volta do `asr/transcribe.py` (paga-se por segundo de uso,
mas o worker precisa de ser dividido em CPU + função GPU); (c) um provider ASR por HTTP
(ElevenLabs Scribe, ~$0,22/h de áudio) com o worker CPU-only no Render. O contrato
`TranscriptionProvider` em `lib/clips/transcription/provider.ts` permite trocar sem tocar no resto.
