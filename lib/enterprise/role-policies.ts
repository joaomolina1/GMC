import type { SupabaseClient } from "@supabase/supabase-js";

export const USER_ROLES = [
  "guest",
  "user",
  "power_user",
  "admin",
  "super_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  guest: "Convidado",
  user: "Utilizador",
  power_user: "Power user",
  admin: "Administrador",
  super_admin: "Super admin",
};

export interface RolePolicy {
  role: UserRole;
  monthly_token_limit: number | null;
  monthly_cost_limit_eur: number | null;
  allowed_model_ids: string[];
  updated_at?: string;
}

const UNRESTRICTED_ROLES: UserRole[] = ["admin", "super_admin"];

export function isUnrestrictedRole(role: string): boolean {
  return UNRESTRICTED_ROLES.includes(role as UserRole);
}

/** Returns null when all enabled models are allowed. */
export async function getAllowedModelIdsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string[] | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = (profile?.role ?? "user") as UserRole;
  if (isUnrestrictedRole(role)) return null;

  const { data, error } = await supabase.rpc("get_role_allowed_model_ids", {
    p_user_id: userId,
  });

  if (error) {
    console.warn("[role-policies] get_role_allowed_model_ids failed", error.message);
    return null;
  }

  const ids = (data as string[] | null) ?? [];
  if (ids.length === 0) return null;
  return ids;
}

export async function assertModelAllowedForUser(
  supabase: SupabaseClient,
  userId: string,
  modelId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const allowed = await getAllowedModelIdsForUser(supabase, userId);
  if (!allowed) return { ok: true };
  if (allowed.includes(modelId)) return { ok: true };
  return {
    ok: false,
    message: `O modelo «${modelId}» não está disponível para o seu perfil. Contacte o administrador.`,
  };
}
