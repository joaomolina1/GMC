import JSZip from "jszip";

export interface ParsedSkillPackage {
  name: string;
  description: string;
  skillMd: string;
  extraFiles: Array<{ path: string; content: string }>;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

export function parseSkillMd(content: string): ParsedSkillPackage {
  const { meta, body } = parseFrontmatter(content);
  const name = meta.name?.trim();
  const description = meta.description?.trim();

  if (!name) {
    throw new Error("SKILL.md sem campo 'name' no frontmatter YAML");
  }
  if (!description) {
    throw new Error("SKILL.md sem campo 'description' no frontmatter YAML");
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error("O campo 'name' deve ser kebab-case (letras minúsculas, números e hífens)");
  }
  if (description.length > 1024) {
    throw new Error("A descrição não pode exceder 1024 caracteres");
  }

  return {
    name,
    description,
    skillMd: content.trim(),
    extraFiles: [],
  };
}

const TEXT_EXTENSIONS = new Set([
  "md",
  "txt",
  "json",
  "yaml",
  "yml",
  "py",
  "sh",
  "js",
  "ts",
  "css",
  "html",
  "xml",
  "csv",
]);

async function extractFromZip(buffer: Buffer): Promise<ParsedSkillPackage> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files).filter((p) => !zip.files[p].dir);

  const skillEntry = entries.find((p) => /(^|\/)SKILL\.md$/i.test(p));
  if (!skillEntry) {
    throw new Error("Pacote inválido: não foi encontrado SKILL.md");
  }

  const skillContent = await zip.files[skillEntry].async("string");
  const parsed = parseSkillMd(skillContent);

  const extraFiles: Array<{ path: string; content: string }> = [];
  for (const path of entries) {
    if (path === skillEntry) continue;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const content = await zip.files[path].async("string");
    if (content.length > 100_000) continue;
    extraFiles.push({ path, content });
  }

  return { ...parsed, extraFiles };
}

export async function parseSkillUpload(
  buffer: Buffer,
  filename: string
): Promise<ParsedSkillPackage> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md")) {
    return parseSkillMd(buffer.toString("utf-8"));
  }
  if (lower.endsWith(".zip") || lower.endsWith(".skill")) {
    return extractFromZip(buffer);
  }
  throw new Error("Formato não suportado. Use .skill, .zip ou SKILL.md");
}
