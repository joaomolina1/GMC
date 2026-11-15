import { TVIBOX_BUCKET } from "./media";

/** Apaga no máximo este número de objetos por chamada (limite da Storage API). */
export const REMOVE_CHUNK = 1000;

export interface StorageListEntry {
  name: string;
  id?: string | null;
}

export interface StorageFileApi {
  list: (
    path: string,
    options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }
  ) => Promise<{ data: StorageListEntry[] | null; error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
}

export interface StorageBucketApi {
  from: (bucket: string) => StorageFileApi;
}

/** `ep12-final.mp4`, `ep12.pt.vtt`, `ep12-poster.jpg`, `ep12.script.vtt`. Não apanha `ep120`. */
export function episodeNumberFromName(filename: string): number | null {
  const match = /^ep(\d+)(?:[.-].*)?$/.exec(filename);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Caminho dentro do bucket a partir de um URL público ou assinado do Storage. */
export function publicObjectPath(url: string | null | undefined, bucket = TVIBOX_BUCKET): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
  ];
  for (const marker of markers) {
    const at = pathname.indexOf(marker);
    if (at !== -1) return decodeURIComponent(pathname.slice(at + marker.length));
  }
  return null;
}

/** Poster canónico (`posters/slug.jpg`) ou variante com carimbo do upload (`posters/slug-<base36 de 8+>.jpg`). */
export function isSeriesPosterName(filename: string, slug: string): boolean {
  if (filename === `${slug}.jpg` || filename === `${slug}.png` || filename === `${slug}.webp`) return true;
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // O carimbo é Date.now().toString(36): 8+ caracteres e pelo menos um dígito.
  // Assim `amor-seguro.jpg` não conta como poster carimbado da série `amor`.
  return new RegExp(`^${escaped}-(?=[a-z0-9]*\\d)[a-z0-9]{8,}\\.(jpg|png|webp)$`).test(filename);
}

export function pathsForEpisode(paths: string[], slug: string, number: number): string[] {
  return paths.filter((path) => {
    const parts = path.split("/");
    if (parts.length !== 3) return false;
    if (parts[0] !== "episodes" && parts[0] !== "work") return false;
    if (parts[1] !== slug) return false;
    return episodeNumberFromName(parts[2]) === number;
  });
}

/**
 * Ficheiros cujo episódio já não existe. Posters ficam enquanto a série existir,
 * mesmo que não tenha episódios. Ficheiros com nome fora do padrão não são tocados.
 */
export function orphanPaths(paths: string[], liveEpisodes: { slug: string; number: number }[], liveSlugs: string[]): string[] {
  const episodes = new Set(liveEpisodes.map((e) => `${e.slug}#${e.number}`));
  const slugs = [...new Set(liveSlugs)].sort((a, b) => b.length - a.length);
  const orphans: string[] = [];
  for (const path of paths) {
    const parts = path.split("/");
    if ((parts[0] === "episodes" || parts[0] === "work") && parts.length === 3) {
      const number = episodeNumberFromName(parts[2]);
      if (number == null) continue;
      if (!episodes.has(`${parts[1]}#${number}`)) orphans.push(path);
      continue;
    }
    if (parts[0] === "posters" && parts.length === 2) {
      const owned = slugs.some((slug) => isSeriesPosterName(parts[1], slug));
      if (!owned) orphans.push(path);
    }
  }
  return orphans;
}

export async function listChildren(
  storage: StorageBucketApi,
  bucket: string,
  prefix: string
): Promise<{ files: string[]; folders: string[] }> {
  const files: string[] = [];
  const folders: string[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await storage.from(bucket).list(prefix, {
      limit: page,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const entry of batch) {
      if (!entry?.name) continue;
      if (entry.id == null) folders.push(entry.name);
      else files.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
    if (batch.length < page) break;
  }
  return { files, folders };
}

export async function listFiles(storage: StorageBucketApi, bucket: string, prefix: string): Promise<string[]> {
  return (await listChildren(storage, bucket, prefix)).files;
}

/** Vídeo, poster, legendas e artefactos `work/` deste episódio, mais o caminho do URL gravado. */
export async function episodeMediaPaths(
  storage: StorageBucketApi,
  slug: string,
  number: number,
  urls: Array<string | null | undefined>
): Promise<string[]> {
  const listed = [
    ...(await listFiles(storage, TVIBOX_BUCKET, `episodes/${slug}`)),
    ...(await listFiles(storage, TVIBOX_BUCKET, `work/${slug}`)),
  ];
  const paths = new Set(pathsForEpisode(listed, slug, number));
  for (const url of urls) {
    const path = publicObjectPath(url);
    if (path) paths.add(path);
  }
  return [...paths];
}

/** Tudo o que a série ocupa no bucket: episódios, renders intermédios e poster. */
export async function seriesMediaPaths(
  storage: StorageBucketApi,
  slug: string,
  urls: Array<string | null | undefined>
): Promise<string[]> {
  const listed = [
    ...(await listFiles(storage, TVIBOX_BUCKET, `episodes/${slug}`)),
    ...(await listFiles(storage, TVIBOX_BUCKET, `work/${slug}`)),
  ];
  const posters = await listFiles(storage, TVIBOX_BUCKET, "posters");
  const paths = new Set(listed);
  for (const path of posters) {
    const name = path.slice("posters/".length);
    if (isSeriesPosterName(name, slug)) paths.add(path);
  }
  for (const url of urls) {
    const path = publicObjectPath(url);
    if (!path) continue;
    if (path.startsWith(`episodes/${slug}/`) || path.startsWith(`work/${slug}/`) || path.startsWith("posters/")) paths.add(path);
  }
  return [...paths];
}

export async function removeStoragePaths(storage: StorageBucketApi, bucket: string, paths: string[]): Promise<number> {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += REMOVE_CHUNK) {
    const chunk = unique.slice(i, i + REMOVE_CHUNK);
    const { error } = await storage.from(bucket).remove(chunk);
    if (error) throw new Error(error.message);
  }
  return unique.length;
}
