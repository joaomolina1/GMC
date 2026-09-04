import { z } from "zod";
import { fail, json, parseBody, withUser } from "@lib/tvibox/api";

const schema = z.object({
  episodeId: z.string().uuid(),
  position: z.number().min(0).max(36_000),
  completed: z.boolean().default(false),
});

export async function POST(req: Request) {
  return withUser(async ({ supabase, userId }) => {
    const body = await parseBody(req, schema);
    if (body instanceof Response) return body;
    const { data: existing } = await supabase
      .from("tvibox_progress")
      .select("completed")
      .eq("user_id", userId)
      .eq("episode_id", body.episodeId)
      .maybeSingle();
    const { error } = await supabase.from("tvibox_progress").upsert(
      {
        user_id: userId,
        episode_id: body.episodeId,
        position_seconds: Math.round(body.position * 100) / 100,
        completed: body.completed || !!existing?.completed,
      },
      { onConflict: "user_id,episode_id" }
    );
    if (error) return fail(error.message, 500);
    return json({ ok: true });
  });
}
