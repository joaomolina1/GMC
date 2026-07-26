import { describe, expect, it, vi } from "vitest";
import { GmcApiClient } from "../../src/clients/gmc-api-client.js";
import { AppError } from "../../src/errors.js";

function mockFetch(status: number, body: unknown, headers?: HeadersInit) {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    });
  }) as unknown as typeof fetch;
}

describe("GmcApiClient", () => {
  it("sends Authorization bearer header", async () => {
    const fetchImpl = mockFetch(200, { ok: true });
    const client = new GmcApiClient({
      baseUrl: "https://example.test",
      apiKey: "gmc_live_secret",
      fetchImpl,
    });
    await client.get("/api/v1/capabilities");
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer gmc_live_secret",
    });
  });

  it("maps 401/404/429/500", async () => {
    for (const [status, code] of [
      [401, "GMC_UNAUTHORIZED"],
      [404, "GMC_RESOURCE_NOT_FOUND"],
      [429, "GMC_RATE_LIMIT"],
      [500, "GMC_API_ERROR"],
    ] as const) {
      const client = new GmcApiClient({
        baseUrl: "https://example.test",
        apiKey: "k",
        fetchImpl: mockFetch(status, { error: "boom" }),
      });
      try {
        await client.get("/x");
        expect.fail("should throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(code);
        expect(String(err)).not.toContain("Authorization");
      }
    }
  });

  it("handles invalid JSON on success", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json", { status: 200 }));
    const client = new GmcApiClient({
      baseUrl: "https://example.test",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.get("/x")).rejects.toMatchObject({ code: "GMC_INVALID_RESPONSE" });
  });

  it("handles timeout", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const client = new GmcApiClient({
      baseUrl: "https://example.test",
      apiKey: "k",
      timeoutMs: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.get("/x")).rejects.toMatchObject({ code: "GMC_TIMEOUT" });
  });
});
