import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@lib/clips/transcription/provider";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";
import { probe, type FfmpegConfig } from "../ffmpeg";

/**
 * Provider sem ASR (`CLIPS_TRANSCRIPTION_PROVIDER=fixture`): gera uma transcrição sintética
 * com a duração real do áudio. Serve para exercitar o pipeline ponta a ponta em máquinas
 * sem GPU. NUNCA usar em produção — o texto não corresponde ao conteúdo.
 */
export class SyntheticTranscriptionProvider implements TranscriptionProvider {
  readonly name = "fixture";

  constructor(private readonly ffmpeg: FfmpegConfig, private readonly signal?: AbortSignal) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const info = await probe(this.ffmpeg, input.audioPath, this.signal);
    const sentenceSec = 4;
    const gapSec = 0.4;
    const count = Math.max(1, Math.floor(info.durationSec / (sentenceSec + gapSec)));
    const segments = syntheticTranscript({ sentenceCount: count, sentenceSec, gapSec });
    return {
      provider: "fixture",
      model: "synthetic",
      language: input.language ?? "pt",
      segments,
      raw: { provider: "fixture", model: "synthetic", language: input.language ?? "pt", synthetic: true, durationSec: info.durationSec },
    };
  }
}
