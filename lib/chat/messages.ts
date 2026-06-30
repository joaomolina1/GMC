import { extractDocument } from "@lib/documents/extract";
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

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: Error | null }>;
    };
  };
};

/**
 * Build chat messages with native multimodal content (images, PDFs) and
 * server-side text extraction for Office documents.
 */
export async function buildChatMessages(
  history: StoredMessage[],
  supabase: StorageClient
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  for (const m of history) {
    const role = m.role === "tool" ? "user" : (m.role as "user" | "assistant" | "system");
    const content = m.content;

    if (typeof content === "object" && content !== null && "text" in content) {
      const stored = content as { text: string; attachments?: StoredAttachment[] };
      const attachments = stored.attachments ?? [];

      if (role === "user" && attachments.length > 0) {
        const blocks = await buildAttachmentBlocks(supabase, attachments);
        blocks.push({ type: "text", text: stored.text });
        messages.push({ role, content: blocks });
        continue;
      }

      messages.push({ role, content: stored.text });
      continue;
    }

    messages.push({
      role,
      content: typeof content === "string" ? content : String(content),
    });
  }

  return messages;
}

async function buildAttachmentBlocks(
  supabase: StorageClient,
  attachments: StoredAttachment[]
): Promise<MessageContent[]> {
  const blocks: MessageContent[] = [];

  for (const att of attachments) {
    const { data, error } = await supabase.storage
      .from("attachments")
      .download(att.storage_path);

    if (error || !data) continue;

    const buffer = Buffer.from(await data.arrayBuffer());

    if (att.kind === "image" || att.mime.startsWith("image/")) {
      const mediaType = att.mime || data.type || "image/png";
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: buffer.toString("base64"),
        },
      });
      continue;
    }

    if (att.kind === "pdf" || att.mime === "application/pdf") {
      blocks.push({
        type: "document",
        title: att.filename,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      });
      continue;
    }

    try {
      const extracted = await extractDocument(buffer, att.filename, att.mime);
      if (extracted.text.trim()) {
        blocks.push({
          type: "text",
          text: `[Conteúdo do ficheiro "${att.filename}"]\n\n${extracted.text}`,
        });
      }
    } catch {
      blocks.push({
        type: "text",
        text: `[Não foi possível ler o ficheiro "${att.filename}"]`,
      });
    }
  }

  return blocks;
}
