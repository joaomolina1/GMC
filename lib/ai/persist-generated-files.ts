import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANTHROPIC_DOCUMENT_BETAS } from "./anthropic-document-skills";

export interface PersistedGeneratedFile {
  file_id: string;
  filename: string;
  mime: string;
  size: number;
  storage_path: string;
  download_url: string;
}

function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "documento";
}

export async function persistAnthropicGeneratedFiles(options: {
  fileIds: string[];
  userId: string;
  supabase: SupabaseClient;
}): Promise<PersistedGeneratedFile[]> {
  const { fileIds, userId, supabase } = options;
  if (!fileIds.length) return [];

  const client = getAnthropicClient();
  const betas = [...ANTHROPIC_DOCUMENT_BETAS];
  const results: PersistedGeneratedFile[] = [];

  for (const fileId of fileIds) {
    try {
      const meta = await client.beta.files.retrieveMetadata(fileId, { betas });
      const response = await client.beta.files.download(fileId, { betas });
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = sanitizeFilename(meta.filename || `ficheiro-${fileId.slice(0, 8)}`);
      const storagePath = `${userId}/generated/${Date.now()}-${filename}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, buffer, {
          contentType: meta.mime_type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        console.warn("[generated-files] upload failed:", uploadError.message);
        continue;
      }

      const { data: signed, error: signError } = await supabase.storage
        .from("attachments")
        .createSignedUrl(storagePath, 60 * 60 * 24);

      if (signError || !signed?.signedUrl) {
        console.warn("[generated-files] signed url failed:", signError?.message);
        continue;
      }

      results.push({
        file_id: fileId,
        filename,
        mime: meta.mime_type || "application/octet-stream",
        size: meta.size_bytes ?? buffer.length,
        storage_path: storagePath,
        download_url: signed.signedUrl,
      });
    } catch (err) {
      console.warn("[generated-files] download failed:", fileId, err);
    }
  }

  return results;
}
