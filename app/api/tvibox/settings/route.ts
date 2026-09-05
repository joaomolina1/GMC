import { z } from "zod";
import { fail, json, parseBody, withUser } from "@lib/tvibox/api";

const schema = z.object({
  parental: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  return withUser(async ({ supabase, userId }) => {
    const body = await parseBody(req, schema);
    if (body instanceof Response) return body;
    await supabase.rpc("tvibox_ensure_wallet");
    const { data: current } = await supabase.from("tvibox_wallets").select("settings").eq("user_id", userId).maybeSingle();
    const settings = { parental: false, ...(current?.settings ?? {}), ...body };
    const { error } = await supabase.from("tvibox_wallets").update({ settings }).eq("user_id", userId);
    if (error) return fail(error.message, 500);
    return json({ ok: true, settings });
  });
}
