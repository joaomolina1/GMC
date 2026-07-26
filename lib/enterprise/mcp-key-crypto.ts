import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

const VERSION = 1;
const SALT = "gmc-mcp-linked-api-key-v1";

function getEncryptionMaterial(): string {
  const material =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    "";
  if (!material) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to encrypt MCP linked API keys");
  }
  return material;
}

function deriveKey(): Buffer {
  return scryptSync(getEncryptionMaterial(), SALT, 32);
}

/** Encrypt a companion gmc_live_ secret for storage on platform_mcp_keys. */
export function encryptLinkedApiKeySecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${VERSION}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptLinkedApiKeySecret(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== `v${VERSION}`) {
    throw new Error("Invalid linked API key ciphertext");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Stable fingerprint for tests / logging (never log plaintext). */
export function linkedApiKeyFingerprint(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex").slice(0, 12);
}
