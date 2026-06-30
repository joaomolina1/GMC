import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import type { MarketplaceAgent } from "@lib/marketplace/types";
import { normalizeProfileRelation } from "@lib/marketplace/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent, error } = await supabase
    .from("agents")
    .select(
      `
      id, name, description, image_url, category, tags, status, visibility,
      rating, downloads, created_at, updated_at, owner_id, current_version_id,
      profiles:owner_id ( id, full_name, avatar_url ),
      agent_versions!agent_versions_agent_id_fkey ( id, model, skills, status, version, published_at )
    `
    )
    .eq("id", id)
    .eq("visibility", "public")
    .eq("status", "published")
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const versions = agent.agent_versions as Array<{
    id: string;
    model: string;
    skills: string[];
    status: string;
    version: number;
    published_at: string | null;
  }>;
  const current =
    versions?.find((v) => v.id === agent.current_version_id) ??
    versions?.find((v) => v.status === "published");

  const [{ data: favorite }, { data: follow }] = await Promise.all([
    supabase
      .from("agent_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("agent_id", id)
      .maybeSingle(),
    supabase
      .from("agent_follows")
      .select("id")
      .eq("user_id", user.id)
      .eq("agent_id", id)
      .maybeSingle(),
  ]);

  const owner = normalizeProfileRelation(agent.profiles);

  const result: MarketplaceAgent & {
    version: number | null;
    published_at: string | null;
  } = {
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
    is_favorited: Boolean(favorite),
    is_following: Boolean(follow),
    is_owner: agent.owner_id === user.id,
    version: current?.version ?? null,
    published_at: current?.published_at ?? null,
  };

  return NextResponse.json(result);
}
