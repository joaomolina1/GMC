import { z } from "zod";
import { fail, json, parseBody, withUser } from "@lib/tvibox/api";

const schema = z.object({ seriesId: z.string().uuid(), on: z.boolean() });

export async function POST(req: Request) {
  return withUser(async ({ supabase, userId }) => {
    const body = await parseBody(req, schema);
    if (body instanceof Response) return body;
    const q = body.on
      ? supabase.from("tvibox_list").upsert({ user_id: userId, series_id: body.seriesId }, { onConflict: "user_id,series_id" })
      : supabase.from("tvibox_list").delete().eq("user_id", userId).eq("series_id", body.seriesId);
    const { error } = await q;
    if (error) return fail(error.message, 500);
    return json({ ok: true, on: body.on });
  });
}
