import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { audit, jsonError, withAdmin } from "@lib/pt26/admin";
import { PHOTO_SIZES, PT26_BUCKET, photoBasePath, photoPath } from "@lib/pt26/media";
import { PERSON_COLUMNS } from "@lib/pt26/server";
import { createServiceClient } from "@lib/supabase/server";
import type { PersonRow } from "@lib/pt26/types";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Params = { params: Promise<{ id: string }> };

async function removePhotoFiles(basePath: string | null) {
  if (!basePath) return;
  try {
    const service = await createServiceClient();
    await service.storage.from(PT26_BUCKET).remove(PHOTO_SIZES.map((s) => photoPath(basePath, s)));
  } catch {
    /* ficheiros antigos ficam órfãos no pior caso */
  }
}

/**
 * Fotografia da pessoa: recebe a imagem já recortada ao quadrado pelo back-office (JPG/PNG/WEBP,
 * até 10 MB), gera versões 256px e 800px em WEBP com `sharp` e guarda no bucket `pt26` com nome
 * com hash (cache longa). Aceita também `crop` (x,y,width,height em px) para recortar no servidor.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError("Ficheiro em falta", 422);
    if (!TYPES.has(file.type)) return jsonError("Formato não suportado — usa JPG, PNG ou WEBP", 422);
    if (file.size > MAX_BYTES) return jsonError("Imagem demasiado grande (máx. 10 MB)", 413);

    const { data: person, error } = await ctx.supabase.from("pt26_people").select(PERSON_COLUMNS).eq("id", id).maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!person) return jsonError("Pessoa não encontrada", 404);

    const source = Buffer.from(await file.arrayBuffer());
    let image = sharp(source, { failOn: "none" }).rotate();
    const cropRaw = form?.get("crop");
    if (typeof cropRaw === "string" && cropRaw) {
      try {
        const c = JSON.parse(cropRaw) as { x: number; y: number; width: number; height: number };
        const meta = await image.metadata();
        const W = meta.width ?? 0;
        const H = meta.height ?? 0;
        const left = Math.max(0, Math.round(c.x));
        const top = Math.max(0, Math.round(c.y));
        const size = Math.max(1, Math.min(Math.round(c.width), Math.round(c.height), W - left, H - top));
        image = image.extract({ left, top, width: size, height: size });
      } catch {
        return jsonError("Coordenadas de recorte inválidas", 422);
      }
    }

    const hash = createHash("sha1").update(source).update(String(cropRaw ?? "")).digest("hex").slice(0, 12);
    const basePath = photoBasePath(id, hash);

    let versions: { size: (typeof PHOTO_SIZES)[number]; bytes: Buffer }[];
    try {
      versions = await Promise.all(
        PHOTO_SIZES.map(async (size) => ({
          size,
          bytes: await image.clone().resize(size, size, { fit: "cover", position: "attention" }).webp({ quality: size > 400 ? 86 : 82 }).toBuffer(),
        }))
      );
    } catch (e) {
      return jsonError(`Imagem inválida: ${e instanceof Error ? e.message : "não foi possível processar"}`, 422);
    }

    const service = await createServiceClient();
    for (const v of versions) {
      const { error: upErr } = await service.storage
        .from(PT26_BUCKET)
        .upload(photoPath(basePath, v.size), v.bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
      if (upErr) return jsonError(`Upload falhou: ${upErr.message}`, 500);
    }

    const previous = (person as PersonRow).photo_path;
    const { data, error: saveErr } = await ctx.supabase.from("pt26_people").update({ photo_path: basePath }).eq("id", id).select(PERSON_COLUMNS).single();
    if (saveErr) return jsonError(saveErr.message, 500);
    if (previous && previous !== basePath) await removePhotoFiles(previous);
    await audit(ctx, "pt26.person.photo", "pt26_people", id, { path: basePath, bytes: file.size });
    return NextResponse.json({ ok: true, person: data });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const { data: person } = await ctx.supabase.from("pt26_people").select(PERSON_COLUMNS).eq("id", id).maybeSingle();
    if (!person) return jsonError("Pessoa não encontrada", 404);
    const { data, error } = await ctx.supabase.from("pt26_people").update({ photo_path: null }).eq("id", id).select(PERSON_COLUMNS).single();
    if (error) return jsonError(error.message, 500);
    await removePhotoFiles((person as PersonRow).photo_path);
    await audit(ctx, "pt26.person.photo.remove", "pt26_people", id);
    return NextResponse.json({ ok: true, person: data });
  });
}
