/**
 * Pipeline de produção TVI BOX — Veo 3.1 (Gemini API) com áudio nativo e lip sync.
 *
 *   npx tsx scripts/tvibox/produce.ts --dry-run                       # mostra o plano/prompts sem gastar créditos
 *   npx tsx scripts/tvibox/produce.ts --series sangue --publish       # produz e publica o EP1 de "Sangue & Herança"
 *   npx tsx scripts/tvibox/produce.ts --mode shots --model fast       # clips independentes de 8 s em vez de extensão
 *
 * Opções:
 *   --series a,b        slugs (por omissão: todas as séries com argumento)
 *   --mode extend|shots extend = 8 s + extensões de 7 s no mesmo vídeo (continuidade real, 720p);
 *                       shots  = um clip de 8 s por beat, concatenados (permite 1080p)
 *   --model quality|fast|lite   veo-3.1-generate-preview | veo-3.1-fast-generate-preview | veo-3.1-lite-generate-preview
 *   --resolution 720p|1080p     (extend força 720p)
 *   --person allow_all|allow_adult   (por omissão allow_all; a API recusa allow_adult em texto→vídeo)
 *   --out <dir>         diretório de trabalho/saída (por omissão /tmp/tvibox/final)
 *   --from-step N       refaz a partir do passo N (mantém os anteriores)
 *   --inline            envia o vídeo anterior em base64 em vez de referenciar o URI gerado
 *   --publish           no fim, publica no Storage e atualiza o catálogo (render_kind=final)
 *   --concurrency N     séries em paralelo (por omissão 2; cada série é sequencial)
 *   --check             valida a chave e a disponibilidade do modelo Veo, sem gerar nada
 *   --dry-run           não chama a API
 *
 * Requer GEMINI_API_KEY (ou GOOGLE_API_KEY). Estado resumível em <out>/state/<slug>-epN.json
 * e espelhado em tvibox_render_jobs quando há chave de serviço Supabase.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCREENPLAYS, screenplayDuration } from "../../lib/tvibox/screenplays";
import { NEGATIVE_PROMPT, VEO_MODELS, VEO_PROMPT_TOKEN_LIMIT, planEpisode, type PlannedStep } from "../../lib/tvibox/veo-prompts";
import type { SeriesSlug } from "../../lib/tvibox/types";
import { geminiKey, loadLocalEnv, log, serviceClient } from "./env";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const POLL_MS = 10_000;
const OP_TIMEOUT_MS = 20 * 60_000;
const BUMPER_SECONDS = 1.8;
const USD_PER_SECOND: Record<keyof typeof VEO_MODELS, number> = { quality: 0.4, fast: 0.15, lite: 0.05 };

interface StepState {
  index: number;
  kind: PlannedStep["kind"];
  operation?: string;
  uri?: string;
  file?: string;
  durationSeconds: number;
  completedAt?: string;
}

interface JobState {
  slug: SeriesSlug;
  episode: number;
  mode: "extend" | "shots";
  model: string;
  resolution: string;
  steps: StepState[];
  final?: string;
  jobId?: string;
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gemini<T>(path: string, init: RequestInit, key: string, attempt = 0): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: { "x-goog-api-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 5) {
      const wait = Math.min(60_000, 2_000 * 2 ** attempt);
      log(`Gemini ${res.status} — nova tentativa em ${wait / 1000}s`);
      await sleep(wait);
      return gemini<T>(path, init, key, attempt + 1);
    }
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

interface OperationResponse {
  name: string;
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: { video?: { uri?: string } }[];
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
  };
}

async function startOperation(key: string, model: string, body: unknown): Promise<string> {
  const r = await gemini<{ name: string }>(`models/${model}:predictLongRunning`, { method: "POST", body: JSON.stringify(body) }, key);
  return r.name;
}

async function waitOperation(key: string, name: string): Promise<{ uri: string }> {
  const started = Date.now();
  for (;;) {
    const op = await gemini<OperationResponse>(name, { method: "GET" }, key);
    if (op.done) {
      if (op.error) throw new Error(`Operação falhou: ${op.error.message ?? JSON.stringify(op.error)}`);
      const gv = op.response?.generateVideoResponse;
      const uri = gv?.generatedSamples?.[0]?.video?.uri;
      if (!uri) {
        const why = gv?.raiMediaFilteredReasons?.join("; ") ?? "sem amostras (possível filtro de segurança)";
        throw new Error(`Sem vídeo na resposta: ${why}`);
      }
      return { uri };
    }
    if (Date.now() - started > OP_TIMEOUT_MS) throw new Error(`Timeout à espera de ${name}`);
    await sleep(POLL_MS);
  }
}

async function download(key: string, uri: string, file: string) {
  const res = await fetch(uri, { headers: { "x-goog-api-key": key }, redirect: "follow" });
  if (!res.ok) throw new Error(`Download ${res.status} de ${uri}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function probeDuration(file: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
}

/** Genérico TVI BOX (1,8 s) com whoosh, no mesmo formato do vídeo Veo, para concatenar. */
function renderBumper(bumperPng: string, out: string, w: number, h: number) {
  const frames = Math.round(BUMPER_SECONDS * 24);
  const vf = `scale=${w * 2}:${h * 2}:flags=lanczos,zoompan=z='1.10-0.06*(in/${frames - 1})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=24,fade=t=in:st=0:d=0.35,fade=t=out:st=${(BUMPER_SECONDS - 0.4).toFixed(2)}:d=0.4,format=yuv420p`;
  const af = `anoisesrc=color=pink:amplitude=0.5:seed=7:duration=${BUMPER_SECONDS},afade=t=in:st=0:d=0.5,afade=t=out:st=0.9:d=0.9,volume=0.3,lowpass=f=2200,aformat=sample_rates=48000:channel_layouts=stereo`;
  ffmpeg(["-loop", "1", "-framerate", "24", "-t", String(BUMPER_SECONDS), "-i", bumperPng, "-f", "lavfi", "-i", af, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-shortest", out]);
}

/** Junta genérico + vídeo(s) Veo, normaliza loudness e termina em corte seco para negro. */
function finalize(parts: string[], bumperPng: string, out: string) {
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", parts[0]])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  const bumper = out.replace(/\.mp4$/, ".bumper.mp4");
  renderBumper(bumperPng, bumper, w, h);
  const inputs = [bumper, ...parts].flatMap((f) => ["-i", f]);
  const n = parts.length + 1;
  const norm = Array.from({ length: n }, (_, i) => `[${i}:v]scale=${w}:${h},fps=24,format=yuv420p[v${i}];[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`).join(";");
  const labels = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("");
  const graph = `${norm};${labels}concat=n=${n}:v=1:a=1[vc][ac];[vc]tpad=stop_mode=clone:stop_duration=0.1,fade=t=out:st=999:d=0.01[vout];[ac]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
  ffmpeg([...inputs, "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]);
}

function loadState(file: string): JobState | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as JobState) : null;
}

async function mirrorJob(state: JobState, status: "running" | "completed" | "failed", error?: string) {
  try {
    const sb = serviceClient();
    const { data: series } = await sb.from("tvibox_series").select("id").eq("slug", state.slug).maybeSingle();
    if (!series) return;
    const { data: ep } = await sb.from("tvibox_episodes").select("id").eq("series_id", series.id).eq("number", state.episode).maybeSingle();
    if (!ep) return;
    const row = {
      episode_id: ep.id,
      provider: "veo",
      mode: state.mode,
      status,
      step: state.steps.filter((s) => s.completedAt).length,
      state: { model: state.model, resolution: state.resolution, steps: state.steps, final: state.final },
      error: error ?? null,
    };
    if (state.jobId) await sb.from("tvibox_render_jobs").update(row).eq("id", state.jobId);
    else {
      const { data } = await sb.from("tvibox_render_jobs").insert(row).select("id").single();
      if (data) state.jobId = data.id;
    }
  } catch {
    /* sem Supabase configurado — estado fica só em ficheiro */
  }
}

async function produceEpisode(slug: SeriesSlug, opts: {
  key: string | null;
  mode: "extend" | "shots";
  model: string;
  modelKey: keyof typeof VEO_MODELS;
  resolution: string;
  person: string;
  out: string;
  fromStep: number;
  inline: boolean;
  dryRun: boolean;
  bumper: string;
}) {
  const sp = SCREENPLAYS[slug];
  const plan = planEpisode(sp, opts.mode);
  const total = screenplayDuration(sp);
  const work = join(opts.out, "work", slug);
  const stateDir = join(opts.out, "state");
  mkdirSync(work, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  const stateFile = join(stateDir, `${slug}-ep${sp.episode}.json`);

  log(`═══ ${sp.title.toUpperCase()} (${slug} EP${sp.episode}) — ${plan.length} passos · ${total}s · modo ${opts.mode} · ${opts.model}`);
  const overLimit = plan.filter((p) => p.approxTokens > VEO_PROMPT_TOKEN_LIMIT);
  if (overLimit.length) log(`⚠ ${overLimit.length} prompts acima de ~${VEO_PROMPT_TOKEN_LIMIT} tokens: ${overLimit.map((p) => p.index).join(", ")}`);

  if (opts.dryRun) {
    for (const p of plan) {
      console.log(`\n— passo ${p.index} (${p.kind}, ${p.durationSeconds}s, ~${p.approxTokens} tokens)\n${p.prompt}`);
    }
    const secs = plan.reduce((a, p) => a + p.durationSeconds, 0);
    console.log(`\n≈ custo indicativo: ${(secs * USD_PER_SECOND[opts.modelKey]).toFixed(2)} USD · ≈ tempo: ${Math.round((plan.length * 2.5))}-${plan.length * 6} min`);
    return;
  }
  if (!opts.key) throw new Error("GEMINI_API_KEY em falta — define a variável de ambiente ou usa --dry-run");

  let state = loadState(stateFile);
  if (!state || state.mode !== opts.mode || state.model !== opts.model) {
    state = { slug, episode: sp.episode, mode: opts.mode, model: opts.model, resolution: opts.resolution, steps: [] };
  }
  if (opts.fromStep >= 0) state.steps = state.steps.filter((s) => s.index < opts.fromStep);
  await mirrorJob(state, "running");

  try {
    for (const step of plan) {
      const done = state.steps.find((s) => s.index === step.index && s.completedAt && s.file && existsSync(s.file));
      if (done) {
        log(`passo ${step.index} já concluído (${done.file})`);
        continue;
      }
      const file = join(work, `step-${String(step.index).padStart(2, "0")}.mp4`);
      const instance: Record<string, unknown> = { prompt: step.prompt };
      const parameters: Record<string, unknown> = {
        aspectRatio: "9:16",
        negativePrompt: NEGATIVE_PROMPT,
        personGeneration: opts.person,
      };

      if (step.kind === "extend") {
        const prev = state.steps.find((s) => s.index === step.index - 1);
        if (!prev?.file) throw new Error(`Passo ${step.index - 1} em falta para extensão`);
        instance.video = opts.inline || !prev.uri
          ? { inlineData: { mimeType: "video/mp4", data: readFileSync(prev.file).toString("base64") } }
          : { uri: prev.uri, mimeType: "video/mp4" };
        parameters.resolution = "720p";
      } else {
        parameters.durationSeconds = step.durationSeconds;
        parameters.resolution = opts.resolution;
      }

      log(`passo ${step.index}/${plan.length - 1} (${step.kind}) — a submeter…`);
      const operation = await startOperation(opts.key, opts.model, { instances: [instance], parameters });
      const rec: StepState = { index: step.index, kind: step.kind, operation, durationSeconds: step.durationSeconds };
      state.steps = [...state.steps.filter((s) => s.index !== step.index), rec].sort((a, b) => a.index - b.index);
      writeFileSync(stateFile, JSON.stringify(state, null, 2));

      const { uri } = await waitOperation(opts.key, operation);
      await download(opts.key, uri, file);
      rec.uri = uri;
      rec.file = file;
      rec.completedAt = new Date().toISOString();
      writeFileSync(stateFile, JSON.stringify(state, null, 2));
      await mirrorJob(state, "running");
      log(`passo ${step.index} ✓ ${probeDuration(file).toFixed(1)}s acumulados → ${file}`);
    }

    const parts =
      opts.mode === "extend"
        ? [state.steps[state.steps.length - 1].file as string]
        : state.steps.map((s) => s.file as string);
    const finalFile = join(opts.out, `${slug}-ep${sp.episode}-final.mp4`);
    finalize(parts, opts.bumper, finalFile);
    state.final = finalFile;
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    await mirrorJob(state, "completed");
    log(`✓ ${slug}: ${finalFile} (${probeDuration(finalFile).toFixed(1)}s)`);
  } catch (e) {
    await mirrorJob(state, "failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

async function main() {
  loadLocalEnv();
  const dryRun = flag("dry-run");
  const mode = (arg("mode", "extend") as "extend" | "shots") === "shots" ? "shots" : "extend";
  const modelKey = (arg("model", "quality") as keyof typeof VEO_MODELS) in VEO_MODELS ? (arg("model", "quality") as keyof typeof VEO_MODELS) : "quality";
  const model = VEO_MODELS[modelKey];
  const resolution = mode === "extend" ? "720p" : (arg("resolution", "1080p") as string);
  const person = arg("person", "allow_all") as string;
  const out = resolve(arg("out", "/tmp/tvibox/final") as string);
  const bumper = resolve(arg("bumper", "public/tvibox/bumper.png") as string);
  const fromStep = Number(arg("from-step", "-1"));
  const only = arg("series")?.split(",").map((s) => s.trim()).filter(Boolean) as SeriesSlug[] | undefined;
  const slugs = (only?.length ? only : (Object.keys(SCREENPLAYS) as SeriesSlug[])).filter((s) => SCREENPLAYS[s]);
  const key = geminiKey();

  if (!dryRun && !key) {
    console.error(
      "GEMINI_API_KEY em falta. Adiciona a chave (Cursor Dashboard → Cloud Agents → Secrets — só entra em agentes novos — ou .env.local) ou corre com --dry-run."
    );
    process.exit(2);
  }
  if (mode === "extend" && modelKey === "lite") {
    console.error("O Veo 3.1 Lite não suporta extensão de vídeo — usa --mode shots ou --model fast/quality.");
    process.exit(2);
  }

  if (flag("check")) {
    const ok = await checkAccess(key as string, model);
    process.exit(ok ? 0 : 3);
  }

  // Cada série é uma cadeia sequencial (extensões); séries diferentes correm em paralelo.
  const concurrency = Math.max(1, Math.min(8, Number(arg("concurrency", dryRun ? "1" : "2"))));
  const queue = [...slugs];
  const done: SeriesSlug[] = [];
  const failed: { slug: SeriesSlug; error: string }[] = [];
  const worker = async () => {
    for (let slug = queue.shift(); slug; slug = queue.shift()) {
      try {
        await produceEpisode(slug, { key, mode, model, modelKey, resolution, person, out, fromStep, inline: flag("inline"), dryRun, bumper });
        done.push(slug);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed.push({ slug, error: msg });
        log(`✗ ${slug}: ${msg}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, slugs.length) }, worker));

  if (!dryRun && flag("publish") && done.length) {
    log(`a publicar renders finais (${done.join(", ")})…`);
    execFileSync("npx", ["tsx", "scripts/tvibox/publish-media.ts", "--videos", out, "--kind", "final", "--series", done.join(",")], { stdio: "inherit" });
  }

  if (failed.length) {
    console.error(`\n${failed.length} episódio(s) falharam — volta a correr o mesmo comando para retomar do último passo concluído:`);
    for (const f of failed) console.error(`  · ${f.slug}: ${f.error}`);
    process.exit(1);
  }
}

/** Valida a chave e confirma que o modelo Veo escolhido está acessível a esta conta. */
async function checkAccess(key: string, model: string): Promise<boolean> {
  try {
    const r = await gemini<{ models?: { name: string }[] }>("models?pageSize=200", { method: "GET" }, key);
    const names = (r.models ?? []).map((m) => m.name.replace(/^models\//, ""));
    const veo = names.filter((n) => n.startsWith("veo"));
    log(`chave válida · ${names.length} modelos visíveis · Veo: ${veo.join(", ") || "nenhum"}`);
    if (!veo.includes(model)) {
      console.error(`O modelo ${model} não está disponível para esta chave (ativa a faturação no projeto Google AI Studio).`);
      return false;
    }
    log(`✓ ${model} disponível — pronto para produzir`);
    return true;
  } catch (e) {
    console.error(`Chave inválida ou sem acesso: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
