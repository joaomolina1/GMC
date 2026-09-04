#!/usr/bin/env python3
"""
WhisperX (faster-whisper large-v3 + alinhamento forçado) + pyannote (diarização).

Escreve o JSON canónico lido por lib/clips/transcription/provider.ts:
{
  "provider": "whisperx", "model": "large-v3", "language": "pt",
  "segments": [
    {"start": 1.2, "end": 4.8, "speaker": "SPEAKER_00", "text": "...",
     "words": [{"w": "Olá", "s": 1.2, "e": 1.5, "p": 0.97, "speaker": "SPEAKER_00"}]}
  ]
}

Notas honestas sobre pt-PT (ver README do worker):
  * large-v3 ronda 5–10 % WER em estúdio limpo; enviesa para pt-BR em nomes próprios;
  * timestamps por palavra a ±50 ms — é o que torna o snapping fiável;
  * em vozes sobrepostas atribui UM orador por palavra; parte da fala em crosstalk perde-se;
  * alucina em silêncio/música: filtramos por VAD do WhisperX + lista de frases conhecidas
    (o lado TS volta a filtrar com `looksLikeHallucination`).

Os modelos pyannote são gated no Hugging Face: aceitar os termos e definir HF_TOKEN.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

HALLUCINATION_MARKERS = (
    "legendas pela comunidade",
    "amara.org",
    "obrigado por assistir",
    "inscreve-te no canal",
)


def log(msg: str) -> None:
    print(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "level": "info", "message": msg}), file=sys.stderr)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="WhisperX + pyannote → JSON canónico")
    p.add_argument("--audio", required=True, help="WAV mono 16 kHz")
    p.add_argument("--out", required=True, help="Caminho do JSON de saída")
    p.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "large-v3"))
    p.add_argument("--device", default=os.environ.get("WHISPERX_DEVICE", "cuda"))
    p.add_argument("--compute-type", default=os.environ.get("WHISPERX_COMPUTE_TYPE", "float16"))
    p.add_argument("--batch-size", type=int, default=int(os.environ.get("WHISPERX_BATCH_SIZE", "16")))
    p.add_argument("--language", default="pt")
    p.add_argument("--diarize", action="store_true")
    p.add_argument("--min-speakers", type=int, default=None)
    p.add_argument("--max-speakers", type=int, default=None)
    return p.parse_args()


def is_hallucination(text: str) -> bool:
    t = text.strip().lower()
    if not t:
        return True
    return any(m in t for m in HALLUCINATION_MARKERS)


def main() -> int:
    args = parse_args()
    try:
        import whisperx  # type: ignore
    except ImportError as exc:  # pragma: no cover
        print(f"whisperx não instalado: {exc}", file=sys.stderr)
        return 3

    hf_token = os.environ.get("HF_TOKEN") or None
    if args.diarize and not hf_token:
        print("HF_TOKEN em falta: a diarização pyannote precisa de modelos gated (aceite os termos no Hugging Face).", file=sys.stderr)
        return 4

    started = time.time()
    log(f"a carregar áudio {args.audio}")
    audio = whisperx.load_audio(args.audio)

    log(f"a carregar modelo {args.model} ({args.device}, {args.compute_type})")
    model = whisperx.load_model(
        args.model,
        args.device,
        compute_type=args.compute_type,
        language=args.language,
        # VAD do WhisperX mitiga alucinações em silêncio/música.
        vad_options={"vad_onset": 0.5, "vad_offset": 0.363},
    )
    result = model.transcribe(audio, batch_size=args.batch_size, language=args.language)
    language = result.get("language") or args.language
    log(f"transcrição bruta: {len(result.get('segments', []))} segmentos em {time.time() - started:.0f}s")

    # Alinhamento forçado → timestamps por palavra.
    align_model, metadata = whisperx.load_align_model(language_code=language, device=args.device)
    result = whisperx.align(
        result["segments"], align_model, metadata, audio, args.device, return_char_alignments=False
    )
    log(f"alinhamento concluído em {time.time() - started:.0f}s")

    if args.diarize:
        try:
            from whisperx.diarize import DiarizationPipeline  # type: ignore
        except ImportError:  # versões antigas
            DiarizationPipeline = whisperx.DiarizationPipeline  # type: ignore
        diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=args.device)
        kwargs = {}
        if args.min_speakers is not None:
            kwargs["min_speakers"] = args.min_speakers
        if args.max_speakers is not None:
            kwargs["max_speakers"] = args.max_speakers
        diarize_segments = diarize_model(audio, **kwargs)
        result = whisperx.assign_word_speakers(diarize_segments, result)
        log(f"diarização concluída em {time.time() - started:.0f}s")

    segments = []
    for seg in result.get("segments", []):
        text = (seg.get("text") or "").strip()
        if is_hallucination(text):
            continue
        words = []
        for w in seg.get("words", []) or []:
            # Palavras sem alinhamento (números, símbolos) não têm start/end.
            if "start" not in w or "end" not in w:
                continue
            word = {"w": str(w.get("word", "")).strip(), "s": float(w["start"]), "e": float(w["end"])}
            if "score" in w and w["score"] is not None:
                word["p"] = float(w["score"])
            if w.get("speaker"):
                word["speaker"] = str(w["speaker"])
            if word["w"]:
                words.append(word)
        start = float(seg.get("start", words[0]["s"] if words else 0.0))
        end = float(seg.get("end", words[-1]["e"] if words else start))
        segments.append(
            {
                "start": start,
                "end": end,
                "speaker": seg.get("speaker"),
                "text": text,
                "words": words,
            }
        )

    payload = {
        "provider": "whisperx",
        "model": args.model,
        "language": language,
        "diarized": bool(args.diarize),
        "elapsed_sec": round(time.time() - started, 1),
        "segments": segments,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    log(f"escrito {args.out}: {len(segments)} segmentos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
