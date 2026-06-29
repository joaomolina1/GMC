import { extractDocument } from "./extract";

export interface OcrResult {
  text: string;
  method: "vision" | "text-layer";
  confidence: "high" | "low";
}

/**
 * Run OCR on a document buffer. For images, always uses Claude vision.
 * For PDFs with insufficient text layer, flags for manual re-processing.
 */
export async function runOcr(
  buffer: Buffer,
  filename: string,
  mime?: string
): Promise<OcrResult> {
  const doc = await extractDocument(buffer, filename, mime);

  if (doc.extractionMethod === "ocr") {
    return { text: doc.text, method: "vision", confidence: doc.charCount > 50 ? "high" : "low" };
  }

  if (doc.needsOcr) {
    return {
      text: doc.text,
      method: "text-layer",
      confidence: "low",
    };
  }

  return { text: doc.text, method: "text-layer", confidence: "high" };
}

export { extractDocument };
