/**
 * Gera "animatics" 9:16 dos episódios TVI BOX a partir de key frames (atores IA)
 * + argumento: movimento de câmara (Ken Burns), cortes por beat, legendas
 * gravadas em PT-PT e cama sonora de suspense sintetizada. Serve de conteúdo
 * provisório no feed até o pipeline Veo (produce.ts) publicar o render final
 * com voz e lip sync.
 *
 *   npx tsx scripts/tvibox/animatic.ts --frames <dir> --out <dir> [--series sangue,patroa] [--bumper public/tvibox/bumper.png]
 *
 * Espera em <frames>: <slug>_f1.jpg, <slug>_f2.jpg, <slug>_f3.jpg (720x1280).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCREENPLAYS } from "../../lib/tvibox/screenplays";
import { beatsToCues, type Cue } from "../../lib/tvibox/subtitles";
import type { Beat, SeriesSlug } from "../../lib/tvibox/types";
import { log } from "./env";

const W = 720;
const H = 1280;
const FPS = 24;
const XFADE = 0.4;
const BUMPER_SECONDS = 1.8;
const TAIL_SECONDS = 0.8;

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "warning", "-y", ...args], { stdio: "inherit" });
}

/** Movimento de câmara por beat: alterna para simular mudanças de plano. */
function motionExpr(kind: number, frames: number): { z: string; x: string; y: string } {
  const p = `(in/${Math.max(1, frames - 1)})`;
  switch (kind % 4) {
    case 0: // zoom in lento ao centro
      return { z: `1.02+0.14*${p}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
    case 1: // pan esquerda→direita com zoom fixo
      return { z: "1.14", x: `(iw-iw/zoom)*${p}`, y: "ih/2-(ih/zoom/2)" };
    case 2: // zoom out (revela)
      return { z: `1.18-0.14*${p}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
    default: // tilt de baixo para cima
      return { z: "1.14", x: "iw/2-(iw/zoom/2)", y: `(ih-ih/zoom)*(1-${p})` };
  }
}

function renderClip(frame: string, seconds: number, kind: number, out: string) {
  const frames = Math.round(seconds * FPS);
  const m = motionExpr(kind, frames);
  // Upscale 2x antes do zoompan reduz o tremor sub-pixel.
  const vf = [
    `scale=${W * 2}:${H * 2}:flags=lanczos`,
    `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=1:s=${W}x${H}:fps=${FPS}`,
    "format=yuv420p",
  ].join(",");
  ffmpeg(["-loop", "1", "-framerate", String(FPS), "-t", seconds.toFixed(3), "-i", frame, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", out]);
}

function renderBumper(bumperPng: string, out: string) {
  const frames = Math.round(BUMPER_SECONDS * FPS);
  const vf = [
    `scale=${W * 2}:${H * 2}:flags=lanczos`,
    `zoompan=z='1.10-0.06*(in/${frames - 1})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`,
    `fade=t=in:st=0:d=0.35,fade=t=out:st=${(BUMPER_SECONDS - 0.4).toFixed(2)}:d=0.4`,
    "format=yuv420p",
  ].join(",");
  ffmpeg(["-loop", "1", "-framerate", String(FPS), "-t", BUMPER_SECONDS.toFixed(3), "-i", bumperPng, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", out]);
}

function renderTail(out: string) {
  ffmpeg(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${FPS}:d=${TAIL_SECONDS}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", out]);
}

function assTime(sec: number): string {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function assEscape(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

function buildAss(cues: Cue[], episodeLabel: string): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Legenda principal: branca, contorno escuro, acima da zona de legenda da app (MarginV alto).
    "Style: Line,DejaVu Sans,34,&H00FFFFFF,&H000000FF,&H96000000,&HA0000000,-1,0,0,0,100,100,0,0,1,2.2,0.8,2,60,60,400,1",
    "Style: Who,DejaVu Sans,21,&H00D0D0D0,&H000000FF,&H96000000,&HA0000000,-1,0,0,0,100,100,1.2,0,1,1.6,0,2,60,60,400,1",
    "Style: Meta,DejaVu Sans,20,&H00C8C8C8,&H000000FF,&H96000000,&HA0000000,0,0,0,0,100,100,1,0,1,1.4,0,7,28,28,70,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  for (const c of cues) {
    const who = assEscape(c.who.toUpperCase());
    const text = assEscape(c.text);
    events.push(
      `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Line,,0,0,0,,{\\fad(120,120)}{\\rWho}${who}{\\r}\\N${text}`
    );
  }
  events.push(
    `Dialogue: 1,${assTime(BUMPER_SECONDS + 0.2)},${assTime(BUMPER_SECONDS + 5)},Meta,,0,0,0,,{\\fad(300,400)}${assEscape(episodeLabel)}  ·  ANIMATIC`
  );
  return [...header, ...events, ""].join("\n");
}

/** Cama sonora: drone grave, rumor, batimento cardíaco, riser final e sting no corte. */
function audioGraph(total: number, cutAt: number): string {
  const riserStart = Math.max(0, cutAt - 9);
  const heartbeat =
    "aevalsrc=exprs='0.55*sin(2*PI*52*t)*exp(-18*mod(t,0.86))*lt(mod(t,0.86),0.3)+0.38*sin(2*PI*46*t)*exp(-18*mod(t+0.68,0.86))*lt(mod(t+0.68,0.86),0.25)'";
  const riser = `aevalsrc=exprs='0.16*sin(2*PI*(140*(t-${riserStart})+7*(t-${riserStart})*(t-${riserStart})))*between(t,${riserStart},${cutAt})*((t-${riserStart})/9)'`;
  const sting = `aevalsrc=exprs='0.9*sin(2*PI*38*t)*exp(-4*(t-${cutAt - 0.05}))*between(t,${cutAt - 0.05},${cutAt + 0.9})'`;
  const whoosh = `anoisesrc=color=pink:amplitude=0.5:seed=7:duration=${total},afade=t=in:st=0:d=0.5,afade=t=out:st=0.9:d=0.9,volume=0.35,lowpass=f=2200`;
  const ping = `aevalsrc=exprs='0.25*sin(2*PI*880*t)*exp(-6*t)+0.18*sin(2*PI*1320*t)*exp(-7*t)'`;
  return [
    `sine=frequency=55:duration=${total},volume=0.10[dr1]`,
    `sine=frequency=55.6:duration=${total},volume=0.10[dr2]`,
    `anoisesrc=color=brown:amplitude=0.12:seed=3:duration=${total},lowpass=f=260,volume=0.55[rum]`,
    `${heartbeat}:duration=${total},lowpass=f=160,volume=0.7[hb]`,
    `${riser}:duration=${total},volume=0.8[rs]`,
    `${sting}:duration=${total},lowpass=f=120[st]`,
    `${whoosh}[wh]`,
    `${ping}:duration=${total}[pg]`,
    `[dr1][dr2][rum][hb][rs][st][wh][pg]amix=inputs=8:normalize=0,afade=t=in:st=0:d=0.3,afade=t=out:st=${cutAt + 0.9}:d=${Math.max(0.1, total - cutAt - 0.9)},loudnorm=I=-18:TP=-1.5:LRA=11[aout]`,
  ].join(";");
}

function buildEpisode(slug: SeriesSlug, framesDir: string, outDir: string, bumperPng: string) {
  const sp = SCREENPLAYS[slug];
  const beats: Beat[] = sp.beats;
  const work = join(outDir, "work", slug);
  mkdirSync(work, { recursive: true });

  const frames = [1, 2, 3].map((i) => join(framesDir, `${slug}_f${i}.jpg`));
  for (const f of frames) if (!existsSync(f)) throw new Error(`Falta o frame ${f}`);

  // Clip 0 = genérico; clips 1..n = beats; último = cauda negra.
  const clips: { file: string; dur: number }[] = [];
  const bumper = join(work, "00-bumper.mp4");
  renderBumper(bumperPng, bumper);
  clips.push({ file: bumper, dur: BUMPER_SECONDS });

  beats.forEach((b, i) => {
    const group = Math.min(2, Math.floor((i * 3) / beats.length));
    const file = join(work, `${String(i + 1).padStart(2, "0")}-beat.mp4`);
    renderClip(frames[group], b.dur, i, file);
    clips.push({ file, dur: b.dur });
  });

  const tail = join(work, "99-tail.mp4");
  renderTail(tail);
  clips.push({ file: tail, dur: TAIL_SECONDS });

  // Instantes reais de início (as transições sobrepõem XFADE segundos).
  const starts: number[] = [];
  let t = 0;
  clips.forEach((c, i) => {
    starts.push(t);
    t += c.dur - (i < clips.length - 1 ? XFADE : 0);
  });
  const total = t;
  const beatStartTimes = starts.slice(1, 1 + beats.length);
  const cutAt = starts[starts.length - 1]; // início da cauda negra = corte seco

  const cues = beatsToCues(beats, 0, 0.4, 0.25, beatStartTimes);
  const ass = join(work, "subs.ass");
  writeFileSync(ass, buildAss(cues, `EP ${sp.episode} · ${sp.title}`));

  // Encadeamento xfade: [0][1]xfade[v1]; [v1][2]xfade[v2]; ...
  const inputs = clips.flatMap((c) => ["-i", c.file]);
  const parts: string[] = [];
  let prev = "[0:v]";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += clips[i - 1].dur - XFADE;
    const outLabel = i === clips.length - 1 ? "[vx]" : `[v${i}]`;
    const transition = i === clips.length - 1 ? "fadeblack" : "fade";
    parts.push(`${prev}[${i}:v]xfade=transition=${transition}:duration=${XFADE}:offset=${offset.toFixed(3)}${outLabel}`);
    prev = outLabel;
  }
  parts.push(`[vx]ass='${ass.replace(/'/g, "\\'")}':fontsdir=/usr/share/fonts/truetype/dejavu[vout]`);
  parts.push(audioGraph(total + 0.2, cutAt));

  const out = join(outDir, `${slug}-ep${sp.episode}-animatic.mp4`);
  ffmpeg([
    ...inputs,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    total.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    out,
  ]);
  log(`${slug}: ${out} (${total.toFixed(1)} s, ${beats.length} beats)`);
  return out;
}

function main() {
  const framesDir = resolve(arg("frames", "/tmp/tvibox/frames") as string);
  const outDir = resolve(arg("out", "/tmp/tvibox/out") as string);
  const bumperPng = resolve(arg("bumper", "public/tvibox/bumper.png") as string);
  const only = arg("series")?.split(",").map((s) => s.trim()).filter(Boolean) as SeriesSlug[] | undefined;
  mkdirSync(outDir, { recursive: true });
  const slugs = (only?.length ? only : (Object.keys(SCREENPLAYS) as SeriesSlug[])).filter((s) => SCREENPLAYS[s]);
  for (const slug of slugs) buildEpisode(slug, framesDir, outDir, bumperPng);
  log("animatics concluídos");
}

main();
