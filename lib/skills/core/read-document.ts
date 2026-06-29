import type { SkillDefinition } from "../types";

export const readDocumentSkill: SkillDefinition = {
  key: "read_document",
  name: "Read Document",
  description:
    "Extract and read text content from uploaded documents (PDF, Word, Excel, CSV, TXT, Markdown).",
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
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";

    try {
      if (ext === "pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        return `Document: ${filename}\n\n${parsed.text.slice(0, 50000)}`;
      }
      if (ext === "docx") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        return `Document: ${filename}\n\n${result.value.slice(0, 50000)}`;
      }
      if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheets = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          return `## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
        });
        return `Document: ${filename}\n\n${sheets.join("\n\n").slice(0, 50000)}`;
      }
      if (["txt", "md", "json", "xml", "html"].includes(ext)) {
        return `Document: ${filename}\n\n${buffer.toString("utf-8").slice(0, 50000)}`;
      }
      return `Unsupported file type: .${ext}. Supported: pdf, docx, xlsx, csv, txt, md`;
    } catch (err) {
      return `Error reading document: ${err instanceof Error ? err.message : "Unknown"}`;
    }
  },
};
