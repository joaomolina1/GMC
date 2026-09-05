#!/usr/bin/env python3
"""
Reconhecimento de fala com timestamps por palavra (faster-whisper, CPU por defeito).

Usado por scripts/tvibox/align-subtitles.ts para colocar as legendas no instante
em que as personagens falam. Instalar: `pip install faster-whisper`.

  python3 scripts/tvibox/asr.py --audio ep1.wav --out words.json [--model small] [--prompt-file argumento.txt]

Saída: {"model": "...", "words": [{"w": "Olá", "s": 1.20, "e": 1.48, "p": 0.97}, ...],
        "segments": [{"start": 1.2, "end": 4.8, "text": "..."}]}

O argumento do episódio vai como `initial_prompt`: enviesa o modelo para o
vocabulário certo (nomes próprios, pt-PT) e melhora muito a correspondência.
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--audio", required=True, help="WAV/MP4/M4A — o ffmpeg do faster-whisper decodifica")
    p.add_argument("--out", required=True)
    p.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
    p.add_argument("--device", default=os.environ.get("WHISPER_DEVICE", "cpu"))
    p.add_argument("--compute-type", default=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"))
    p.add_argument("--language", default="pt")
    p.add_argument("--prompt-file", default=None)
    p.add_argument("--seed", type=int, default=0, help="semente do fallback de temperatura (torna a corrida reprodutível)")
    p.add_argument("--vad", action="store_true", help="filtra silêncio com VAD antes de decodificar (variante alternativa)")
    args = p.parse_args()

    try:
        import ctranslate2
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper em falta: pip install faster-whisper", file=sys.stderr)
        return 2

    # O Whisper recorre a amostragem com temperatura quando a decodificação falha;
    # sem semente fixa cada corrida dá um resultado diferente.
    ctranslate2.set_random_seed(args.seed)

    prompt = None
    if args.prompt_file:
        with open(args.prompt_file, encoding="utf-8") as fh:
            prompt = fh.read().strip()[:800] or None

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, _info = model.transcribe(
        args.audio,
        language=args.language,
        word_timestamps=True,
        beam_size=5,
        vad_filter=args.vad,
        condition_on_previous_text=False,
        initial_prompt=prompt,
    )
    words = []
    segs = []
    for s in segments:
        segs.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()})
        for w in s.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.probability, 2)})

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump({"model": args.model, "seed": args.seed, "vad": args.vad, "words": words, "segments": segs}, fh, ensure_ascii=False)
    print(f"{len(words)} palavras em {len(segs)} segmentos", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
