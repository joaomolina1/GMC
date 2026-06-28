import { getProvider } from "@lib/ai/registry";
import type { SkillDefinition } from "../types";

export const visionSkill: SkillDefinition = {
  key: "vision",
  name: "Vision",
  description:
    "Analyze images, screenshots, or photos. Use when the user uploads or references an image.",
  inputSchema: {
    type: "object",
    properties: {
      storage_path: { type: "string", description: "Storage path of the image" },
      prompt: { type: "string", description: "What to analyze in the image" },
      model: { type: "string", description: "Model to use (optional)" },
    },
    required: ["storage_path", "prompt"],
  },
  async execute(params, ctx) {
    const storagePath = String(params.storage_path);
    const prompt = String(params.prompt ?? "Describe this image in detail.");
    const model = String(params.model ?? "claude-sonnet-4-20250514");

    const { data, error } = await ctx.supabase.storage
      .from("attachments")
      .download(storagePath);

    if (error || !data) {
      return `Failed to download image: ${error?.message ?? "Not found"}`;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mime = data.type || "image/png";

    const provider = getProvider(model);
    const result = await provider.vision({
      model,
      image: { mediaType: mime, data: base64 },
      prompt,
    });

    return result.content;
  },
};
