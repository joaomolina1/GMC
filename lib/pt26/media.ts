/** Convenções de caminhos no bucket público `pt26` (fotografias e logótipos). */

export const PT26_BUCKET = "pt26";

export const PHOTO_SIZES = [256, 800] as const;
export type PhotoSize = (typeof PHOTO_SIZES)[number];

export function mediaBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PT26_BUCKET}`;
}

/** Caminho base de uma fotografia (sem sufixo de tamanho): people/<id>/<hash>. */
export function photoBasePath(personId: string, hash: string): string {
  return `people/${personId}/${hash}`;
}

export function photoPath(basePath: string, size: PhotoSize): string {
  return `${basePath}-${size}.webp`;
}

export function photoUrl(base: string, basePath: string, size: PhotoSize): string {
  return `${base}/${photoPath(basePath, size)}`;
}

/** Caminho de um logótipo de partido: parties/<id>/<hash>.<ext>. */
export function logoPath(partyId: string, hash: string, ext: "png" | "svg" | "webp"): string {
  return `parties/${partyId}/${hash}.${ext}`;
}

export function mediaUrl(base: string, path: string): string {
  return `${base}/${path}`;
}
