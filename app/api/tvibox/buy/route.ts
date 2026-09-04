import { z } from "zod";
import { parseBody, rpcJson, withUser } from "@lib/tvibox/api";

const schema = z.object({ pack: z.enum(["p60", "p180", "p500"]) });

export async function POST(req: Request) {
  return withUser(async ({ supabase }) => {
    const body = await parseBody(req, schema);
    if (body instanceof Response) return body;
    return rpcJson(supabase, "tvibox_purchase", { p_pack: body.pack });
  });
}
