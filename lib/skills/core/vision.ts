import { getProvider } from "@lib/ai/registry";
import type { SkillDefinition } from "../types";

export const visionSkill: SkillDefinition = {
  key: "vision",
  name: "Vision",
  description:
    "Analyze images, screenshots, photos, or scanned documents. Supports single or multiple images. Use when the user uploads or references visual content.",
  inputSchema: {
    type: "object",
    properties: {
      storage_path: { type: "string", description: "Storage path of the image (single)" },
      storage_paths: {
        type: "array",
        items: { type: "string" },
        description: "Storage paths for multiple images",
      },
      prompt: { type: "string", description: "What to analyze in the image(s)" },
      model: { type: "string", description: "Model to use (optional)" },
    },
    required: ["prompt"],
  },
  async execute(params, ctx) {
    const prompt = String(params.prompt ?? "Describe this image in detail.");
    const model = String(params.model ?? "claude-sonnet-4-20250514");

    const paths: string[] = [];
    if (params.storage_paths && Array.isArray(params.storage_paths)) {
      paths.push(...params.storage_paths.map(String));
    } else if (params.storage_path) {
      paths.push(String(params.storage_path));
    }

    if (paths.length === 0) {
      return "No image paths provided. Provide storage_path or storage_paths.";
    }

    const provider = getProvider(model);
    const results: string[] = [];

    for (const storagePath of paths) {
      const { data, error } = await ctx.supabase.storage
        .from("attachments")
        .download(storagePath);

      if (error || !data) {
        results.push(`[${storagePath}] Failed: ${error?.message ?? "Not found"}`);
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mime = data.type || "image/png";

      const result = await provider.vision({
        model,
        image: { mediaType: mime, data: base64 },
        prompt: paths.length > 1 ? `${prompt} (imagem: ${storagePath})` : prompt,
      });

      results.push(
        paths.length > 1 ? `### ${storagePath}\n${result.content}` : result.content
      );
    }

    return results.join("\n\n---\n\n");
  },
};
