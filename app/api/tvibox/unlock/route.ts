import { z } from "zod";
import { parseBody, rpcJson, withUser } from "@lib/tvibox/api";

const schema = z.object({ episodeId: z.string().uuid("episodeId inválido") });

export async function POST(req: Request) {
  return withUser(async ({ supabase }) => {
    const body = await parseBody(req, schema);
    if (body instanceof Response) return body;
    return rpcJson(supabase, "tvibox_unlock_episode", { p_episode_id: body.episodeId });
  });
}
