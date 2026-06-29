export interface TextChunk {
  content: string;
  metadata: {
    chunk_index: number;
    char_start: number;
    char_end: number;
    page?: number;
    section?: string;
    filename?: string;
    mime?: string;
  };
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
  filename?: string;
  mime?: string;
  pages?: Array<{ page: number; text: string }>;
}

/**
 * Paragraph-aware chunking that respects sentence boundaries.
 * Falls back to character-based splitting for very long paragraphs.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 800;
  const overlap = options.overlap ?? 150;
  const filename = options.filename;
  const mime = options.mime;

  if (options.pages && options.pages.length > 0) {
    const chunks: TextChunk[] = [];
    let globalIndex = 0;
    for (const { page, text: pageText } of options.pages) {
      const pageChunks = chunkPlainText(pageText, chunkSize, overlap, {
        filename,
        mime,
        page,
        startIndex: globalIndex,
      });
      chunks.push(...pageChunks);
      globalIndex += pageChunks.length;
    }
    return chunks;
  }

  return chunkPlainText(text, chunkSize, overlap, { filename, mime, startIndex: 0 });
}

function chunkPlainText(
  text: string,
  chunkSize: number,
  overlap: number,
  ctx: { filename?: string; mime?: string; page?: number; startIndex: number }
): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: TextChunk[] = [];
  let buffer = "";
  let charStart = 0;
  let chunkIndex = ctx.startIndex;

  function flush(endPos: number) {
    const content = buffer.trim();
    if (!content) return;
    chunks.push({
      content,
      metadata: {
        chunk_index: chunkIndex++,
        char_start: charStart,
        char_end: endPos,
        page: ctx.page,
        filename: ctx.filename,
        mime: ctx.mime,
      },
    });
    buffer = "";
    charStart = Math.max(0, endPos - overlap);
  }

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length + 2 <= chunkSize) {
      buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
      continue;
    }

    if (buffer) {
      flush(charStart + buffer.length);
      const tail = chunks.length > 0 ? chunks[chunks.length - 1].content.slice(-overlap) : "";
      buffer = tail ? `${tail}\n\n${trimmed}` : trimmed;
      charStart = charStart + (chunks[chunks.length - 1]?.content.length ?? 0) - overlap;
    } else {
      buffer = trimmed;
    }

    while (buffer.length > chunkSize) {
      const splitAt = findSplitPoint(buffer, chunkSize);
      const piece = buffer.slice(0, splitAt).trim();
      if (piece) {
        chunks.push({
          content: piece,
          metadata: {
            chunk_index: chunkIndex++,
            char_start: charStart,
            char_end: charStart + splitAt,
            page: ctx.page,
            filename: ctx.filename,
            mime: ctx.mime,
          },
        });
      }
      charStart += splitAt - overlap;
      buffer = buffer.slice(Math.max(0, splitAt - overlap)).trim();
    }
  }

  if (buffer.trim()) {
    chunks.push({
      content: buffer.trim(),
      metadata: {
        chunk_index: chunkIndex,
        char_start: charStart,
        char_end: charStart + buffer.length,
        page: ctx.page,
        filename: ctx.filename,
        mime: ctx.mime,
      },
    });
  }

  return chunks;
}

function findSplitPoint(text: string, maxLen: number): number {
  const window = text.slice(0, maxLen);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf(".\n"),
    window.lastIndexOf("! "),
    window.lastIndexOf("? ")
  );
  if (sentenceEnd > maxLen * 0.5) return sentenceEnd + 1;

  const wordEnd = window.lastIndexOf(" ");
  if (wordEnd > maxLen * 0.5) return wordEnd;

  return maxLen;
}
