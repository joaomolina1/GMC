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

interface StoredGeneratedFile {
  filename: string;
  mime: string;
  storage_path?: string;
  download_url?: string;
}

function formatGeneratedFilesContext(files: StoredGeneratedFile[] | undefined): string {
  if (!files?.length) return "";
  const lines = files.map((file) => {
    const link = file.download_url ? ` (${file.download_url})` : "";
    return `- ${file.filename} [${file.mime}]${link}`;
  });
  return `\n\n[Ficheiros gerados pelo assistente]\n${lines.join("\n")}`;
}

/**
 * Build chat messages with native multimodal content (images, PDFs) and
 * server-side text extraction for Office documents.
 */
export async function buildChatMessages(
  history: StoredMessage[],
  supabase: StorageClient
): Promise<ChatMessage[]> {
  return Promise.all(history.map(async (m): Promise<ChatMessage> => {
    const role = m.role === "tool" ? "user" : (m.role as "user" | "assistant" | "system");
    const content = m.content;

    if (typeof content === "object" && content !== null && "text" in content) {
      const stored = content as {
        text: string;
        attachments?: StoredAttachment[];
        generated_files?: StoredGeneratedFile[];
      };

      if (role === "assistant") {
        const text = `${stored.text}${formatGeneratedFilesContext(stored.generated_files)}`;
        return { role, content: text };
      }

      const attachments = stored.attachments ?? [];

      if (role === "user" && attachments.length > 0) {
        const blocks = await buildAttachmentBlocks(supabase, attachments);
        blocks.push({ type: "text", text: stored.text });
        return { role, content: blocks };
      }

      return { role, content: stored.text };
    }

    return {
      role,
      content: typeof content === "string" ? content : String(content),
    };
  }));
}

async function buildAttachmentBlocks(
  supabase: StorageClient,
  attachments: StoredAttachment[]
): Promise<MessageContent[]> {
  const results = await Promise.all(attachments.map(async (att): Promise<MessageContent | null> => {
    const { data, error } = await supabase.storage
      .from("attachments")
      .download(att.storage_path);

    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());

    if (att.kind === "image" || att.mime.startsWith("image/")) {
      const mediaType = att.mime || data.type || "image/png";
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: buffer.toString("base64"),
        },
      };
    }

    if (att.kind === "pdf" || att.mime === "application/pdf") {
      return {
        type: "document",
        title: att.filename,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      };
    }

    try {
      const extracted = await extractDocument(buffer, att.filename, att.mime);
      if (extracted.text.trim()) {
        return {
          type: "text",
          text: `[Conteúdo do ficheiro "${att.filename}"]\n\n${extracted.text}`,
        };
      }
    } catch {
      return {
        type: "text",
        text: `[Não foi possível ler o ficheiro "${att.filename}"]`,
      };
    }
    return null;
  }));

  return results.filter((block): block is MessageContent => block !== null);
}
