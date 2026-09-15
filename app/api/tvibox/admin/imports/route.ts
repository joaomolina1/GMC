import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseEnv } from "@lib/supabase/env";
import { SLUG_RE, audit, readJson, withAdmin } from "@lib/tvibox/admin";

const IMPORTS_BUCKET = "tvibox-imports";

const createSchema = z.object({
  files: z
    .array(z.object({ name: z.string().min(1).max(200), size: z.number().int().min(1), type: z.string().max(100).default("") }))
    .min(1)
    .max(200),
  hints: z
    .object({
      title: z.string().trim().max(80).optional(),
      slug: z.string().trim().regex(SLUG_RE).max(40).optional(),
      publish: z.boolean().optional(),
    })
    .default({}),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["uploaded", "publish", "cancel", "retry", "fail"]),
  error: z.string().trim().max(500).optional(),
});

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);

/** Lista os jobs de importação (mais recentes primeiro). */
export async function GET() {
  return withAdmin(async (ctx) => {
    const { data, error } = await ctx.supabase
      .from("tvibox_import_jobs")
      .select("id, status, files, hints, step, progress, log, proposal, series_id, error, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, jobs: data ?? [] });
  });
}

/**
 * Cria um job e devolve o destino TUS de cada ficheiro. O browser carrega direto para o
 * bucket privado `tvibox-imports/<jobId>/…` (resumable, 6 MiB por chunk) e depois marca
 * o job como `queued` com PATCH { action: "uploaded" }.
 */
export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, createSchema);
    if (body instanceof NextResponse) return body;
    const { data: job, error } = await ctx.supabase
      .from("tvibox_import_jobs")
      .insert({ created_by: ctx.user.id, status: "uploading", hints: body.hints, files: [] })
      .select("id")
      .single();
    if (error || !job) return NextResponse.json({ ok: false, error: error?.message ?? "Sem job" }, { status: 400 });

    const files = body.files.map((f) => ({ name: f.name, size: f.size, type: f.type, path: `${job.id}/${safeName(f.name)}` }));
    const { error: uErr } = await ctx.supabase.from("tvibox_import_jobs").update({ files }).eq("id", job.id);
    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 400 });
    await audit(ctx, "tvibox.import.create", "tvibox_import_jobs", job.id, { files: files.length, hints: body.hints });

    const { url } = getSupabaseEnv();
    return NextResponse.json({
      ok: true,
      job: { id: job.id, files },
      upload: {
        protocol: "tus",
        endpoint: `${url.replace(/\/$/, "")}/storage/v1/upload/resumable`,
        bucket: IMPORTS_BUCKET,
        chunkSize: 6 * 1024 * 1024,
      },
    });
  });
}

/**
 * uploaded → fica em fila para o worker (`npm run tvibox:import -- --job <id>`);
 * fail     → o TUS no browser falhou (p.ex. 413); o job deixa de ficar preso em «A carregar»;
 * publish  → publica todos os episódios da série criada (EP1 grátis, restantes 15 moedas);
 * cancel   → cancela; retry → volta à fila depois de uma falha.
 */
export async function PATCH(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, patchSchema);
    if (body instanceof NextResponse) return body;
    const { data: job, error } = await ctx.supabase.from("tvibox_import_jobs").select("*").eq("id", body.id).single();
    if (error || !job) return NextResponse.json({ ok: false, error: "Job não encontrado" }, { status: 404 });

    if (body.action === "uploaded") {
      if (job.status !== "uploading") return NextResponse.json({ ok: false, error: `Job em estado ${job.status}` }, { status: 409 });
      await ctx.supabase.from("tvibox_import_jobs").update({ status: "queued", log: [...(job.log ?? []), "Ficheiros carregados. À espera do worker."] }).eq("id", job.id);
    } else if (body.action === "fail") {
      if (job.status !== "uploading") return NextResponse.json({ ok: false, error: `Job em estado ${job.status}` }, { status: 409 });
      const msg = body.error || "Falha no upload";
      await ctx.supabase
        .from("tvibox_import_jobs")
        .update({ status: "failed", error: msg, log: [...(job.log ?? []), msg] })
        .eq("id", job.id);
    } else if (body.action === "cancel") {
      if (!["uploading", "queued", "failed"].includes(job.status)) return NextResponse.json({ ok: false, error: "Só se cancela antes de correr" }, { status: 409 });
      await ctx.supabase.from("tvibox_import_jobs").update({ status: "cancelled" }).eq("id", job.id);
    } else if (body.action === "retry") {
      if (job.status !== "failed") return NextResponse.json({ ok: false, error: "Só se repete um job falhado" }, { status: 409 });
      await ctx.supabase.from("tvibox_import_jobs").update({ status: "queued", error: null }).eq("id", job.id);
    } else if (body.action === "publish") {
      if (job.status !== "review" || !job.series_id) return NextResponse.json({ ok: false, error: "Job ainda não tem série para publicar" }, { status: 409 });
      const now = new Date().toISOString();
      const { error: e1 } = await ctx.supabase
        .from("tvibox_episodes")
        .update({ status: "published", published_at: now })
        .eq("series_id", job.series_id)
        .not("video_url", "is", null);
      if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });
      await ctx.supabase.from("tvibox_episodes").update({ is_free: true, coin_cost: 0 }).eq("series_id", job.series_id).eq("number", 1);
      await ctx.supabase.from("tvibox_import_jobs").update({ status: "published", log: [...(job.log ?? []), "Publicado no Estúdio."] }).eq("id", job.id);
      await audit(ctx, "tvibox.import.publish", "tvibox_series", job.series_id);
    }

    const { data: fresh } = await ctx.supabase.from("tvibox_import_jobs").select("*").eq("id", body.id).single();
    return NextResponse.json({ ok: true, job: fresh });
  });
}
