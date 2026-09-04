import { readFile, rm } from "node:fs/promises";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@lib/clips/transcription/provider";
import { normalizeTranscription } from "@lib/clips/transcription/provider";
import { NonRetryableError } from "../errors";
import type { CommandRunner } from "../ffmpeg";
import type { WorkerConfig } from "../config";

/**
 * Implementa `TranscriptionProvider` fazendo spawn de `asr/transcribe.py` (WhisperX
 * large-v3 + alinhamento forçado + pyannote). Fica no worker, não em `lib/`, porque
 * depende de binários e GPU locais.
 */
export class WhisperXProvider implements TranscriptionProvider {
  readonly name = "whisperx";

  constructor(
    private readonly cfg: WorkerConfig["whisper"],
    private readonly run: CommandRunner,
    private readonly signal?: AbortSignal
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const outPath = `${input.audioPath}.whisperx.json`;
    const args = [
      this.cfg.scriptPath,
      "--audio",
      input.audioPath,
      "--out",
      outPath,
      "--model",
      this.cfg.model,
      "--device",
      this.cfg.device,
      "--compute-type",
      this.cfg.computeType,
      "--batch-size",
      String(this.cfg.batchSize),
      "--language",
      input.language ?? "pt",
    ];
    if (input.diarize !== false) args.push("--diarize");

    const res = await this.run(this.cfg.pythonBin, args, { signal: this.signal });
    if (res.code !== 0) {
      const tail = res.stderr.trim().split("\n").slice(-15).join("\n");
      if (/HF_TOKEN|gated|401|403|Unauthorized/i.test(tail)) {
        throw new NonRetryableError(
          `WhisperX/pyannote: acesso aos modelos negado. Aceite os termos no Hugging Face e defina HF_TOKEN. ${tail}`
        );
      }
      throw new Error(`WhisperX falhou (${res.code}): ${tail}`);
    }

    const raw = JSON.parse(await readFile(outPath, "utf8"));
    await rm(outPath, { force: true });
    return normalizeTranscription(raw);
  }
}
