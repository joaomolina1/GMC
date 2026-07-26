import { describe, expect, it } from "vitest";
import {
  assertMcpAuth,
  extractBearerToken,
} from "../../src/middleware/authentication.js";
import { AppError } from "../../src/errors.js";

describe("authentication", () => {
  it("extracts bearer token", () => {
    expect(extractBearerToken("Bearer abc")).toBe("abc");
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("Token abc")).toBeNull();
  });

  it("rejects missing token", () => {
    expect(() => assertMcpAuth(undefined, "secret")).toThrow(AppError);
  });

  it("rejects empty bearer", () => {
    expect(() => assertMcpAuth("Bearer ", "secret")).toThrow(AppError);
  });

  it("rejects wrong token", () => {
    expect(() => assertMcpAuth("Bearer wrong", "secret")).toThrow(AppError);
  });

  it("accepts correct token", () => {
    expect(() => assertMcpAuth("Bearer secret", "secret")).not.toThrow();
  });

  it("skips auth when expected token is null (test mode)", () => {
    expect(() => assertMcpAuth(undefined, null)).not.toThrow();
  });
});
