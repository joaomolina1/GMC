import { createHash } from "crypto";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { BetaContainerUploadBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANTHROPIC_DOCUMENT_BETAS } from "@lib/ai/anthropic-document-skills";
import type { AgentSkillPackageRow, SkillExtraFile } from "@lib/agent-skills/prompt";

const MAX_EXTRA_FILES = 20;
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

/**
 * Upload skill extra_files to Anthropic Files API for container/code-execution access.
 * Reuses cached anthropic_file_id when content hash is unchanged.
 */
export async function uploadSkillPackagesToContainer(
  packages: AgentSkillPackageRow[]
): Promise<{
  fileIds: string[];
  uploadBlocks: BetaContainerUploadBlockParam[];
  updatedPackages: AgentSkillPackageRow[];
}> {
  if (!packages.length || !process.env.ANTHROPIC_API_KEY) {
    return { fileIds: [], uploadBlocks: [], updatedPackages: packages };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const betas = [...ANTHROPIC_DOCUMENT_BETAS];
  const fileIds: string[] = [];
  const uploadBlocks: BetaContainerUploadBlockParam[] = [];
  const updatedPackages: AgentSkillPackageRow[] = [];
  let uploaded = 0;

  for (const pkg of packages) {
    const nextExtraFiles: SkillExtraFile[] = [];

    for (const file of pkg.extra_files ?? []) {
      if (uploaded >= MAX_EXTRA_FILES) {
        nextExtraFiles.push(file);
        continue;
      }

      const content = file.content ?? "";
      if (!content.trim()) {
        nextExtraFiles.push(file);
        continue;
      }

      const bytes = Buffer.from(content, "utf8");
      if (bytes.length > MAX_FILE_BYTES) {
        nextExtraFiles.push(file);
        continue;
      }

      const currentHash = hashContent(content);
      if (file.anthropic_file_id && file.content_hash === currentHash) {
        fileIds.push(file.anthropic_file_id);
        uploadBlocks.push({ type: "container_upload", file_id: file.anthropic_file_id });
        nextExtraFiles.push(file);
        uploaded += 1;
        continue;
      }

      const path = file.path.replace(/^\/+/, "");

      try {
        const uploadFile = await toFile(bytes, path.split("/").pop() ?? "script.txt", {
          type: guessMime(path),
        });
        const meta = await client.beta.files.upload({ file: uploadFile, betas });
        if (meta.id) {
          fileIds.push(meta.id);
          uploadBlocks.push({ type: "container_upload", file_id: meta.id });
          nextExtraFiles.push(withCachedFileId(file, meta.id));
          uploaded += 1;
          continue;
        }
      } catch (err) {
        console.warn("[skill-container] upload failed:", path, err);
      }

      nextExtraFiles.push(file);
    }

    updatedPackages.push({ ...pkg, extra_files: nextExtraFiles });
  }

  return { fileIds, uploadBlocks, updatedPackages };
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

export function buildSkillContainerHint(packages: AgentSkillPackageRow[]): string {
  const withExtras = packages.filter((p) => (p.extra_files?.length ?? 0) > 0);
  if (!withExtras.length) return "";

  const paths = withExtras.flatMap((p) =>
    (p.extra_files ?? []).map((f) => f.path.replace(/^\/+/, ""))
  );

  return `

## Ficheiros de skill no container
Os seguintes ficheiros estão disponíveis no sandbox de code execution (directório de input):
${paths.map((p) => `- ${p}`).join("\n")}
Usa estes scripts/templates quando a skill SKILL.md os referenciar.
Quando exportares PPTX/PDF/etc., grava sempre em \`/mnt/user-data/outputs/\` com nome claro (ex: apresentacao.pptx).`;
}
