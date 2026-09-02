import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CLIPS_BUCKET } from "@lib/clips/types";
import { NonRetryableError } from "./errors";
import type { ServiceClient } from "./supabase";

/**
 * Storage privado `clips` ⇄ disco local por job. Cada passo é retomável: se o ficheiro
 * já existe em disco (mesmo worker), reutiliza; senão descarrega do Storage. Nada aqui
 * assume estado em memória entre ciclos.
 */

export interface StorageIO {
  download(objectPath: string, localPath: string): Promise<void>;
  upload(objectPath: string, localPath: string, contentType: string): Promise<void>;
  uploadBuffer(objectPath: string, data: Buffer | string, contentType: string): Promise<void>;
  exists(objectPath: string): Promise<boolean>;
}

/** Download com signed URL + stream para disco (o SDK carrega tudo em memória). */
export function createStorageIO(supabase: ServiceClient): StorageIO {
  const bucket = () => supabase.storage.from(CLIPS_BUCKET);
  return {
    async download(objectPath, localPath) {
      await mkdir(path.dirname(localPath), { recursive: true });
      const { data, error } = await bucket().createSignedUrl(objectPath, 60 * 60);
      if (error || !data?.signedUrl) {
        throw new NonRetryableError(`Objeto não encontrado no Storage: ${objectPath} (${error?.message ?? "sem URL"})`);
      }
      const res = await fetch(data.signedUrl);
      if (!res.ok || !res.body) {
        throw new Error(`Download falhou (${res.status}) para ${objectPath}`);
      }
      const tmp = `${localPath}.part`;
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(tmp));
      const { rename } = await import("node:fs/promises");
      await rename(tmp, localPath);
    },
    async upload(objectPath, localPath, contentType) {
      const data = await readFile(localPath);
      await this.uploadBuffer(objectPath, data, contentType);
    },
    async uploadBuffer(objectPath, data, contentType) {
      const { error } = await bucket().upload(objectPath, data, { contentType, upsert: true });
      if (error) throw new Error(`Upload falhou para ${objectPath}: ${error.message}`);
    },
    async exists(objectPath) {
      const folder = objectPath.split("/").slice(0, -1).join("/");
      const name = objectPath.split("/").pop() ?? "";
      const { data, error } = await bucket().list(folder, { search: name, limit: 20 });
      if (error) return false;
      return Boolean(data?.some((o) => o.name === name));
    },
  };
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

export async function fileSize(p: string): Promise<number> {
  const s = await stat(p);
  return s.size;
}

/** Garante que o objeto está em disco; descarrega se necessário. */
export async function ensureLocal(io: StorageIO, objectPath: string, localPath: string): Promise<string> {
  if (await fileExists(localPath)) return localPath;
  await io.download(objectPath, localPath);
  return localPath;
}

export async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
