import type { ChatMessage, MessageContent } from "@lib/ai/types";

interface StoredAttachment {
  storage_path: string;
  filename: string;
  mime: string;
  kind: string;
}

interface StoredMessage {
  role: string;
  content: unknown;
}

/**
 * Build chat messages with multimodal content for image attachments.
 */
export async function buildChatMessages(
  history: StoredMessage[],
  supabase: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: Blob | null; error: Error | null }> } } }
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  for (const m of history) {
    const role = m.role === "tool" ? "user" : (m.role as "user" | "assistant" | "system");
    const content = m.content;

    if (typeof content === "object" && content !== null && "text" in content) {
      const stored = content as { text: string; attachments?: StoredAttachment[] };
      const attachments = stored.attachments ?? [];

      if (role === "user" && attachments.some((a) => a.kind === "image")) {
        const blocks: MessageContent[] = [];

        for (const att of attachments) {
          if (att.kind === "image") {
            const imageBlock = await loadImageBlock(supabase, att);
            if (imageBlock) blocks.push(imageBlock);
          }
        }

        blocks.push({ type: "text", text: stored.text });
        messages.push({ role, content: blocks });
        continue;
      }

      let text = stored.text;
      const nonImageAtts = attachments.filter((a) => a.kind !== "image");
      if (nonImageAtts.length > 0) {
        const attList = nonImageAtts
          .map((a) => `- ${a.filename} (${a.kind}, path: ${a.storage_path})`)
          .join("\n");
        text = `${text}\n\n[Ficheiros anexados:\n${attList}]`;
      }

      messages.push({ role, content: text });
      continue;
    }

    messages.push({
      role,
      content: typeof content === "string" ? content : String(content),
    });
  }

  return messages;
}

async function loadImageBlock(
  supabase: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: Blob | null; error: Error | null }> } } },
  att: StoredAttachment
): Promise<MessageContent | null> {
  const { data, error } = await supabase.storage.from("attachments").download(att.storage_path);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = att.mime || data.type || "image/png";

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}

/**
 * Build a system prompt suffix that informs the model about attached files.
 */
export function buildAttachmentHint(
  attachments?: StoredAttachment[]
): string | undefined {
  if (!attachments?.length) return undefined;

  const lines = attachments.map((a) => {
    if (a.kind === "image") return `- Imagem: ${a.filename} (já incluída na mensagem)`;
    return `- ${a.filename} (${a.kind}) — usa a skill read_document com storage_path="${a.storage_path}"`;
  });

  return `\n\nO utilizador anexou ficheiros:\n${lines.join("\n")}`;
}
