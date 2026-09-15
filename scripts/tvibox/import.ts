/**
 * Importa uma novela pronta (zip com episódios ou MP4s soltos) para o TVI BOX e
 * preenche tudo o que falta com IA: títulos, sinopses, ganchos, posters e legendas.
 *
 *   npx tsx scripts/tvibox/import.ts --job <id> [--publish]            # job criado no Estúdio (ficheiros no bucket tvibox-imports)
 *   npx tsx scripts/tvibox/import.ts --zip novela.zip [--slug x] [--title "..."] [--publish] [--sort 1]
 *   npx tsx scripts/tvibox/import.ts --dir pasta/ ...
 *
 * Opções: --model medium (Whisper) · --claude <modelo> · --work <dir> · --limit N (só os N primeiros) · --frames 6
 *         --dry-run (não carrega nem escreve na BD; deixa proposta, posters e legendas em <work>/<slug>/) · --fresh (ignora propostas em cache)
 *         --skip-media (numa repetição, mantém vídeo/poster já carregados e só refaz textos e legendas)
 *
 * Passos (cada um com cache em <work>/<slug>/, por isso pode ser repetido):
 *   1. deteção dos episódios pelo nome dos ficheiros (duplicados, corrompidos, buracos)
 *   2. ffprobe + transcodificação para H.264/AAC faststart quando o codec não é H.264 (AV1 não toca em iPhone)
 *   3. folha de contacto (N frames numerados) + transcrição com timestamps (faster-whisper)
 *   4. Claude, episódio a episódio com memória dos anteriores: título, sinopse, gancho, poster, resumo
 *   5. Claude, série: título, género, tagline, sinopse, paleta, elenco; revisão anti-spoiler de toda a temporada
 *   6. legendas WebVTT a partir da transcrição, com correção ortográfica de nomes pelo modelo
 *   7. upload (vídeo, poster, legendas) e criação/atualização da série e episódios
 *      (rascunho por omissão; --publish publica EP1 grátis e os restantes a 15 moedas)
 *
 * Requisitos: ffmpeg/ffprobe, unzip, python3 + faster-whisper, ANTHROPIC_API_KEY, SUPABASE_SECRET_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  episodeProposalSchema,
  extractJson,
  importProposalSchema,
  isVideoFile,
  pickEpisodeFiles,
  segmentsToCues,
  seriesProposalSchema,
  seriesTitleFromFilenames,
  slugify,
  type AsrSegment,
  type EpisodeProposal,
  type ImportProposal,
  type SeriesProposal,
  type SourceFile,
} from "../../lib/tvibox/import";
import { TVIBOX_BUCKET, episodePosterPath, episodeSubtitlesPath, episodeVideoPath, posterPath, publicUrl } from "../../lib/tvibox/media";
import { cuesToVtt, type Cue } from "../../lib/tvibox/subtitles";
import { loadLocalEnv, log, serviceClient, supabaseUrl } from "./env";

const IMPORTS_BUCKET = "tvibox-imports";
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
}

interface Probe {
  duration: number;
  vcodec: string | null;
  width: number;
  height: number;
}

function probe(file: string): Probe | null {
  try {
    const j = JSON.parse(sh("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]));
    const v = (j.streams as { codec_type: string; codec_name: string; width: number; height: number }[]).find((s) => s.codec_type === "video");
    return { duration: Number(j.format?.duration ?? 0), vcodec: v?.codec_name ?? null, width: v?.width ?? 0, height: v?.height ?? 0 };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Job (linha em tvibox_import_jobs) — opcional quando se corre com --zip/--dir */

type Sb = ReturnType<typeof serviceClient>;

class JobLog {
  private lines: string[] = [];
  constructor(
    private sb: Sb,
    private jobId: string | null
  ) {}
  async log(msg: string, progress?: number, step?: string) {
    log(msg);
    this.lines.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    if (!this.jobId) return;
    const patch: Record<string, unknown> = { log: this.lines.slice(-400) };
    if (progress !== undefined) patch.progress = Math.min(100, Math.max(0, Math.round(progress)));
    if (step) patch.step = step;
    await this.sb.from("tvibox_import_jobs").update(patch).eq("id", this.jobId);
  }
  async set(patch: Record<string, unknown>) {
    if (!this.jobId) return;
    await this.sb.from("tvibox_import_jobs").update(patch).eq("id", this.jobId);
  }
}

/* ------------------------------------------------------------------ */
/* Fontes: job (bucket privado), zip local ou pasta */

async function resolveSources(sb: Sb, work: string, jobId: string | null): Promise<{ files: string[]; hints: Record<string, string> }> {
  const srcDir = join(work, "src");
  mkdirSync(srcDir, { recursive: true });
  let hints: Record<string, string> = {};

  if (jobId) {
    const { data: job, error } = await sb.from("tvibox_import_jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error(`job ${jobId} não existe`);
    hints = (job.hints ?? {}) as Record<string, string>;
    const files = (job.files ?? []) as { name: string; path: string }[];
    if (!files.length) throw new Error("job sem ficheiros");
    for (const f of files) {
      const local = join(srcDir, basename(f.path));
      if (existsSync(local)) continue;
      const { data, error: dErr } = await sb.storage.from(IMPORTS_BUCKET).download(f.path);
      if (dErr || !data) throw new Error(`download ${f.path}: ${dErr?.message}`);
      writeFileSync(local, Buffer.from(await data.arrayBuffer()));
    }
  } else if (arg("zip")) {
    const zip = resolve(arg("zip") as string);
    if (!existsSync(zip)) throw new Error(`zip não encontrado: ${zip}`);
    const marker = join(srcDir, ".unzipped");
    if (!existsSync(marker)) {
      execFileSync("unzip", ["-o", "-q", zip, "-d", srcDir], { stdio: "inherit" });
      writeFileSync(marker, zip);
    }
  } else if (arg("dir")) {
    return { files: walk(resolve(arg("dir") as string)), hints };
  } else {
    throw new Error("indica --job <id>, --zip <ficheiro> ou --dir <pasta>");
  }

  // Zips carregados pelo Estúdio (ou dentro de zips): descompactar tudo.
  for (const z of walk(srcDir).filter((f) => /\.zip$/i.test(f))) {
    const marker = `${z}.unzipped`;
    if (existsSync(marker)) continue;
    execFileSync("unzip", ["-o", "-q", z, "-d", join(srcDir, basename(z, extname(z)))], { stdio: "inherit" });
    writeFileSync(marker, "1");
  }
  return { files: walk(srcDir), hints };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Media: transcodificação, frames, transcrição */

function ensureVideo(src: string, out: string, p: Probe) {
  // Um ficheiro truncado (processo interrompido) não conta como cache.
  if (existsSync(out)) {
    const q = probe(out);
    if (q && q.duration > 0 && Math.abs(q.duration - p.duration) < 2) return;
    rmSync(out, { force: true });
  }
  const remux = p.vcodec === "h264" && p.width <= 1080 && /\.mp4$/i.test(src);
  const args = remux
    ? ["-i", src, "-c", "copy", "-movflags", "+faststart", out]
    : ["-i", src, "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out];
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function frameTimes(duration: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(0.5, Math.min(duration - 0.5, (duration * (i + 0.5)) / n)));
}

/** Folha de contacto numerada (grelha 3 colunas) para o modelo escolher o poster. */
function contactSheet(video: string, out: string, times: number[]) {
  if (existsSync(out)) return;
  const inputs = times.flatMap((t) => ["-ss", t.toFixed(2), "-i", video]);
  const label = (i: number) =>
    existsSync(FONT) ? `,drawtext=fontfile=${FONT}:text='${i + 1}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.6:boxborderw=12:x=20:y=20` : "";
  const scaled = times.map((_, i) => `[${i}:v]scale=360:640:force_original_aspect_ratio=increase,crop=360:640${label(i)}[f${i}]`).join(";");
  const cols = 3;
  const graph = `${scaled};${times.map((_, i) => `[f${i}]`).join("")}xstack=inputs=${times.length}:layout=${times
    .map((_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 640}`)
    .join("|")}:fill=black[out]`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-q:v", "4", out], { stdio: "inherit" });
}

function posterFrame(video: string, out: string, t: number) {
  if (existsSync(out)) return;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", t.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280", "-q:v", "3", out], { stdio: "inherit" });
}

function transcribe(video: string, wav: string, out: string, model: string, promptFile: string): AsrSegment[] {
  if (!existsSync(wav)) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav]);
  if (!existsSync(out)) {
    execFileSync("python3", [resolve("scripts/tvibox/asr.py"), "--audio", wav, "--out", out, "--model", model, "--vad", "--prompt-file", promptFile], { stdio: ["ignore", "ignore", "pipe"] });
  }
  return (JSON.parse(readFileSync(out, "utf8")) as { segments: AsrSegment[] }).segments;
}

/* ------------------------------------------------------------------ */
/* Claude */

const SYSTEM = `És a equipa editorial do TVI BOX, a plataforma de novelas verticais da TVI (formato DramaBox: episódios de 1–2 minutos, um cliffhanger por episódio, desbloqueio com moedas).
Escreves sempre em português europeu (Portugal), nunca em português do Brasil: "tu", "estás", "telemóvel", "a fazer". Tom: telenovela popular, direto, com suspense, sem exageros nem emojis.
Respondes exclusivamente com um objeto JSON válido, sem texto antes ou depois.`;

async function claudeJson<T>(client: Anthropic, model: string, user: Anthropic.MessageParam["content"], parse: (raw: unknown) => T, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const res = await client.messages.create({ model, max_tokens: 2000, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: user }] });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    try {
      return parse(extractJson(text));
    } catch (e) {
      lastErr = e;
      log(`  resposta inválida do modelo (tentativa ${i + 1}): ${e instanceof Error ? e.message : e}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("modelo não devolveu JSON válido");
}

function image(path: string): Anthropic.ImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: readFileSync(path).toString("base64") } };
}

function transcriptText(segments: AsrSegment[]): string {
  if (!segments.length) return "(sem fala percetível — só imagem/música)";
  return segments.map((s) => `[${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, "0")}] ${s.text.trim()}`).join("\n");
}

async function proposeEpisode(
  client: Anthropic,
  model: string,
  ctx: { titleHint: string; number: number; total: number; duration: number; sheet: string; frames: number; segments: AsrSegment[]; previous: { number: number; title: string; summary: string }[]; cast: string[] }
): Promise<EpisodeProposal> {
  const prev = ctx.previous.length
    ? `Episódios anteriores (resumo factual):\n${ctx.previous.map((p) => `EP ${p.number} «${p.title}»: ${p.summary}`).join("\n")}`
    : "Este é o primeiro episódio.";
  const text = `Série: «${ctx.titleHint}» (${ctx.total} episódios). Estás a preparar o EP ${ctx.number} (${Math.round(ctx.duration)} s).
${ctx.cast.length ? `Personagens já identificadas: ${ctx.cast.join(", ")}.` : ""}
${prev}

Transcrição do EP ${ctx.number} (Whisper, pode ter erros em nomes):
${transcriptText(ctx.segments)}

A imagem é a folha de contacto do episódio: ${ctx.frames} frames numerados de 1 a ${ctx.frames}, por ordem cronológica.

Regra de ouro: título, sinopse e gancho são lidos ANTES de ver o episódio (lista da série e cartão bloqueado). Nunca revelam reviravoltas, confissões, a identidade do assassino, mortes, parentescos secretos nem o desfecho de uma cena — levantam a pergunta, não dão a resposta. Esses factos vão só para "summary".

Devolve JSON com:
- "title": título do episódio (máx. 40 caracteres, sem "EP n", sem aspas, intrigante mas fiel ao que acontece, sem spoilers)
- "synopsis": sinopse do episódio para a ficha (máx. 200 caracteres, presente do indicativo, sem revelar o que se descobre no episódio)
- "hookTitle": título curto do gancho (máx. 40 caracteres) — aparece no cartão bloqueado antes de a pessoa desbloquear este episódio
- "hookText": frase de gancho (máx. 160 caracteres) que faz a pessoa querer pagar para ver este episódio, sem contar o que acontece
- "posterFrame": número (1–${ctx.frames}) do frame com mais força para poster: rosto nítido, emoção, boa luz; evita frames escuros ou com texto
- "summary": resumo factual do que acontece de facto (máx. 500 caracteres) para dar continuidade aos episódios seguintes, incluindo nomes
- "characters": nomes das personagens que aparecem ou são mencionadas (nomes próprios tal como são ditos, corrigidos se o Whisper os estropiou)
- "confidence": "high" | "medium" | "low" (low quando quase não há fala e a imagem não chega para perceber a cena)`;
  return claudeJson(client, model, [{ type: "text", text }, image(ctx.sheet)], (raw) => episodeProposalSchema.parse(raw));
}

async function proposeSeries(
  client: Anthropic,
  model: string,
  ctx: { titleHint: string | null; episodes: { number: number; title: string; summary: string }[]; cast: string[]; sheet: string }
): Promise<SeriesProposal> {
  const text = `Novela vertical com ${ctx.episodes.length} episódios.${ctx.titleHint ? ` O nome dos ficheiros sugere o título «${ctx.titleHint}» — mantém-no se fizer sentido.` : ""}
Personagens identificadas: ${ctx.cast.join(", ") || "—"}.

Resumo episódio a episódio:
${ctx.episodes.map((e) => `EP ${e.number} «${e.title}»: ${e.summary}`).join("\n")}

A imagem são frames do primeiro episódio (estilo visual, luz, paleta).

Devolve JSON com:
- "title": título da série
- "genre": género em 1–3 palavras (ex.: "Mistério · Comédia", "Drama", "Romance · CEO")
- "tagline": etiqueta curta (máx. 30 caracteres, ex.: "Original TVI", "Novo", "Em alta")
- "synopsis": sinopse da série (máx. 400 caracteres, sem revelar o desfecho, com o gancho central)
- "palette": {"from": "#rrggbb", "to": "#rrggbb"} — duas cores escuras coerentes com a imagem (de cima para baixo), para o fundo do cartão
- "cast": lista de {"name","role"} das personagens principais (máx. 10), com o papel em poucas palavras
- "badge": "new" | "hot" | null`;
  return claudeJson(client, model, [{ type: "text", text }, image(ctx.sheet)], (raw) => seriesProposalSchema.parse(raw));
}

const seasonReviewSchema = z.object({
  episodes: z.array(
    z.object({
      number: z.number().int().min(1),
      title: z.string().trim().min(2).max(60),
      synopsis: z.string().trim().min(10).max(260),
      hookTitle: z.string().trim().min(2).max(60),
      hookText: z.string().trim().min(10).max(220),
    })
  ),
});

/**
 * Revisão de temporada: com a história toda conhecida, o modelo reescreve os textos
 * que, lidos antes de ver, estragam surpresas (quem matou, confissões, parentescos, mortes).
 */
async function reviewSeason(client: Anthropic, model: string, episodes: { number: number; proposal: EpisodeProposal }[]): Promise<Map<number, EpisodeProposal>> {
  const text = `Revisão editorial final de uma novela de mistério com ${episodes.length} episódios. Abaixo tens, por episódio, o RESUMO factual (o que acontece de facto, incluindo o desfecho) e os textos públicos que o espectador lê ANTES de ver o episódio: título, sinopse e gancho do cartão bloqueado.

Tarefa: devolve os textos públicos de TODOS os episódios, reescrevendo apenas os que revelam algo que só se deve descobrir a ver — identidade do assassino ou do ladrão, confissões, mortes, parentescos secretos, romances escondidos, o resultado de um confronto. Mantém intactos os que já estão bem. Um bom título/gancho de mistério faz a pergunta ("Quem levou o Galo?") em vez de dar a resposta ("Foi o mordomo"). Limites: título e hookTitle ≤ 40 caracteres, sinopse ≤ 200, hookText ≤ 160. Português europeu.

${episodes
  .map(
    (e) => `EP ${e.number}
RESUMO: ${e.proposal.summary}
title: ${e.proposal.title}
synopsis: ${e.proposal.synopsis}
hookTitle: ${e.proposal.hookTitle}
hookText: ${e.proposal.hookText}`
  )
  .join("\n\n")}

Devolve JSON: {"episodes":[{"number":1,"title":"…","synopsis":"…","hookTitle":"…","hookText":"…"}, …]} com os ${episodes.length} episódios.`;
  const res = await client.messages.create({ model, max_tokens: 16000, temperature: 0.3, system: SYSTEM, messages: [{ role: "user", content: text }] });
  const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const parsed = seasonReviewSchema.parse(extractJson(raw));
  const out = new Map<number, EpisodeProposal>();
  for (const e of episodes) {
    const r = parsed.episodes.find((x) => x.number === e.number);
    out.set(e.number, r ? { ...e.proposal, title: r.title, synopsis: r.synopsis, hookTitle: r.hookTitle, hookText: r.hookText } : e.proposal);
  }
  return out;
}

/** Corrige ortografia/nomes das legendas sem alterar o sentido nem o número de linhas. */
async function fixSubtitles(client: Anthropic, model: string, cues: Cue[], cast: string[]): Promise<Cue[]> {
  if (!cues.length) return cues;
  const text = `Legendas geradas automaticamente (Whisper) de um episódio de novela em português europeu. Personagens: ${cast.join(", ") || "—"}.
Corrige apenas erros evidentes de reconhecimento: nomes próprios (usa a grafia das personagens acima), palavras estropiadas, pontuação e maiúsculas. Não reescrevas frases, não resumas, não traduzas, não acrescentes nem removas linhas.
Devolve JSON: {"lines": [..]} com exatamente ${cues.length} strings, na mesma ordem.

${JSON.stringify(cues.map((c) => c.text))}`;
  try {
    const fixed = await claudeJson(client, model, [{ type: "text", text }], (raw) => {
      const lines = (raw as { lines?: unknown }).lines;
      if (!Array.isArray(lines) || lines.length !== cues.length || !lines.every((l) => typeof l === "string" && l.trim())) throw new Error("linhas em número diferente");
      return lines as string[];
    });
    return cues.map((c, i) => ({ ...c, text: fixed[i].trim() }));
  } catch (e) {
    log(`  legendas: correção ignorada (${e instanceof Error ? e.message : e})`);
    return cues;
  }
}

/* ------------------------------------------------------------------ */

async function upload(sb: Sb, path: string, body: Buffer | string, contentType: string): Promise<string> {
  const { error } = await sb.storage.from(TVIBOX_BUCKET).upload(path, body, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return `${publicUrl(supabaseUrl(), path)}?v=${Date.now().toString(36)}`;
}

async function main() {
  loadLocalEnv();
  const sb = serviceClient();
  const jobId = arg("job") ?? null;
  const jl = new JobLog(sb, jobId);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY em falta");
  const client = new Anthropic({ apiKey: anthropicKey });
  const claudeModel = arg("claude", process.env.TVIBOX_IMPORT_MODEL ?? "claude-sonnet-4-6") as string;
  const whisperModel = arg("model", "medium") as string;
  const frames = Math.max(3, Math.min(12, Number(arg("frames", "6"))));
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  const dryRun = flag("dry-run");
  // --skip-media: repete só textos/legendas, mantendo vídeo e poster já carregados.
  const skipMedia = flag("skip-media");

  try {
    await jl.set({ status: "running", error: null, progress: 1 });
    const workRoot = resolve(arg("work", "/tmp/tvibox/import") as string);
    const stage = join(workRoot, jobId ?? `local-${slugify(basename(arg("zip") ?? arg("dir") ?? "import"))}`);
    mkdirSync(stage, { recursive: true });
    const { files, hints } = await resolveSources(sb, stage, jobId);
    await jl.log(`${files.length} ficheiro(s) na origem`, 3, "detect");

    // 1. deteção
    const sources: SourceFile[] = files
      .filter(isVideoFile)
      .map((f) => ({ name: f, durationSeconds: probe(f)?.duration ?? null, sizeBytes: statSync(f).size }));
    const detection = pickEpisodeFiles(sources);
    for (const w of detection.warnings) await jl.log(`aviso: ${w}`);
    const episodes = detection.episodes.slice(0, limit);
    if (!episodes.length) throw new Error("nenhum episódio detetado nos ficheiros");
    const titleHint = arg("title") ?? hints.title ?? seriesTitleFromFilenames(episodes.map((e) => e.file.name)) ?? "Novela";
    const slug = arg("slug") ?? hints.slug ?? slugify(titleHint);
    const work = join(workRoot, slug);
    mkdirSync(work, { recursive: true });
    await jl.log(`${episodes.length} episódios detetados · título provável «${titleHint}» · slug ${slug}`, 5);

    const promptFile = join(work, "prompt.txt");
    if (!existsSync(promptFile)) writeFileSync(promptFile, `${titleHint}.`);

    // 2–4. media + proposta por episódio (sequencial: cada episódio conhece os anteriores)
    type EpWork = { number: number; src: string; video: string; sheet: string; times: number[]; segments: AsrSegment[]; probe: Probe; proposal: EpisodeProposal };
    const done: EpWork[] = [];
    const cast = new Set<string>();
    for (const [i, ep] of episodes.entries()) {
      const pad = String(ep.number).padStart(2, "0");
      const p = probe(ep.file.name)!;
      const video = join(work, `ep${pad}.mp4`);
      const pct = 5 + (i / episodes.length) * 70;
      await jl.log(`EP ${ep.number}: ${p.vcodec} ${p.width}x${p.height}, ${Math.round(p.duration)} s — ${p.vcodec === "h264" ? "remux" : "transcodificar"}`, pct, `ep${ep.number}`);
      ensureVideo(ep.file.name, video, p);
      const times = frameTimes(p.duration, frames);
      const sheet = join(work, `ep${pad}.sheet.jpg`);
      contactSheet(video, sheet, times);
      const segments = transcribe(video, join(work, `ep${pad}.wav`), join(work, `ep${pad}.asr.json`), whisperModel, promptFile);
      const cacheFile = join(work, `ep${pad}.proposal.json`);
      let proposal: EpisodeProposal;
      if (existsSync(cacheFile) && !flag("fresh")) {
        proposal = episodeProposalSchema.parse(JSON.parse(readFileSync(cacheFile, "utf8")));
      } else {
        proposal = await proposeEpisode(client, claudeModel, {
          titleHint,
          number: ep.number,
          total: episodes.length,
          duration: p.duration,
          sheet,
          frames,
          segments,
          previous: done.slice(-6).map((d) => ({ number: d.number, title: d.proposal.title, summary: d.proposal.summary })),
          cast: [...cast],
        });
        writeFileSync(cacheFile, JSON.stringify(proposal, null, 2));
      }
      proposal.characters.forEach((c) => cast.add(c));
      await jl.log(`EP ${ep.number} → «${proposal.title}» (${proposal.confidence}) · ${segments.length} falas`);
      done.push({ number: ep.number, src: ep.file.name, video, sheet, times, segments, probe: p, proposal });
    }

    // 5. série
    await jl.log("A propor a ficha da série…", 78, "series");
    const seriesCache = join(work, "series.proposal.json");
    let series: SeriesProposal;
    if (existsSync(seriesCache) && !flag("fresh")) {
      series = seriesProposalSchema.parse(JSON.parse(readFileSync(seriesCache, "utf8")));
    } else {
      series = await proposeSeries(client, claudeModel, {
        titleHint: arg("title") ?? hints.title ?? seriesTitleFromFilenames(episodes.map((e) => e.file.name)),
        episodes: done.map((d) => ({ number: d.number, title: d.proposal.title, summary: d.proposal.summary })),
        cast: [...cast],
        sheet: done[0].sheet,
      });
      writeFileSync(seriesCache, JSON.stringify(series, null, 2));
    }
    if (arg("title") ?? hints.title) series.title = (arg("title") ?? hints.title) as string;

    // 5b. revisão anti-spoiler da temporada inteira (o modelo já conhece o desfecho)
    const reviewCache = join(work, "season.review.json");
    let reviewed: Map<number, EpisodeProposal>;
    if (existsSync(reviewCache) && !flag("fresh")) {
      reviewed = new Map(Object.entries(JSON.parse(readFileSync(reviewCache, "utf8")) as Record<string, EpisodeProposal>).map(([k, v]) => [Number(k), v]));
    } else {
      await jl.log("Revisão anti-spoiler dos títulos, sinopses e ganchos…", 79, "review");
      reviewed = await reviewSeason(client, claudeModel, done.map((d) => ({ number: d.number, proposal: d.proposal })));
      writeFileSync(reviewCache, JSON.stringify(Object.fromEntries(reviewed), null, 2));
    }
    let changed = 0;
    for (const d of done) {
      const r = reviewed.get(d.number);
      if (r && (r.title !== d.proposal.title || r.synopsis !== d.proposal.synopsis || r.hookText !== d.proposal.hookText)) changed++;
      if (r) d.proposal = r;
    }
    await jl.log(`Revisão: ${changed} episódio(s) reescritos para não estragar surpresas`);
    await jl.log(`Série: «${series.title}» · ${series.genre} · elenco: ${series.cast.map((c) => c.name).join(", ")}`, 80);
    const castNames = series.cast.map((c) => c.name);

    // 6–7. legendas, posters, upload, BD
    const { data: existing } = await sb.from("tvibox_series").select("id, sort_order").eq("slug", slug).maybeSingle();
    const { data: maxRow } = await sb.from("tvibox_series").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const sortOrder = arg("sort") ? Number(arg("sort")) : existing?.sort_order ?? (maxRow?.sort_order ?? 0) + 1;
    const publish = flag("publish") || hints.publish === "true";

    const seriesPoster = join(work, "series.poster.jpg");
    posterFrame(done[0].video, seriesPoster, done[0].times[done[0].proposal.posterFrame - 1] ?? done[0].times[0]);
    const seriesPosterUrl = dryRun ? null : await upload(sb, posterPath(slug), readFileSync(seriesPoster), "image/jpeg");

    const seriesRow = {
      slug,
      title: series.title,
      genre: series.genre,
      tagline: series.tagline || null,
      synopsis: series.synopsis,
      badge: series.badge,
      palette: series.palette,
      poster_url: seriesPosterUrl,
      total_episodes: episodes.length,
      sort_order: sortOrder,
      cast_notes: series.cast,
    };
    let seriesId = "dry-run";
    if (!dryRun) {
      const { data: seriesSaved, error: sErr } = existing
        ? await sb.from("tvibox_series").update(seriesRow).eq("id", existing.id).select("id").single()
        : await sb.from("tvibox_series").insert(seriesRow).select("id").single();
      if (sErr || !seriesSaved) throw new Error(`série: ${sErr?.message}`);
      seriesId = seriesSaved.id as string;
      await jl.set({ series_id: seriesId });
    }

    const { data: existingEps } = dryRun ? { data: [] } : await sb.from("tvibox_episodes").select("number, video_url, poster_url").eq("series_id", seriesId);
    const existingByNumber = new Map((existingEps ?? []).map((e) => [e.number as number, e as { video_url: string | null; poster_url: string | null }]));
    const proposalOut: ImportProposal = { series, episodes: [], warnings: detection.warnings };
    for (const [i, d] of done.entries()) {
      const pad = String(d.number).padStart(2, "0");
      await jl.log(`EP ${d.number}: legendas, poster e upload`, 80 + (i / done.length) * 18, `publish${d.number}`);
      const cues = await fixSubtitles(client, claudeModel, segmentsToCues(d.segments), castNames);
      const vtt = cuesToVtt(cues);
      writeFileSync(join(work, `ep${pad}.pt.vtt`), vtt);
      const poster = join(work, `ep${pad}.poster.jpg`);
      posterFrame(d.video, poster, d.times[d.proposal.posterFrame - 1] ?? d.times[0]);

      proposalOut.episodes.push({ ...d.proposal, number: d.number, durationSeconds: Math.round(d.probe.duration), sourceName: basename(d.src) });
      if (dryRun) continue;
      const prev = existingByNumber.get(d.number);
      const reuse = skipMedia && prev?.video_url && prev?.poster_url;
      const videoUrl = reuse ? (prev.video_url as string) : await upload(sb, episodeVideoPath(slug, d.number, "final"), readFileSync(d.video), "video/mp4");
      const posterUrl = reuse ? (prev.poster_url as string) : await upload(sb, episodePosterPath(slug, d.number), readFileSync(poster), "image/jpeg");
      const subtitlesUrl = cues.length ? await upload(sb, episodeSubtitlesPath(slug, d.number), vtt, "text/vtt") : null;

      const first = d.number === 1;
      const row = {
        series_id: seriesId,
        number: d.number,
        title: d.proposal.title,
        synopsis: d.proposal.synopsis,
        hook_title: d.proposal.hookTitle,
        hook_text: d.proposal.hookText,
        is_free: first,
        coin_cost: first ? 0 : 15,
        duration_seconds: Math.round(d.probe.duration),
        video_url: videoUrl,
        poster_url: posterUrl,
        subtitles_url: subtitlesUrl,
        render_kind: "final",
        status: publish ? "published" : "draft",
        published_at: publish ? new Date().toISOString() : null,
        stats_seed: { likes: Math.max(120, 2400 - d.number * 40), comments: Math.max(8, 140 - d.number * 2) },
      };
      const { error: eErr } = await sb.from("tvibox_episodes").upsert(row, { onConflict: "series_id,number" });
      if (eErr) throw new Error(`EP ${d.number}: ${eErr.message}`);
    }

    const proposal = importProposalSchema.parse(proposalOut);
    writeFileSync(join(work, "proposal.json"), JSON.stringify(proposal, null, 2));
    if (dryRun) {
      await jl.log(`Dry-run: proposta em ${join(work, "proposal.json")} (nada carregado)`);
      return;
    }
    await jl.set({ proposal, status: publish ? "published" : "review", progress: 100, step: "done" });
    await jl.log(`Concluído: ${done.length} episódios ${publish ? "publicados" : "em rascunho (rever no Estúdio)"} · /tvibox/ver/${slug}`, 100, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await jl.log(`ERRO: ${msg}`);
    await jl.set({ status: "failed", error: msg });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
