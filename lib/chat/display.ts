export function extractMessageText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null) {
    const obj = content as { text?: string; attachments?: Array<{ filename?: string }> };
    if (typeof obj.text === "string") {
      const attNote =
        obj.attachments && obj.attachments.length > 0
          ? `\n[${obj.attachments.length} anexo(s): ${obj.attachments.map((a) => a.filename ?? "ficheiro").join(", ")}]`
          : "";
      return obj.text + attNote;
    }
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }
  return String(content);
}
