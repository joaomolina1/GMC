import { z } from "zod";
import { fail, json, parseBody, withUser } from "@lib/tvibox/api";

const createSchema = z.object({
  episodeId: z.string().uuid(),
  body: z.string().trim().min(1, "Comentário vazio").max(500, "Máximo 500 caracteres"),
});

export async function GET(req: Request) {
  return withUser(async ({ supabase }) => {
    const episodeId = new URL(req.url).searchParams.get("episodeId");
    if (!episodeId || !z.string().uuid().safeParse(episodeId).success) return fail("episodeId inválido", 422);
    const { data, error } = await supabase.rpc("tvibox_episode_comments", { p_episode_id: episodeId, p_limit: 100 });
    if (error) return fail(error.message, 500);
    return json({ ok: true, comments: data ?? [] });
  });
}

export async function POST(req: Request) {
  return withUser(async ({ supabase, userId }) => {
    const body = await parseBody(req, createSchema);
    if (body instanceof Response) return body;
    const { data, error } = await supabase
      .from("tvibox_comments")
      .insert({ user_id: userId, episode_id: body.episodeId, body: body.body })
      .select("id, body, created_at")
      .single();
    if (error) return fail(error.message, 500);
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    const author_name = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Eu";
    return json({ ok: true, comment: { ...data, author_name, is_mine: true } });
  });
}

export async function DELETE(req: Request) {
  return withUser(async ({ supabase, userId }) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return fail("id inválido", 422);
    const { error } = await supabase.from("tvibox_comments").delete().eq("id", id).eq("user_id", userId);
    if (error) return fail(error.message, 500);
    return json({ ok: true });
  });
}
