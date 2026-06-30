const FILE_ID_KEYS = new Set([
  "file_id",
  "fileId",
  "output_file_id",
  "generated_file_id",
]);

export interface FileExtractionResult {
  fileIds: string[];
  scannedBlocks: number;
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

    for (const key of FILE_ID_KEYS) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        ids.add(candidate.trim());
      }
    }

    if (record.type === "bash_code_execution_tool_result") {
      const content = record.content as Record<string, unknown> | undefined;
      if (content?.type === "bash_code_execution_result") {
        walk(content, depth + 1);
      }
    }

    if (record.type === "code_execution_tool_result") {
      walk(record.content, depth + 1);
    }

    if (record.type === "container_upload") {
      walk(record, depth + 1);
    }

    for (const nested of Object.values(record)) {
      if (nested !== record.content) walk(nested, depth + 1);
    }
  }

  walk(payload);
  return { fileIds: Array.from(ids), scannedBlocks };
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
