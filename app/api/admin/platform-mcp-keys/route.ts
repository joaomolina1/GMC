import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";
import {
  generateMcpKeySecret,
  hashMcpKey,
  MCP_KEY_PREFIX,
} from "@lib/enterprise/mcp-key-auth";
import { tryCreateServiceClient } from "@lib/supabase/server";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("platform_mcp_keys")
    .select(
      "id, name, key_prefix, user_id, expires_at, last_used_at, revoked_at, created_at, profiles!platform_mcp_keys_user_id_fkey(email, full_name)"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row) => {
    const profile = row.profiles as { email?: string; full_name?: string } | null;
    return {
      id: row.id,
      name: row.name,
      key_prefix: row.key_prefix,
      user_id: row.user_id,
      user_email: profile?.email ?? null,
      user_name: profile?.full_name ?? null,
      expires_at: row.expires_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
    };
  });

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { name, user_id, expires_at } = body as {
    name?: string;
    user_id?: string;
    expires_at?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const ownerId = user_id ?? user.id;
  const secret = generateMcpKeySecret();
  const keyHash = hashMcpKey(secret);
  const keyPrefix = secret.slice(0, MCP_KEY_PREFIX.length + 8);

  const service = await tryCreateServiceClient();
  const db = service ?? supabase;

  const { data, error } = await db
    .from("platform_mcp_keys")
    .insert({
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      user_id: ownerId,
      expires_at: expires_at ?? null,
      created_by: user.id,
    })
    .select("id, name, key_prefix, user_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: "mcp_key.create",
    entityType: "platform_mcp_key",
    entityId: data.id,
    metadata: { name: data.name, user_id: ownerId },
  });

  return NextResponse.json({
    ...data,
    secret,
    warning: "Guarde esta chave agora — não será mostrada novamente.",
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { id, action } = body as { id?: string; action?: string };

  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  if (action !== "revoke") {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("platform_mcp_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id, name, key_prefix, revoked_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Chave não encontrada" }, { status: 404 });

  await logAudit(supabase, {
    actorId: user.id,
    action: "mcp_key.revoke",
    entityType: "platform_mcp_key",
    entityId: id,
  });

  return NextResponse.json(data);
}
