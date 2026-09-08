import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { audit, jsonError, withAdmin } from "@lib/pt26/admin";
import { PT26_BUCKET, logoPath } from "@lib/pt26/media";
import { PARTY_COLUMNS } from "@lib/pt26/server";
import { createServiceClient } from "@lib/supabase/server";
import type { PartyRow } from "@lib/pt26/types";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
type Params = { params: Promise<{ id: string }> };

async function removeLogo(path: string | null) {
  if (!path) return;
  try {
    const service = await createServiceClient();
    await service.storage.from(PT26_BUCKET).remove([path]);
  } catch {
    /* melhor esforço */
  }
}

/** Logótipo do partido: PNG (fundo transparente, redimensionado a 512px) ou SVG. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError("Ficheiro em falta", 422);
    if (file.size > MAX_BYTES) return jsonError("Logótipo demasiado grande (máx. 4 MB)", 413);

    const { data: party, error } = await ctx.supabase.from("pt26_parties").select(PARTY_COLUMNS).eq("id", id).maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!party) return jsonError("Partido não encontrado", 404);

    const source = Buffer.from(await file.arrayBuffer());
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    let bytes: Buffer;
    let ext: "png" | "svg";
    let contentType: string;
    if (isSvg) {
      const text = source.toString("utf8");
      if (!/<svg[\s>]/i.test(text)) return jsonError("SVG inválido", 422);
      if (/<script|on\w+\s*=|javascript:/i.test(text)) return jsonError("SVG com scripts não é permitido", 422);
      bytes = source;
      ext = "svg";
      contentType = "image/svg+xml";
    } else if (file.type === "image/png" || file.type === "image/webp") {
      try {
        bytes = await sharp(source, { failOn: "none" }).resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      } catch (e) {
        return jsonError(`Imagem inválida: ${e instanceof Error ? e.message : "não foi possível processar"}`, 422);
      }
      ext = "png";
      contentType = "image/png";
    } else {
      return jsonError("Formato não suportado — usa PNG (fundo transparente) ou SVG", 422);
    }

    const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 12);
    const path = logoPath(id, hash, ext);
    const service = await createServiceClient();
    const { error: upErr } = await service.storage.from(PT26_BUCKET).upload(path, bytes, { contentType, cacheControl: "31536000", upsert: true });
    if (upErr) return jsonError(`Upload falhou: ${upErr.message}`, 500);

    const previous = (party as PartyRow).logo_path;
    const { data, error: saveErr } = await ctx.supabase.from("pt26_parties").update({ logo_path: path }).eq("id", id).select(PARTY_COLUMNS).single();
    if (saveErr) return jsonError(saveErr.message, 500);
    if (previous && previous !== path) await removeLogo(previous);
    await audit(ctx, "pt26.party.logo", "pt26_parties", id, { path });
    return NextResponse.json({ ok: true, party: data });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const { data: party } = await ctx.supabase.from("pt26_parties").select(PARTY_COLUMNS).eq("id", id).maybeSingle();
    if (!party) return jsonError("Partido não encontrado", 404);
    const { data, error } = await ctx.supabase.from("pt26_parties").update({ logo_path: null }).eq("id", id).select(PARTY_COLUMNS).single();
    if (error) return jsonError(error.message, 500);
    await removeLogo((party as PartyRow).logo_path);
    await audit(ctx, "pt26.party.logo.remove", "pt26_parties", id);
    return NextResponse.json({ ok: true, party: data });
  });
}
