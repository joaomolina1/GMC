import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import type { MarketplaceAgent } from "@lib/marketplace/types";
import { normalizeProfileRelation } from "@lib/marketplace/utils";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "";
  const sort = searchParams.get("sort") ?? "recent";
  const tab = searchParams.get("tab") ?? "all";

  let agentIds: string[] | null = null;

  if (tab === "favorites") {
    const { data: favs } = await supabase
      .from("agent_favorites")
      .select("agent_id")
      .eq("user_id", user.id);
    agentIds = (favs ?? []).map((f) => f.agent_id);
    if (agentIds.length === 0) return NextResponse.json([]);
  }

  if (tab === "following") {
    const { data: follows } = await supabase
      .from("agent_follows")
      .select("agent_id")
      .eq("user_id", user.id);
    agentIds = (follows ?? []).map((f) => f.agent_id);
    if (agentIds.length === 0) return NextResponse.json([]);
  }

  let query = supabase
    .from("agents")
    .select(
      `
      id, name, description, image_url, category, tags, status, visibility,
      rating, downloads, created_at, updated_at, owner_id, current_version_id,
      profiles:owner_id ( id, full_name, avatar_url ),
      agent_versions!agent_versions_agent_id_fkey ( id, model, skills, status )
    `
    )
    .eq("visibility", "public")
    .eq("status", "published");

  if (agentIds) {
    query = query.in("id", agentIds);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  if (sort === "downloads") {
    query = query.order("downloads", { ascending: false });
  } else if (sort === "rating") {
    query = query.order("rating", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const { data: agents, error } = await query.limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (agents ?? []).map((a) => a.id);

  const [{ data: favorites }, { data: follows }] = await Promise.all([
    ids.length
      ? supabase
          .from("agent_favorites")
          .select("agent_id")
          .eq("user_id", user.id)
          .in("agent_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("agent_follows")
          .select("agent_id")
          .eq("user_id", user.id)
          .in("agent_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  const favoriteSet = new Set((favorites ?? []).map((f) => f.agent_id));
  const followSet = new Set((follows ?? []).map((f) => f.agent_id));

  const result: MarketplaceAgent[] = (agents ?? []).map((agent) => {
    const versions = agent.agent_versions as Array<{
      id: string;
      model: string;
      skills: string[];
      status: string;
    }> | null;
    const current =
      versions?.find((v) => v.id === agent.current_version_id) ??
      versions?.find((v) => v.status === "published") ??
      versions?.[0];
    const owner = normalizeProfileRelation(agent.profiles);

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      image_url: agent.image_url,
      category: agent.category,
      tags: agent.tags ?? [],
      status: agent.status,
      visibility: agent.visibility,
      rating: Number(agent.rating ?? 0),
      downloads: agent.downloads ?? 0,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
      owner: owner
        ? { id: owner.id, full_name: owner.full_name, avatar_url: owner.avatar_url }
        : null,
      skills: (current?.skills as string[]) ?? [],
      model: current?.model ?? null,
      is_favorited: favoriteSet.has(agent.id),
      is_following: followSet.has(agent.id),
      is_owner: agent.owner_id === user.id,
    };
  });

  return NextResponse.json(result);
}
