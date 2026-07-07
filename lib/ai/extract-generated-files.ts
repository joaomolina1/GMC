const FILE_ID_KEYS = new Set([
  "file_id",
  "fileId",
  "output_file_id",
  "generated_file_id",
]);

const FILE_ID_PATTERN = /^file_[a-zA-Z0-9_-]+$/;

export interface FileExtractionResult {
  fileIds: string[];
  scannedBlocks: number;
}

function addFileId(ids: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed && FILE_ID_PATTERN.test(trimmed)) {
    ids.add(trimmed);
  }
}

/** Anthropic puts created files in bash_code_execution_result.content[].file_id */
function extractFromBashExecutionResult(result: Record<string, unknown>, ids: Set<string>): void {
  const outputs = result.content;
  if (!Array.isArray(outputs)) return;
  for (const item of outputs) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    addFileId(ids, row.file_id);
    addFileId(ids, row.fileId);
  }
}

export function extractFileIdsFromPayload(payload: unknown): string[] {
  return extractFileIdsDetailed(payload).fileIds;
}

export function extractFileIdsDetailed(payload: unknown): FileExtractionResult {
  const ids = new Set<string>();
  let scannedBlocks = 0;

  function walk(value: unknown, depth = 0): void {
    if (value == null || depth > 24) return;

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }

    if (typeof value !== "object") return;
    scannedBlocks += 1;

    const record = value as Record<string, unknown>;

    if (record.type === "bash_code_execution_result") {
      extractFromBashExecutionResult(record, ids);
      const stdout = record.stdout;
      if (typeof stdout === "string") {
        for (const match of stdout.matchAll(/file_[a-zA-Z0-9_-]+/g)) {
          ids.add(match[0]);
        }
      }
    }

    if (record.type === "bash_code_execution_tool_result") {
      const content = record.content;
      if (content && typeof content === "object") {
        const inner = content as Record<string, unknown>;
        if (inner.type === "bash_code_execution_result") {
          extractFromBashExecutionResult(inner, ids);
        }
        walk(inner, depth + 1);
      }
    }

    for (const key of FILE_ID_KEYS) {
      addFileId(ids, record[key]);
    }

    if (record.type === "code_execution_tool_result") {
      walk(record.content, depth + 1);
    }

    for (const nested of Object.values(record)) {
      if (nested !== record.content) walk(nested, depth + 1);
    }
  }

  walk(payload);
  return { fileIds: Array.from(ids), scannedBlocks };
}

/** User-facing text claims a file exists but we have no attachments. */
export function messageClaimsDownloadableFiles(text: string): boolean {
  return (
    /dispon[ií]ve(?:is|l)\s+para\s+download/i.test(text) ||
    /ficheiros?\s+dispon[ií]ve/i.test(text) ||
    /pronto[s]?\s+para\s+download/i.test(text) ||
    /(?:^|\n)\s*[-*]\s*[`']?[\w.-]+\.(?:pptx|xlsx|docx|pdf|html|md)/im.test(text)
  );
}

export function logMissingFileIds(context: string, payload: unknown, content: string): void {
  const { fileIds, scannedBlocks } = extractFileIdsDetailed(payload);
  if (fileIds.length > 0) return;

  const claimsFile =
    /criei|gerado|download|ficheiro|\.pptx|\.xlsx|\.docx|\.pdf/i.test(content);
  if (!claimsFile) return;

  console.warn(
    `[extract-generated-files] ${context}: modelo referiu ficheiro mas nenhum file_id capturado (blocos=${scannedBlocks})`
  );
}
