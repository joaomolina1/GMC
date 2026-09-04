import { withUser, json } from "@lib/tvibox/api";
import { getViewer, getWallet } from "@lib/tvibox/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async ({ supabase }) => {
    const [viewer, wallet] = await Promise.all([getViewer(supabase), getWallet(supabase)]);
    return json({ ok: true, viewer, wallet });
  });
}
