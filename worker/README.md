# Clips worker (Fase 1 — arquivo/VOD)

Consumidor da fila `clip_jobs` / `clip_renders` do Supabase. Corre em container **com GPU**,
fora da Vercel: o ffmpeg e o WhisperX não cabem em 300 s de função sem disco nem binários.

```
claim_next_clip_job() ── FOR UPDATE SKIP LOCKED ──► um passo por ciclo
probe → extract_audio → detect_shots → transcribe → suggest → vision_check → ready
```

- Cada passo é idempotente e retomável: relê o cursor (`clip_jobs.step`) da BD; artefactos
  intermédios (`audio.wav`, `transcript.json`) vão para o Storage para outro worker retomar.
- Lease renovado por heartbeat durante passos longos; se o processo morrer, o lease expira e
  outro worker apanha o job a partir do mesmo passo (`attempts` conta reclamações, não passos).
- `SIGTERM` interrompe o processo filho (ffmpeg/python), chama `release_clip_job()` e o job
  volta a `queued` sem gastar tentativa.
- Renders: `claim_next_clip_render()` → reconfirma `status = 'approved'` (além do trigger da BD)
  → SRT rebaseado a zero → `ffmpeg -ss … -t … -vf subtitles=` → `renders/{id}.mp4`.

## Correr

```bash
# a partir da raiz do repo
docker build -f worker/Dockerfile -t gmc-clips-worker .
docker run --gpus all --env-file worker/.env gmc-clips-worker

# local (dev), com Node 20+ e ffmpeg instalados
npm run worker:install
cp worker/.env.example worker/.env   # preencher SUPABASE_*, ANTHROPIC_API_KEY, HF_TOKEN
npm run worker:dev
```

Sem GPU, `CLIPS_TRANSCRIPTION_PROVIDER=fixture` gera uma transcrição **sintética** para
exercitar o pipeline ponta a ponta (probe → render). Nunca usar em produção.

## WhisperX + pyannote em pt-PT — o que esperar

- **Transcrição em estúdio limpo:** boa; `large-v3` ronda 5–10 % WER em português. Enviesa para
  pt-BR (vocabulário, nomes próprios); a redução vocálica do pt-PT custa-lhe mais.
- **Timestamps por palavra:** ±50 ms com alinhamento forçado — melhor que APIs comerciais
  (±100–300 ms). É o que torna o snapping a fronteiras fiável.
- **Vozes sobrepostas:** um orador por palavra; em crosstalk parte da fala não é transcrita e a
  atribuição erra. DER de 10–20 % em turnos limpos, pior em sobreposição.
- **Alucinações em silêncio/música:** VAD do WhisperX + filtro de frases conhecidas
  (`asr/transcribe.py` e `looksLikeHallucination` em `lib/clips/transcription/provider.ts`).
- **GPU obrigatória:** T4/L4 → 2 h de VOD ≈ 6–12 min de ASR + minutos de diarização. Em CPU é
  ~tempo real: inviável.
- **Gate operacional:** os modelos pyannote são gated no Hugging Face — aceitar os termos de
  `pyannote/speaker-diarization-3.1` e `pyannote/segmentation-3.0` e definir `HF_TOKEN`.
  Sem isto o primeiro job falha em `transcribe` com erro não repetível.

Consequência: o preview e o ajuste manual de in/out na UI não são um extra — são o que torna
isto utilizável. Nenhum candidato chega ao render sem passar pelos olhos de alguém.

## Testes

```bash
npm run worker:test        # steps com ffmpeg mockado + smoke test com ffmpeg real (se instalado)
npm run worker:typecheck
```
