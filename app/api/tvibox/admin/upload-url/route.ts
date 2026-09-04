import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@lib/supabase/server";
import { getSupabaseEnv } from "@lib/supabase/env";
import { SLUG_RE, readJson, withAdmin } from "@lib/tvibox/admin";
import { TVIBOX_BUCKET, publicUrl } from "@lib/tvibox/media";

const schema = z.object({
  kind: z.enum(["video", "poster", "subtitles", "series-poster"]),
  seriesSlug: z.string().regex(SLUG_RE),
  number: z.number().int().min(1).max(999).optional(),
  contentType: z.string().min(3).max(100),
  filename: z.string().max(200).optional(),
});

const ALLOWED: Record<z.infer<typeof schema>["kind"], { types: string[]; ext: (ct: string) => string }> = {
  video: { types: ["video/mp4", "video/quicktime", "video/webm"], ext: (ct) => (ct === "video/webm" ? "webm" : ct === "video/quicktime" ? "mov" : "mp4") },
  poster: { types: ["image/jpeg", "image/png", "image/webp"], ext: (ct) => (ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg") },
  "series-poster": { types: ["image/jpeg", "image/png", "image/webp"], ext: (ct) => (ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg") },
  subtitles: { types: ["text/vtt", "text/plain", "application/octet-stream"], ext: () => "vtt" },
};

/**
 * Devolve um URL assinado para o browser fazer upload direto ao bucket `tvibox`
 * (a API da Vercel não aceita corpos grandes). Só admins; caminhos com carimbo
 * temporal para não colidirem com a cache do CDN.
 */
export async function POST(req: Request) {
  return withAdmin(async () => {
    const body = await readJson(req, schema);
    if (body instanceof NextResponse) return body;
    const rule = ALLOWED[body.kind];
    if (!rule.types.includes(body.contentType)) {
      return NextResponse.json({ ok: false, error: `Tipo ${body.contentType} não permitido para ${body.kind}` }, { status: 422 });
    }
    if (body.kind !== "series-poster" && !body.number) {
      return NextResponse.json({ ok: false, error: "number em falta" }, { status: 422 });
    }
    const stamp = Date.now().toString(36);
    const ext = rule.ext(body.contentType);
    const path =
      body.kind === "series-poster"
        ? `posters/${body.seriesSlug}-${stamp}.${ext}`
        : body.kind === "video"
          ? `episodes/${body.seriesSlug}/ep${body.number}-${stamp}.${ext}`
          : body.kind === "poster"
            ? `episodes/${body.seriesSlug}/ep${body.number}-poster-${stamp}.${ext}`
            : `episodes/${body.seriesSlug}/ep${body.number}-${stamp}.pt.vtt`;

    const service = await createServiceClient();
    const { data, error } = await service.storage.from(TVIBOX_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Sem URL" }, { status: 500 });
    return NextResponse.json({
      ok: true,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: publicUrl(getSupabaseEnv().url, path),
      contentType: body.kind === "subtitles" ? "text/vtt" : body.contentType,
    });
  });
}
