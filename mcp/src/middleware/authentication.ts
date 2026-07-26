import { timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.js";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still compare to keep timing roughly constant for wrong lengths.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return null;
  return match[1].trim();
}

export function assertMcpAuth(
  authorizationHeader: string | undefined,
  expectedToken: string | null
): void {
  if (!expectedToken) {
    // Test-only mode: auth disabled.
    return;
  }
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new AppError("AUTH_FAILED", "Autenticação em falta.", { status: 401 });
  }
  if (!safeEqual(token, expectedToken)) {
    throw new AppError("AUTH_FAILED", "Token de autenticação inválido.", { status: 401 });
  }
}
