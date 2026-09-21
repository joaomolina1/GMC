import { describe, expect, it } from "vitest";
import { cronUnauthorized } from "@lib/cron/auth";

function req(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/cron/x", { headers });
}

describe("cronUnauthorized", () => {
  it("recusa GET anónimo quando não há CRON_SECRET", () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(cronUnauthorized(req({}))?.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  it("aceita user-agent Vercel Cron na ausência de secret", () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(
        cronUnauthorized(
          req({ "user-agent": "vercel-cron/1.0", "x-vercel-cron-schedule": "* * * * *" })
        )
      ).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  it("exige Bearer igual ao CRON_SECRET quando está definido", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    try {
      expect(cronUnauthorized(req({ authorization: "Bearer test-secret" }))).toBeNull();
      expect(cronUnauthorized(req({ authorization: "Bearer nope" }))?.status).toBe(401);
      expect(
        cronUnauthorized(
          req({ "user-agent": "vercel-cron/1.0", "x-vercel-cron-schedule": "* * * * *" })
        )?.status
      ).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
