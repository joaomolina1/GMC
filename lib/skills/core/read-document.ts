import type { SkillDefinition } from "../types";
import { extractDocument } from "@lib/documents/extract";

export const readDocumentSkill: SkillDefinition = {
  key: "read_document",
  name: "Read Document",
  description:
    "Extract and read text content from uploaded documents (PDF, Word, Excel, PowerPoint, CSV, TXT, Markdown, images via OCR).",
  inputSchema: {
    type: "object",
    properties: {
      storage_path: { type: "string", description: "Storage path of the document" },
      filename: { type: "string", description: "Original filename" },
    },
    required: ["storage_path"],
  },
  async execute(params, ctx) {
    const storagePath = String(params.storage_path);
    const filename = String(params.filename ?? storagePath);

    const { data, error } = await ctx.supabase.storage
      .from("attachments")
      .download(storagePath);

    if (error || !data) {
      return `Failed to download document: ${error?.message ?? "Not found"}`;
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    try {
      const doc = await extractDocument(buffer, filename, data.type);
      const ocrNote = doc.extractionMethod === "ocr" ? "\n[Texto extraído via OCR]" : "";
      const warning = doc.needsOcr
        ? "\n[Aviso: documento pode ser digitalizado — texto limitado. Considere carregar como imagem para OCR completo.]"
        : "";

      return `Document: ${filename} (${doc.charCount} chars, ${doc.pageCount} pág.)${ocrNote}${warning}\n\n${doc.text.slice(0, 50_000)}`;
    } catch (err) {
      return `Error reading document: ${err instanceof Error ? err.message : "Unknown"}`;
    }
  },
};
