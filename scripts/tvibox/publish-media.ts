/**
 * Publica media TVI BOX no Supabase Storage (bucket público `tvibox`) e atualiza o catálogo.
 *
 *   npx tsx scripts/tvibox/publish-media.ts --posters <dir> --frames <dir> --videos <dir> [--kind animatic|final] [--series a,b] [--episode N] [--no-align]
 *
 * - posters/<slug>.jpg           → posters/<slug>.jpg              (tvibox_series.poster_url)
 * - frames/<slug>_f1.jpg         → episodes/<slug>/epN-poster.jpg  (tvibox_episodes.poster_url)
 * - videos/<slug>-epN-<kind>.mp4 → episodes/<slug>/epN-<kind>.mp4  (video_url, duration, render_kind, status=published)
 * - legendas WebVTT geradas do argumento → episodes/<slug>/epN.pt.vtt (subtitles_url; só para renders finais),
 *   realinhadas à fala real no fim via align-subtitles.ts quando o faster-whisper está instalado (salta com --no-align)
 *
 * N = --episode (por omissão 1); tem de existir argumento para esse episódio.
 *
 * Um render "animatic" nunca substitui um render "final" já publicado.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SCREENPLAYS, getScreenplay } from "../../lib/tvibox/screenplays";
import { beatsToCues, beatsToVtt, cuesToVtt } from "../../lib/tvibox/subtitles";
import { TVIBOX_BUCKET, episodePosterPath, episodeSubtitlesPath, episodeVideoPath, posterPath, publicUrl } from "../../lib/tvibox/media";
import type { Screenplay, SeriesSlug } from "../../lib/tvibox/types";
import { loadLocalEnv, log, serviceClient, supabaseUrl } from "./env";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function probeSeconds(file: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
}

function probeDuration(file: string): number {
  return Math.round(probeSeconds(file));
}

/** Genérico TVI BOX que o produce.ts antepõe ao vídeo Veo. */
const BUMPER_SECONDS = 1.8;

/**
 * Legendas alinhadas com o render. Em modo "shots" cada beat é um clip independente de ~8 s
 * (não os 7 s do argumento), por isso os instantes vêm das durações reais dos clips
 * guardadas em <videos>/state/<slug>-epN.json pelo produce.ts.
 */
function subtitlesFor(slug: SeriesSlug, sp: Screenplay, videosDir: string): string {
  const stateFile = join(videosDir, "state", `${slug}-ep${sp.episode}.json`);
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, "utf8")) as {
      mode?: string;
      steps?: { index: number; file?: string; durationSeconds?: number }[];
    };
    if (state.mode === "shots" && state.steps?.length === sp.beats.length) {
      const durations = [...state.steps]
        .sort((a, b) => a.index - b.index)
        .map((s) => (s.file && existsSync(s.file) ? probeSeconds(s.file) : (s.durationSeconds ?? 8)));
      const starts: number[] = [];
      let t = BUMPER_SECONDS;
      for (const d of durations) {
        starts.push(t);
        t += d;
      }
      // Os beats do argumento têm 7 s; os clips têm ~8 s — o 1.º parâmetro só serve para o offset, os instantes vêm de `starts`.
      return cuesToVtt(beatsToCues(sp.beats, BUMPER_SECONDS, 0.4, 0.25, starts));
    }
  }
  return beatsToVtt(sp.beats, BUMPER_SECONDS);
}

async function upload(sb: ReturnType<typeof serviceClient>, path: string, body: Buffer | string, contentType: string) {
  const { error } = await sb.storage.from(TVIBOX_BUCKET).upload(path, body, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return publicUrl(supabaseUrl(), path);
}

async function main() {
  loadLocalEnv();
  const sb = serviceClient();
  const postersDir = arg("posters") ? resolve(arg("posters") as string) : null;
  const framesDir = arg("frames") ? resolve(arg("frames") as string) : null;
  const videosDir = arg("videos") ? resolve(arg("videos") as string) : null;
  const kind = (arg("kind", "animatic") as "animatic" | "final") ?? "animatic";
  const episode = Math.max(1, Number(arg("episode", "1")) || 1);
  const only = arg("series")?.split(",").map((s) => s.trim()).filter(Boolean) as SeriesSlug[] | undefined;
  const slugs = (only?.length ? only : (Object.keys(SCREENPLAYS) as SeriesSlug[])).filter((s) => getScreenplay(s, episode));

  const { data: seriesRows, error: sErr } = await sb.from("tvibox_series").select("id, slug");
  if (sErr) throw sErr;
  const seriesId = new Map((seriesRows ?? []).map((r) => [r.slug as string, r.id as string]));
  const toAlign: { slug: string; episode: number }[] = [];

  for (const slug of slugs) {
    const sid = seriesId.get(slug);
    if (!sid) {
      log(`série ${slug} não existe na BD — corre seed.ts primeiro`);
      continue;
    }
    const sp = getScreenplay(slug, episode);
    if (!sp) {
      log(`${slug}: sem argumento para o EP${episode} — ignorado`);
      continue;
    }

    if (postersDir) {
      const f = join(postersDir, `${slug}.jpg`);
      if (existsSync(f)) {
        const url = await upload(sb, posterPath(slug), readFileSync(f), "image/jpeg");
        const { error } = await sb.from("tvibox_series").update({ poster_url: url }).eq("id", sid);
        if (error) throw error;
        log(`${slug}: poster → ${url}`);
      }
    }

    const { data: ep } = await sb
      .from("tvibox_episodes")
      .select("id, render_kind, video_url")
      .eq("series_id", sid)
      .eq("number", sp.episode)
      .maybeSingle();
    if (!ep) {
      log(`${slug}: EP${sp.episode} não existe — corre seed.ts`);
      continue;
    }

    const patch: Record<string, unknown> = {};

    if (framesDir) {
      const f = join(framesDir, sp.episode === 1 ? `${slug}_f1.jpg` : `${slug}-ep${sp.episode}_f1.jpg`);
      if (existsSync(f)) {
        patch.poster_url = await upload(sb, episodePosterPath(slug, sp.episode), readFileSync(f), "image/jpeg");
      }
    }

    if (videosDir) {
      const f = join(videosDir, `${slug}-ep${sp.episode}-${kind}.mp4`);
      if (existsSync(f)) {
        if (ep.render_kind === "final" && kind === "animatic") {
          log(`${slug}: já tem render final — animatic ignorado`);
        } else {
          const url = await upload(sb, episodeVideoPath(slug, sp.episode, kind), readFileSync(f), "video/mp4");
          patch.video_url = url;
          patch.duration_seconds = probeDuration(f);
          patch.render_kind = kind;
          patch.status = "published";
          patch.published_at = new Date().toISOString();
          if (kind === "final") {
            // Legendas só nos renders com voz; o animatic já as tem gravadas na imagem.
            patch.subtitles_url = await upload(sb, episodeSubtitlesPath(slug, sp.episode), subtitlesFor(slug, sp, videosDir), "text/vtt");
          } else {
            patch.subtitles_url = null;
          }
          log(`${slug}: vídeo ${kind} (${patch.duration_seconds}s) → ${url}`);
          if (kind === "final") toAlign.push({ slug, episode: sp.episode });
        }
      }
    }

    if (Object.keys(patch).length) {
      const { error } = await sb.from("tvibox_episodes").update(patch).eq("id", ep.id);
      if (error) throw error;
    }
  }
  log("publicação concluída");

  // As legendas acima têm tempos nominais (do argumento). Com o faster-whisper instalado,
  // alinham-se logo à fala real; sem ele fica o aviso para correr `tvibox:align` depois.
  if (toAlign.length && !process.argv.includes("--no-align")) {
    if (hasWhisper()) {
      for (const { slug, episode } of toAlign) {
        log(`${slug}: a alinhar legendas do EP${episode} à fala…`);
        execFileSync("npx", ["tsx", "scripts/tvibox/align-subtitles.ts", "--series", slug, "--ep", String(episode), "--publish"], { stdio: "inherit" });
      }
    } else {
      log("faster-whisper não instalado (pip install faster-whisper) — corre depois: npm run tvibox:align -- --publish");
    }
  }
}

function hasWhisper(): boolean {
  try {
    execFileSync("python3", ["-c", "import faster_whisper"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
