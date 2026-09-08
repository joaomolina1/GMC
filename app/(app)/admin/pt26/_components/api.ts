import type { PartyRow, PersonRow, QuestionRow, SettingsRow } from "@lib/pt26/types";

export interface Reference {
  parties: PartyRow[];
  people: PersonRow[];
  questions: QuestionRow[];
  settings: SettingsRow;
  mediaBase: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; ok?: boolean };
  if (!res.ok || json.ok === false) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

export const KIND_LABEL: Record<string, string> = {
  PARTY: "Partidos",
  APPROVAL: "Aprovação",
  YESNO: "Sim / Não",
  MINISTER: "Por ministro",
  RANKING: "Ranking",
  PM: "Primeiro-Ministro",
  MINISTER_PERSON: "Ministro/a",
  LEADER: "Líder partidário",
  OTHER: "Outro",
};

export const PERSON_KIND_LABEL: Record<string, string> = {
  PM: "Primeiro-Ministro",
  MINISTER: "Ministro/a",
  LEADER: "Líder partidário",
  OTHER: "Outro",
};

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

export function personPhotoUrl(mediaBase: string, person: Pick<PersonRow, "photo_path">, size: 256 | 800 = 256): string | null {
  return person.photo_path ? `${mediaBase}/${person.photo_path}-${size}.webp` : null;
}

export function partyLogoUrl(mediaBase: string, party: Pick<PartyRow, "logo_path">): string | null {
  return party.logo_path ? `${mediaBase}/${party.logo_path}` : null;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 2 && w[0] === w[0].toUpperCase());
  return ((words[0]?.[0] ?? name[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
