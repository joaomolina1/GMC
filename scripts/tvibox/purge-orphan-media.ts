/**
 * Apaga do bucket `tvibox` os ficheiros de episódios que já não existem na base.
 * Não mexe em episódios ainda publicados nem no poster de uma série que exista.
 *
 *   npm run tvibox:purge-orphans
 *   npm run tvibox:purge-orphans -- --apply
 */
import { TVIBOX_BUCKET } from "../../lib/tvibox/media";
import { listChildren, listFiles, orphanPaths, removeStoragePaths } from "../../lib/tvibox/media-purge";
import { loadLocalEnv, serviceClient } from "./env";

loadLocalEnv();

function summarize(paths: string[]): string[] {
  const groups = new Map<string, number[]>();
  for (const path of paths) {
    const [top, slug, file] = path.split("/");
    const key = `${top}/${slug ?? ""}`;
    const match = file ? /^ep(\d+)/.exec(file) : null;
    const list = groups.get(key) ?? [];
    if (match) list.push(Number(match[1]));
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, numbers]) => {
      const unique = [...new Set(numbers)].sort((a, b) => a - b);
      const range = unique.length ? `ep ${unique[0]}–${unique[unique.length - 1]} (${unique.length} episódios)` : "sem número";
      const count = paths.filter((p) => p.startsWith(`${key}/`) || p === key).length;
      return `${key}: ${count} ficheiros, ${range}`;
    });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sb = serviceClient();
  const { data: series, error: seriesError } = await sb.from("tvibox_series").select("id, slug");
  if (seriesError) throw new Error(seriesError.message);
  const { data: episodes, error: episodeError } = await sb.from("tvibox_episodes").select("number, series_id");
  if (episodeError) throw new Error(episodeError.message);

  const slugById = new Map((series ?? []).map((s) => [s.id as string, s.slug as string]));
  const live = (episodes ?? []).flatMap((e) => {
    const slug = slugById.get(e.series_id as string);
    return slug ? [{ slug, number: e.number as number }] : [];
  });
  const slugs = [...slugById.values()];

  const storage = sb.storage;
  const episodeRoot = await listChildren(storage, TVIBOX_BUCKET, "episodes");
  const workRoot = await listChildren(storage, TVIBOX_BUCKET, "work");
  const paths = [...episodeRoot.files, ...workRoot.files, ...(await listFiles(storage, TVIBOX_BUCKET, "posters"))];
  for (const folder of episodeRoot.folders) paths.push(...(await listFiles(storage, TVIBOX_BUCKET, `episodes/${folder}`)));
  for (const folder of workRoot.folders) paths.push(...(await listFiles(storage, TVIBOX_BUCKET, `work/${folder}`)));

  const orphans = orphanPaths(paths, live, slugs);
  console.log(`séries vivas: ${slugs.length}; episódios vivos: ${live.length}`);
  console.log(`objetos vistos: ${paths.length}; órfãos: ${orphans.length}`);
  for (const line of summarize(orphans)) console.log(`  ${line}`);
  if (!apply) {
    console.log("dry-run — nada foi apagado. Repete com --apply para remover.");
    return;
  }
  const removed = await removeStoragePaths(storage, TVIBOX_BUCKET, orphans);
  console.log(`removidos: ${removed}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
