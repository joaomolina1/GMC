/** Convenções de caminhos no bucket público `tvibox` do Supabase Storage. */

export const TVIBOX_BUCKET = "tvibox";

export function posterPath(slug: string): string {
  return `posters/${slug}.jpg`;
}

export function episodeVideoPath(slug: string, number: number, kind: "animatic" | "final"): string {
  return `episodes/${slug}/ep${number}-${kind}.mp4`;
}

export function episodeSubtitlesPath(slug: string, number: number): string {
  return `episodes/${slug}/ep${number}.pt.vtt`;
}

export function episodePosterPath(slug: string, number: number): string {
  return `episodes/${slug}/ep${number}-poster.jpg`;
}

export function publicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${TVIBOX_BUCKET}/${path}`;
}

export function posterPublicUrl(supabaseUrl: string, slug: string): string {
  return publicUrl(supabaseUrl, posterPath(slug));
}
