import { createHash } from "crypto";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { BetaContainerUploadBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANTHROPIC_DOCUMENT_BETAS } from "@lib/ai/anthropic-document-skills";
import type { AgentSkillPackageRow, SkillExtraFile } from "@lib/agent-skills/prompt";

/** Anthropic limit: max container_upload blocks per messages request. */
const MAX_CONTAINER_SESSION_FILES = 16;
const MAX_FILE_BYTES = 256_000;

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    py: "text/x-python",
    js: "text/javascript",
    ts: "text/typescript",
    sh: "text/x-sh",
    md: "text/markdown",
    json: "application/json",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
  };
  return map[ext ?? ""] ?? "text/plain";
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function withCachedFileId(file: SkillExtraFile, fileId: string): SkillExtraFile {
  return {
    ...file,
    anthropic_file_id: fileId,
    content_hash: hashContent(file.content ?? ""),
  };
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Paths referenced in SKILL.md (templates, guides, etc.). */
function extractReferencedPaths(skillMd: string): Set<string> {
  const paths = new Set<string>();
  const patterns = [
    /`([^`]+\.(?:html|md|js|py|css|json|txt))`/gi,
    /slide-templates\/[\w.-]+\.html/gi,
    /[\w][\w./-]*\.(?:html|md|js)/g,
  ];
  for (const pattern of patterns) {
    for (const match of skillMd.matchAll(pattern)) {
      const raw = (match[1] ?? match[0]).trim();
      const path = normalizePath(raw);
      if (path.length > 0 && path.length < 160) paths.add(path);
    }
  }
  return paths;
}

function rankExtraFile(file: SkillExtraFile, skillMd: string, referenced: Set<string>): number {
  const path = normalizePath(file.path);
  let score = 0;

  if (referenced.has(path)) score += 120;
  for (const ref of referenced) {
    if (path.endsWith(ref) || ref.endsWith(path)) score += 90;
    if (path.includes(ref) || ref.includes(path)) score += 70;
  }

  if (/pptxgenjs\.md$/i.test(path)) score += 100;
  if (/SKILL\.md$/i.test(path)) score += 95;
  if (path.startsWith("slide-templates/")) score += 40;
  if (path.endsWith(".html")) score += 25;
  if (path.endsWith(".md")) score += 15;

  // Prefer smaller files when scores tie — more likely to fit under byte limit.
  const bytes = Buffer.byteLength(file.content ?? "", "utf8");
  score -= Math.min(20, Math.floor(bytes / 10_000));

  return score;
}

interface RankedFile {
  pkg: AgentSkillPackageRow;
  file: SkillExtraFile;
  score: number;
}

function selectFilesForContainer(packages: AgentSkillPackageRow[]): {
  selected: RankedFile[];
  skipped: number;
} {
  const ranked: RankedFile[] = [];

  for (const pkg of packages) {
    const referenced = extractReferencedPaths(pkg.skill_md ?? "");
    for (const file of pkg.extra_files ?? []) {
      const content = file.content ?? "";
      if (!content.trim()) continue;
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) continue;
      ranked.push({
        pkg,
        file,
        score: rankExtraFile(file, pkg.skill_md ?? "", referenced),
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, MAX_CONTAINER_SESSION_FILES);
  return { selected, skipped: Math.max(0, ranked.length - selected.length) };
}

/**
 * Upload skill extra_files to Anthropic Files API for container/code-execution access.
 * Reuses cached anthropic_file_id when content hash is unchanged.
 * Respects Anthropic's 16-file-per-session limit with priority selection.
 */
export async function uploadSkillPackagesToContainer(
  packages: AgentSkillPackageRow[]
): Promise<{
  fileIds: string[];
  uploadBlocks: BetaContainerUploadBlockParam[];
  updatedPackages: AgentSkillPackageRow[];
  uploadedPaths: string[];
  skippedCount: number;
}> {
  if (!packages.length || !process.env.ANTHROPIC_API_KEY) {
    return {
      fileIds: [],
      uploadBlocks: [],
      updatedPackages: packages,
      uploadedPaths: [],
      skippedCount: 0,
    };
  }

  const { selected, skipped } = selectFilesForContainer(packages);
  if (selected.length === 0) {
    return {
      fileIds: [],
      uploadBlocks: [],
      updatedPackages: packages,
      uploadedPaths: [],
      skippedCount: skipped,
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const betas = [...ANTHROPIC_DOCUMENT_BETAS];
  const fileIds: string[] = [];
  const uploadBlocks: BetaContainerUploadBlockParam[] = [];
  const uploadedPaths: string[] = [];

  const updatesByPackage = new Map<string, Map<string, SkillExtraFile>>();
  for (const pkg of packages) {
    updatesByPackage.set(pkg.id, new Map());
  }

  for (const { pkg, file } of selected) {
    const content = file.content ?? "";
    const currentHash = hashContent(content);
    const path = normalizePath(file.path);
    const pkgUpdates = updatesByPackage.get(pkg.id)!;

    if (file.anthropic_file_id && file.content_hash === currentHash) {
      fileIds.push(file.anthropic_file_id);
      uploadBlocks.push({ type: "container_upload", file_id: file.anthropic_file_id });
      uploadedPaths.push(path);
      pkgUpdates.set(path, file);
      continue;
    }

    try {
      const bytes = Buffer.from(content, "utf8");
      const uploadFile = await toFile(bytes, path.split("/").pop() ?? "script.txt", {
        type: guessMime(path),
      });
      const meta = await client.beta.files.upload({ file: uploadFile, betas });
      if (meta.id) {
        fileIds.push(meta.id);
        uploadBlocks.push({ type: "container_upload", file_id: meta.id });
        uploadedPaths.push(path);
        pkgUpdates.set(path, withCachedFileId(file, meta.id));
      }
    } catch (err) {
      console.warn("[skill-container] upload failed:", path, err);
    }
  }

  const updatedPackages = packages.map((pkg) => {
    const pkgUpdates = updatesByPackage.get(pkg.id);
    if (!pkgUpdates?.size) return pkg;
    const nextExtraFiles = (pkg.extra_files ?? []).map((file) => {
      const path = normalizePath(file.path);
      return pkgUpdates.get(path) ?? file;
    });
    return { ...pkg, extra_files: nextExtraFiles };
  });

  return {
    fileIds,
    uploadBlocks,
    updatedPackages,
    uploadedPaths,
    skippedCount: skipped,
  };
}

/** Persist cached Anthropic file IDs back to skill packages (best-effort). */
export async function persistSkillPackageFileCache(
  supabase: SupabaseClient,
  packages: AgentSkillPackageRow[]
): Promise<void> {
  await Promise.all(
    packages.map(async (pkg) => {
      if (!pkg.extra_files?.length) return;
      const { error } = await supabase
        .from("agent_skill_packages")
        .update({ extra_files: pkg.extra_files })
        .eq("id", pkg.id);
      if (error) {
        console.warn("[skill-container] cache persist failed:", pkg.id, error.message);
      }
    })
  );
}

export function buildSkillContainerHint(uploadedPaths: string[], skippedCount = 0): string {
  if (!uploadedPaths.length) return "";

  const lines = uploadedPaths.map((p) => `- ${p}`).join("\n");
  const skipNote =
    skippedCount > 0
      ? `\n\nNota: ${skippedCount} ficheiro(s) extra da skill não foram carregados no sandbox (limite Anthropic: ${MAX_CONTAINER_SESSION_FILES} por sessão). Usa os templates referenciados no SKILL.md e os ficheiros listados acima.`
      : "";

  return `

## Ficheiros de skill no container
Os seguintes ficheiros estão disponíveis no sandbox de code execution (directório de input):
${lines}
Usa estes scripts/templates quando a skill SKILL.md os referenciar.
Quando exportares PPTX/PDF/etc., grava sempre em \`/mnt/user-data/outputs/\` com nome claro (ex: apresentacao.pptx).${skipNote}`;
}
