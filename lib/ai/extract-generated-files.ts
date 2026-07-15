const FILE_ID_KEYS = new Set([
  "file_id",
  "fileId",
  "output_file_id",
  "generated_file_id",
]);

const FILE_ID_PATTERN = /^file_[a-zA-Z0-9_-]+$/;

/** Result types that carry created files in `.content[].file_id`. */
const CODE_EXECUTION_RESULT_TYPES = new Set([
  "bash_code_execution_result",
  "code_execution_result",
  // Present when web search (or other server tools) encrypt stdout — still has file_id outputs.
  "encrypted_code_execution_result",
]);

const CODE_EXECUTION_TOOL_RESULT_TYPES = new Set([
  "bash_code_execution_tool_result",
  "code_execution_tool_result",
]);

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

/** Anthropic puts created files in *_code_execution_result.content[].file_id */
function extractFromCodeExecutionResult(result: Record<string, unknown>, ids: Set<string>): void {
  const outputs = result.content;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      addFileId(ids, row.file_id);
      addFileId(ids, row.fileId);
    }
  }
  for (const key of ["stdout", "encrypted_stdout"] as const) {
    const stdout = result[key];
    if (typeof stdout !== "string") continue;
    for (const match of stdout.matchAll(/file_[a-zA-Z0-9_-]+/g)) {
      ids.add(match[0]);
    }
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
    const type = typeof record.type === "string" ? record.type : "";

    if (CODE_EXECUTION_RESULT_TYPES.has(type)) {
      extractFromCodeExecutionResult(record, ids);
    }

    if (CODE_EXECUTION_TOOL_RESULT_TYPES.has(type)) {
      const content = record.content;
      if (content && typeof content === "object" && !Array.isArray(content)) {
        const inner = content as Record<string, unknown>;
        if (typeof inner.type === "string" && CODE_EXECUTION_RESULT_TYPES.has(inner.type)) {
          extractFromCodeExecutionResult(inner, ids);
        }
      }
    }

    for (const key of FILE_ID_KEYS) {
      addFileId(ids, record[key]);
    }

    // Walk every nested value, including `content` — required for encrypted results
    // and nested tool outputs that the special-case handlers may not fully cover.
    for (const nested of Object.values(record)) {
      walk(nested, depth + 1);
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
    /bot[oõ]es?\s+verdes?/i.test(text) ||
    /descarregar\s+os\s+ficheiros/i.test(text) ||
    /(?:^|\n)\s*[-*✅]\s*[*`']?[\w.-]+\.(?:pptx|xlsx|docx|pdf|html|md)/im.test(text) ||
    /✅\s*\*?\*?[\w.-]+\.(?:pptx|xlsx|docx|pdf|html|md)/i.test(text) ||
    /criei\s+(?:o\s+|um\s+|a\s+)?(?:ficheiro|documento|apresenta[çc][ãa]o|pptx|powerpoint)/i.test(
      text
    ) ||
    /(?:ficheiro|documento|apresenta[çc][ãa]o)\s+(?:foi\s+)?(?:criad[oa]|gerad[oa]|produzid[oa])/i.test(
      text
    ) ||
    /\b[\w.-]+\.(?:pptx|xlsx|docx|pdf)\b/i.test(text)
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
