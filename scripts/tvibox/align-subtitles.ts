/**
 * Alinha as legendas de um episódio à fala real do vídeo.
 *
 *   npx tsx scripts/tvibox/align-subtitles.ts [--series a,b] [--ep 1] [--publish] [--model small] [--passes 3] [--video ficheiro.mp4]
 *
 * Porquê: as legendas geradas do argumento (beatsToVtt) assumem que cada fala
 * ocupa o seu beat; o Veo diz as falas quando quer, por vezes salta algumas.
 * Este script:
 *   1. descarrega o vídeo publicado (ou usa --video), extrai o áudio (ffmpeg);
 *   2. reconhece a fala com timestamps por palavra (scripts/tvibox/asr.py, faster-whisper),
 *      em várias passagens (sementes/VAD diferentes) porque o Whisper falha janelas inteiras
 *      de forma aleatória; fica a passagem que cobre mais palavras do argumento;
 *   3. alinha as falas do argumento às palavras reconhecidas (lib/tvibox/align.ts);
 *   4. escreve o WebVTT em /tmp/tvibox/align/ e, com --publish, substitui a legenda
 *      no Storage e em tvibox_episodes.subtitles_url (com ?v= para furar a cache).
 *
 * Fonte das falas, por ordem: o argumento (getScreenplay — EP1 e seguintes); o argumento
 * guardado no Storage (episodes/<slug>/epN.script.vtt); a legenda já publicada.
 * Ao publicar, o argumento completo fica sempre guardado em epN.script.vtt — a legenda
 * alinhada perde as falas não ditas e não serviria de fonte para uma nova passagem.
 * Falas que não são ditas no vídeo ficam de fora — a legenda só aparece quando alguém fala.
 *
 * Requisitos: ffmpeg, python3 + `pip install faster-whisper` (CPU chega: ~10 s por episódio com o modelo "small").
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { alignLinesToWords, linesFromVtt, type AsrWord, type ScriptLine } from "../../lib/tvibox/align";
import { TVIBOX_BUCKET, episodeScriptPath, episodeSubtitlesPath, publicUrl } from "../../lib/tvibox/media";
import { getScreenplay } from "../../lib/tvibox/screenplays";
import { cuesToVtt } from "../../lib/tvibox/subtitles";
import type { SeriesSlug } from "../../lib/tvibox/types";
import { loadLocalEnv, log, serviceClient, supabaseUrl } from "./env";

const WORK = "/tmp/tvibox/align";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function sh(cmd: string, args: string[], quiet = true): string {
  return execFileSync(cmd, args, { stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" }).toString();
}

async function fetchTo(url: string, file: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function transcribe(audio: string, promptFile: string | null, model: string, seed: number, vad: boolean): AsrWord[] {
  const out = `${audio}.${seed}${vad ? "v" : ""}.words.json`;
  const args = [resolve("scripts/tvibox/asr.py"), "--audio", audio, "--out", out, "--model", model, "--seed", String(seed)];
  if (vad) args.push("--vad");
  if (promptFile) args.push("--prompt-file", promptFile);
  execFileSync("python3", args, { stdio: ["ignore", "ignore", "pipe"] });
  return (JSON.parse(readFileSync(out, "utf8")) as { words: AsrWord[] }).words;
}

/** Várias passagens de ASR; escolhe a que melhor cobre o argumento. */
function bestAlignment(lines: ScriptLine[], wav: string, promptFile: string, model: string, passes: number) {
  let best: ReturnType<typeof alignLinesToWords> | null = null;
  for (let k = 0; k < passes; k++) {
    const vad = k % 2 === 1;
    const words = transcribe(wav, promptFile, model, k, vad);
    const res = alignLinesToWords(lines, words);
    log(`  passagem ${k + 1}/${passes}${vad ? " (VAD)" : ""}: ${words.length} palavras · cobertura ${(res.coverage * 100).toFixed(0)} %`);
    if (!best || res.coverage > best.coverage) best = res;
    if (res.coverage >= 0.97) break;
  }
  return best!;
}

type Sb = ReturnType<typeof serviceClient>;

async function scriptLines(sb: Sb, slug: string, number: number, currentVtt: string | null): Promise<{ lines: ScriptLine[]; source: string }> {
  const sp = getScreenplay(slug as SeriesSlug, number);
  if (sp) {
    return { lines: sp.beats.flatMap((b) => b.lines.map((l) => ({ who: l.who, text: l.text }))), source: "argumento" };
  }
  const { data: saved } = await sb.storage.from(TVIBOX_BUCKET).download(episodeScriptPath(slug, number));
  if (saved) {
    const lines = linesFromVtt(await saved.text());
    if (lines.length) return { lines, source: "argumento guardado" };
  }
  if (currentVtt) {
    const res = await fetch(currentVtt, { cache: "no-store" });
    if (res.ok) {
      const lines = linesFromVtt(await res.text());
      if (lines.length) return { lines, source: "legenda atual" };
    }
  }
  return { lines: [], source: "nenhuma" };
}

/** Guarda o argumento completo no Storage (WebVTT com tempos nominais) para futuras passagens. */
async function saveScript(sb: Sb, slug: string, number: number, lines: ScriptLine[]) {
  const vtt = cuesToVtt(lines.map((l, i) => ({ start: i * 4, end: i * 4 + 3.5, who: l.who, text: l.text })));
  const { error } = await sb.storage.from(TVIBOX_BUCKET).upload(episodeScriptPath(slug, number), vtt, { contentType: "text/vtt", upsert: true });
  if (error) throw new Error(`upload script: ${error.message}`);
}

async function main() {
  loadLocalEnv();
  const sb = serviceClient();
  mkdirSync(WORK, { recursive: true });
  const model = arg("model", "small") as string;
  const passes = Math.max(1, Number(arg("passes", "3")));
  const onlySeries = arg("series")?.split(",").map((s) => s.trim()).filter(Boolean);
  const onlyEp = arg("ep") ? Number(arg("ep")) : null;
  const localVideo = arg("video");

  const { data: series, error: sErr } = await sb.from("tvibox_series").select("id, slug, title").order("sort_order");
  if (sErr) throw sErr;
  let q = sb
    .from("tvibox_episodes")
    .select("id, series_id, number, title, video_url, subtitles_url, render_kind")
    .not("video_url", "is", null)
    .order("number");
  if (onlyEp) q = q.eq("number", onlyEp);
  const { data: episodes, error: eErr } = await q;
  if (eErr) throw eErr;

  const bySeries = new Map((series ?? []).map((s) => [s.id as string, s]));
  const targets = (episodes ?? []).filter((e) => {
    const s = bySeries.get(e.series_id as string);
    if (!s) return false;
    if (onlySeries && !onlySeries.includes(s.slug as string)) return false;
    // Animatics não têm fala; só faz sentido alinhar renders finais.
    return e.render_kind === "final" || !!localVideo;
  });
  if (!targets.length) {
    log("nada para alinhar (só renders finais com vídeo). Usa --series/--ep ou --video.");
    return;
  }

  for (const ep of targets) {
    const s = bySeries.get(ep.series_id as string)!;
    const slug = s.slug as string;
    const number = ep.number as number;
    const tag = `${slug}-ep${number}`;
    log(`▶ ${s.title} EP ${number}`);

    const video = localVideo ? resolve(localVideo) : join(WORK, `${tag}.mp4`);
    if (!localVideo && !existsSync(video)) await fetchTo(ep.video_url as string, video);
    const wav = join(WORK, `${tag}.wav`);
    sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav]);

    const { lines, source } = await scriptLines(sb, slug, number, ep.subtitles_url as string | null);
    if (!lines.length) {
      log(`  sem falas conhecidas para ${tag} — salto`);
      continue;
    }
    const promptFile = join(WORK, `${tag}.prompt.txt`);
    writeFileSync(promptFile, lines.map((l) => l.text).join(" "));

    const { cues, dropped, coverage } = bestAlignment(lines, wav, promptFile, model, passes);
    log(`  falas: ${lines.length} (${source}) · reconhecidas: ${cues.length} · cobertura ${(coverage * 100).toFixed(0)} %`);
    for (const d of dropped) log(`  ✗ não dita/reconhecida: «${d.line.text}» (${d.matched}/${d.total})`);
    for (const c of cues) log(`  ${c.start.toFixed(2).padStart(6)}–${c.end.toFixed(2).padStart(6)}  ${c.who}: ${c.text}`);

    if (!cues.length) {
      log(`  nenhuma fala alinhada — mantenho a legenda atual`);
      continue;
    }
    const vtt = cuesToVtt(cues);
    const local = join(WORK, `${tag}.pt.vtt`);
    writeFileSync(local, vtt);
    log(`  VTT → ${local}`);

    if (flag("publish")) {
      await saveScript(sb, slug, number, lines);
      const path = episodeSubtitlesPath(slug, number);
      const { error } = await sb.storage.from(TVIBOX_BUCKET).upload(path, vtt, { contentType: "text/vtt", upsert: true, cacheControl: "3600" });
      if (error) throw new Error(`upload ${path}: ${error.message}`);
      const v = createHash("sha1").update(vtt).digest("hex").slice(0, 8);
      const url = `${publicUrl(supabaseUrl(), path)}?v=${v}`;
      const { error: uErr } = await sb.from("tvibox_episodes").update({ subtitles_url: url }).eq("id", ep.id);
      if (uErr) throw uErr;
      log(`  publicado: ${url}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
