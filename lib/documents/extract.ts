export interface ExtractedPage {
  page: number;
  text: string;
}

export interface ExtractedDocument {
  text: string;
  pages: ExtractedPage[];
  charCount: number;
  pageCount: number;
  mime: string;
  filename: string;
  needsOcr: boolean;
  extractionMethod: "text" | "ocr" | "mixed";
}

const MIN_CHARS_PER_PAGE = 80;

export async function extractDocument(
  buffer: Buffer,
  filename: string,
  mime?: string
): Promise<ExtractedDocument> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const detectedMime = mime ?? guessMime(ext);

  let pages: ExtractedPage[] = [];
  let extractionMethod: ExtractedDocument["extractionMethod"] = "text";

  if (ext === "pdf") {
    pages = await extractPdf(buffer);
  } else if (ext === "docx") {
    const text = await extractDocx(buffer);
    pages = [{ page: 1, text }];
  } else if (ext === "xlsx" || ext === "xls") {
    const text = await extractExcel(buffer);
    pages = [{ page: 1, text }];
  } else if (ext === "pptx" || ext === "ppt") {
    const text = await extractPptx(buffer);
    pages = [{ page: 1, text }];
  } else if (["txt", "md", "csv", "json", "xml", "html"].includes(ext)) {
    const text = buffer.toString("utf-8");
    pages = [{ page: 1, text }];
  } else if (isImageExt(ext)) {
    const text = await ocrImage(buffer, detectedMime);
    pages = [{ page: 1, text }];
    extractionMethod = "ocr";
  } else {
    const text = buffer.toString("utf-8").slice(0, 100_000);
    pages = [{ page: 1, text }];
  }

  const fullText = pages.map((p) => p.text).join("\n\n");
  const charCount = fullText.length;
  const pageCount = pages.length;

  const needsOcr =
    extractionMethod !== "ocr" &&
    (ext === "pdf" || isImageExt(ext)) &&
    charCount < MIN_CHARS_PER_PAGE * Math.max(pageCount, 1);

  if (needsOcr && isImageExt(ext)) {
    const ocrText = await ocrImage(buffer, detectedMime);
    if (ocrText.length > charCount) {
      pages = [{ page: 1, text: ocrText }];
      extractionMethod = "ocr";
    }
  }

  const finalText = pages.map((p) => p.text).join("\n\n");

  return {
    text: finalText,
    pages,
    charCount: finalText.length,
    pageCount,
    mime: detectedMime,
    filename,
    needsOcr: needsOcr && extractionMethod !== "ocr",
    extractionMethod,
  };
}

async function extractPdf(buffer: Buffer): Promise<ExtractedPage[]> {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  const text = parsed.text ?? "";

  if (parsed.numpages <= 1) {
    return [{ page: 1, text }];
  }

  const pageTexts = text.split(/\f/);
  if (pageTexts.length > 1) {
    return pageTexts.map((t, i) => ({ page: i + 1, text: t.trim() })).filter((p) => p.text);
  }

  return [{ page: 1, text }];
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractExcel(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return `## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
  }).join("\n\n");
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const raw = buffer.toString("binary");
  const matches = raw.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
  if (!matches?.length) return "";
  return matches
    .map((m) => m.replace(/<a:t[^>]*>/, "").replace(/<\/a:t>/, ""))
    .filter(Boolean)
    .join("\n");
}

async function ocrImage(buffer: Buffer, mime: string): Promise<string> {
  const { getProvider } = await import("@lib/ai/registry");
  const provider = getProvider("claude-sonnet-4-20250514");
  const base64 = buffer.toString("base64");
  const mediaType = mime.startsWith("image/") ? mime : "image/png";

  const result = await provider.vision({
    model: "claude-3-5-haiku-20241022",
    image: { mediaType, data: base64 },
    prompt:
      "Extrai todo o texto visível nesta imagem. Se for um documento digitalizado, transcreve o conteúdo completo mantendo a estrutura (títulos, parágrafos, listas). Responde apenas com o texto extraído, sem comentários.",
    maxTokens: 4096,
  });

  return result.content.trim();
}

function isImageExt(ext: string): boolean {
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff"].includes(ext);
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}
