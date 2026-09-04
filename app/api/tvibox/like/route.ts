import { z } from "zod";
import { fail, json, parseBody, withUser } from "@lib/tvibox/api";

const schema = z.object({ episodeId: z.string().uuid(), on: z.boolean() });

export async function POST(req: Request) {
  return withUser(async ({ supabase, userId }) => {
    const body = await parseBody(req, schema);
    if (body instanceof Response) return body;
    const q = body.on
      ? supabase.from("tvibox_likes").upsert({ user_id: userId, episode_id: body.episodeId }, { onConflict: "user_id,episode_id" })
      : supabase.from("tvibox_likes").delete().eq("user_id", userId).eq("episode_id", body.episodeId);
    const { error } = await q;
    if (error) return fail(error.message, 500);
    return json({ ok: true, on: body.on });
  });
}
