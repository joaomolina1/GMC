import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { BetaContainerUploadBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ANTHROPIC_DOCUMENT_BETAS } from "@lib/ai/anthropic-document-skills";
import type { AgentSkillPackageRow } from "@lib/agent-skills/prompt";

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

/**
 * Upload skill extra_files to Anthropic Files API for container/code-execution access.
 */
export async function uploadSkillPackagesToContainer(
  packages: AgentSkillPackageRow[]
): Promise<{ fileIds: string[]; uploadBlocks: BetaContainerUploadBlockParam[] }> {
  if (!packages.length || !process.env.ANTHROPIC_API_KEY) {
    return { fileIds: [], uploadBlocks: [] };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const betas = [...ANTHROPIC_DOCUMENT_BETAS];
  const fileIds: string[] = [];
  const uploadBlocks: BetaContainerUploadBlockParam[] = [];
  let uploaded = 0;

  for (const pkg of packages) {
    for (const file of pkg.extra_files ?? []) {
      if (uploaded >= MAX_EXTRA_FILES) break;
      const content = file.content ?? "";
      if (!content.trim()) continue;
      const bytes = Buffer.from(content, "utf8");
      if (bytes.length > MAX_FILE_BYTES) continue;

      const path = file.path.replace(/^\/+/, "");

      try {
        const uploadFile = await toFile(bytes, path.split("/").pop() ?? "script.txt", {
          type: guessMime(path),
        });
        const meta = await client.beta.files.upload({ file: uploadFile, betas });
        if (meta.id) {
          fileIds.push(meta.id);
          uploadBlocks.push({ type: "container_upload", file_id: meta.id });
          uploaded += 1;
        }
      } catch (err) {
        console.warn("[skill-container] upload failed:", path, err);
      }
    }
  }

  return { fileIds, uploadBlocks };
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
Usa estes scripts/templates quando a skill SKILL.md os referenciar.`;
}
