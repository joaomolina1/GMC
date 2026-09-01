import type { AgentSkillPackageRow } from "@lib/agent-skills/prompt";

export interface CustomContainerSkill {
  type: "custom";
  skill_id: string;
  version: string;
}

export interface SkillUploadFile {
  path: string;
  content: string;
  mime?: string;
}

export interface CreateCustomSkillResult {
  skillId: string | null;
  error?: string;
}

const SKILLS_API = "https://api.anthropic.com/v1/skills";
const ANTHROPIC_VERSION = "2023-06-01";

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    md: "text/markdown",
    py: "text/x-python",
    js: "text/javascript",
    ts: "text/typescript",
    sh: "text/x-sh",
    json: "application/json",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "application/xml",
    csv: "text/csv",
  };
  return map[ext ?? ""] ?? "text/plain";
}

/**
 * Files for POST /v1/skills — same top-level directory, SKILL.md at that root.
 * Anthropic mounts this directory as the skill package.
 */
export function filesForAnthropicSkillCreate(options: {
  name: string;
  skillMd: string;
  extraFiles?: Array<{ path: string; content: string }>;
}): SkillUploadFile[] {
  const root = options.name.replace(/[^a-z0-9-]/g, "-") || "skill";
  const files: SkillUploadFile[] = [
    { path: `${root}/SKILL.md`, content: options.skillMd, mime: "text/markdown" },
  ];

  const seen = new Set(["skill.md"]);
  for (const extra of options.extraFiles ?? []) {
    const relative = extra.path.replace(/^\/+/, "").replace(/\\/g, "/");
    if (!relative || relative.includes("..") || /(^|\/)SKILL\.md$/i.test(relative)) continue;
    const key = relative.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!extra.content?.trim()) continue;
    files.push({
      path: `${root}/${relative}`,
      content: extra.content,
      mime: guessMime(relative),
    });
  }

  return files;
}

export function buildCustomContainerSkills(
  packages: Array<{ anthropic_skill_id?: string | null }>
): CustomContainerSkill[] {
  const skills: CustomContainerSkill[] = [];
  const seen = new Set<string>();
  for (const pkg of packages) {
    const id = pkg.anthropic_skill_id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    skills.push({ type: "custom", skill_id: id, version: "latest" });
  }
  return skills;
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

export async function createAnthropicCustomSkill(
  options: {
    name: string;
    skillMd: string;
    extraFiles?: Array<{ path: string; content: string }>;
    displayTitle?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<CreateCustomSkillResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { skillId: null, error: "ANTHROPIC_API_KEY em falta" };
  }

  const files = filesForAnthropicSkillCreate(options);
  const form = new FormData();
  const title = (options.displayTitle ?? options.name).slice(0, 255);
  if (title) form.append("display_title", title);

  for (const file of files) {
    const blob = new Blob([file.content], { type: file.mime ?? "text/plain" });
    form.append("files", blob, file.path);
  }

  try {
    const res = await fetchImpl(SKILLS_API, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
      message?: string;
    };
    if (!res.ok || !body.id) {
      const message =
        body.error?.message ?? body.message ?? `Skills API ${res.status}`;
      return { skillId: null, error: message };
    }
    return { skillId: body.id };
  } catch (err) {
    return {
      skillId: null,
      error: err instanceof Error ? err.message : "Falha ao criar skill na Anthropic",
    };
  }
}

export async function deleteAnthropicCustomSkill(
  skillId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || !skillId) return;

  try {
    await fetchImpl(`${SKILLS_API}/${encodeURIComponent(skillId)}`, {
      method: "DELETE",
      headers: anthropicHeaders(apiKey),
    });
  } catch (err) {
    console.warn("[skills] failed to delete Anthropic skill", skillId, err);
  }
}

export function packagesMissingAnthropicId(
  packages: AgentSkillPackageRow[]
): AgentSkillPackageRow[] {
  return packages.filter((pkg) => !pkg.anthropic_skill_id?.trim());
}

export async function ensureAnthropicSkillIds(
  packages: AgentSkillPackageRow[],
  persist?: (pkg: AgentSkillPackageRow) => Promise<void>
): Promise<AgentSkillPackageRow[]> {
  const next = [...packages];
  for (let i = 0; i < next.length; i++) {
    const pkg = next[i];
    if (pkg.anthropic_skill_id?.trim()) continue;
    const created = await createAnthropicCustomSkill({
      name: pkg.name,
      skillMd: pkg.skill_md,
      extraFiles: pkg.extra_files,
      displayTitle: pkg.name,
    });
    if (!created.skillId) {
      console.warn("[skills] Anthropic register failed:", pkg.name, created.error);
      continue;
    }
    const updated = { ...pkg, anthropic_skill_id: created.skillId };
    next[i] = updated;
    if (persist) {
      try {
        await persist(updated);
      } catch (err) {
        console.warn("[skills] persist anthropic_skill_id failed:", pkg.id, err);
      }
    }
  }
  return next;
}
