import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@lib/supabase/server";
import { getSupabaseEnv } from "@lib/supabase/env";
import { buildLivePayload } from "./live";
import { buildMatcher, type Matcher } from "./matching";
import { mediaBaseUrl } from "./media";
import type {
  ImportLogRow,
  LivePayload,
  PartyRow,
  PersonRow,
  QuadroRow,
  QuestionRow,
  ResultRow,
  SettingsRow,
  WeekRow,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

export const PARTY_COLUMNS = "id, acronym, name, color, logo_path, sort_order";
export const PERSON_COLUMNS = "id, name, role, kind, party_id, photo_path, aliases";
export const QUESTION_COLUMNS = "id, number, title, subtitle, kind, sign, sort_order";
export const WEEK_COLUMNS = "id, date, label, status, source_file_name, imported_at, published_at";
export const QUADRO_COLUMNS = "id, week_id, question_id, idx, title, person_id";
export const RESULT_COLUMNS = "id, quadro_id, item_key, value, person_id, party_id, sort_order";

function fail(prefix: string, error: { message: string } | null) {
  if (error) throw new Error(`${prefix}: ${error.message}`);
}

export interface Reference {
  parties: PartyRow[];
  people: PersonRow[];
  questions: QuestionRow[];
  matcher: Matcher;
}

export async function loadReference(sb: Db): Promise<Reference> {
  const [parties, people, questions] = await Promise.all([
    sb.from("pt26_parties").select(PARTY_COLUMNS).order("sort_order"),
    sb.from("pt26_people").select(PERSON_COLUMNS).order("name"),
    sb.from("pt26_questions").select(QUESTION_COLUMNS).order("number"),
  ]);
  fail("partidos", parties.error);
  fail("pessoas", people.error);
  fail("perguntas", questions.error);
  const p = (parties.data ?? []) as unknown as PartyRow[];
  const pe = (people.data ?? []) as unknown as PersonRow[];
  return { parties: p, people: pe, questions: (questions.data ?? []) as unknown as QuestionRow[], matcher: buildMatcher(p, pe) };
}

export async function loadWeeks(sb: Db, opts: { includeDrafts: boolean; weekIds?: string[] }) {
  let q = sb.from("pt26_weeks").select(WEEK_COLUMNS).order("date");
  if (!opts.includeDrafts) q = q.eq("status", "PUBLISHED");
  if (opts.weekIds) q = q.in("id", opts.weekIds);
  const weeks = await q;
  fail("semanas", weeks.error);
  const weekRows = (weeks.data ?? []) as unknown as WeekRow[];
  if (weekRows.length === 0) return { weeks: weekRows, quadros: [] as QuadroRow[], results: [] as ResultRow[] };

  const ids = weekRows.map((w) => w.id);
  const quadros = await sb.from("pt26_quadros").select(QUADRO_COLUMNS).in("week_id", ids).order("idx");
  fail("quadros", quadros.error);
  const quadroRows = (quadros.data ?? []) as unknown as QuadroRow[];
  const quadroIds = quadroRows.map((q) => q.id);
  const results = quadroIds.length
    ? await sb.from("pt26_results").select(RESULT_COLUMNS).in("quadro_id", quadroIds).order("sort_order")
    : { data: [], error: null };
  fail("resultados", results.error);
  return { weeks: weekRows, quadros: quadroRows, results: (results.data ?? []) as unknown as ResultRow[] };
}

export async function loadSettings(sb: Db): Promise<SettingsRow | null> {
  const { data, error } = await sb.from("pt26_settings").select("live_token, footer_text, logo_year").eq("id", 1).maybeSingle();
  fail("definições", error);
  return (data as SettingsRow | null) ?? null;
}

/** Payload completo do ecrã do pivot. `sb` deve ser o service role (live) ou uma sessão admin (preview). */
export async function buildLive(sb: Db, includeDrafts: boolean): Promise<LivePayload> {
  const [ref, data, settings] = await Promise.all([loadReference(sb), loadWeeks(sb, { includeDrafts }), loadSettings(sb)]);
  return buildLivePayload({
    settings,
    parties: ref.parties,
    people: ref.people,
    questions: ref.questions,
    weeks: data.weeks,
    quadros: data.quadros,
    results: data.results,
    mediaBase: mediaBaseUrl(getSupabaseEnv().url),
    includeDrafts,
  });
}

/** Comparação em tempo constante para o token do ecrã. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** true quando o pedido traz uma sessão GMC com role admin|super_admin. */
export async function hasAdminSession(): Promise<boolean> {
  try {
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return false;
    const { data } = await session.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return data?.role === "admin" || data?.role === "super_admin";
  } catch {
    return false;
  }
}

/**
 * Acesso ao ecrã do pivot: token configurado → tem de coincidir com `?key=`; sem token → aberto.
 * Um admin com sessão também pode abrir sem chave (facilita validar a partir do back-office).
 */
export async function authorizeLiveAccess(key: string | null): Promise<{ ok: boolean; service: Db }> {
  const service = (await createServiceClient()) as unknown as Db;
  const settings = await loadSettings(service);
  const token = settings?.live_token?.trim() ?? "";
  if (!token) return { ok: true, service };
  if (key && safeEqual(key.trim(), token)) return { ok: true, service };
  if (await hasAdminSession()) return { ok: true, service };
  return { ok: false, service };
}

/** "Semana N" — N = número de semanas com data anterior + 1 (mantém o rótulo se a semana já existir). */
export async function defaultWeekLabel(sb: Db, date: string): Promise<{ label: string; exists: boolean }> {
  const existing = await sb.from("pt26_weeks").select("label").eq("date", date).maybeSingle();
  if (existing.data?.label) return { label: existing.data.label as string, exists: true };
  const { count } = await sb.from("pt26_weeks").select("id", { count: "exact", head: true }).lt("date", date);
  return { label: `Semana ${(count ?? 0) + 1}`, exists: false };
}

export async function loadImportLogs(sb: Db, limit = 50): Promise<ImportLogRow[]> {
  const { data, error } = await sb
    .from("pt26_import_logs")
    .select("id, week_id, week_date, file_name, status, report, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  fail("import logs", error);
  return (data ?? []) as unknown as ImportLogRow[];
}
