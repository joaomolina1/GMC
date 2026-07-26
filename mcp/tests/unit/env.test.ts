import { describe, expect, it } from "vitest";
import { ConfigError, loadEnv } from "../../src/config/env.js";

const base = {
  GMC_API_URL: "https://gmcprototypes.vercel.app",
  GMC_API_KEY: "gmc_live_test_key",
  MCP_AUTH_TOKEN: "mcp_test_token",
  PORT: "3010",
  NODE_ENV: "development",
};

describe("loadEnv", () => {
  it("accepts valid configuration", () => {
    const cfg = loadEnv(base);
    expect(cfg.gmcApiUrl).toBe("https://gmcprototypes.vercel.app");
    expect(cfg.port).toBe(3010);
    expect(cfg.mcpAuthToken).toBe("mcp_test_token");
  });

  it("rejects invalid GMC_API_URL", () => {
    expect(() => loadEnv({ ...base, GMC_API_URL: "not-a-url" })).toThrow(ConfigError);
    try {
      loadEnv({ ...base, GMC_API_URL: "not-a-url" });
    } catch (err) {
      expect(String(err)).not.toContain("gmc_live_test_key");
      expect(String(err)).not.toContain("mcp_test_token");
    }
  });

  it("rejects missing required vars for http", () => {
    expect(() => loadEnv({ ...base, GMC_API_KEY: "" })).toThrow(/GMC_API_KEY/);
    expect(() => loadEnv({ ...base, MCP_AUTH_TOKEN: "" })).toThrow(/MCP_AUTH_TOKEN/);
  });

  it("allows missing MCP_AUTH_TOKEN for stdio transport", () => {
    const cfg = loadEnv({ ...base, MCP_AUTH_TOKEN: "" }, { transport: "stdio" });
    expect(cfg.mcpAuthToken).toBeNull();
  });

  it("allows missing MCP_AUTH_TOKEN when NODE_ENV=test", () => {
    const cfg = loadEnv({ ...base, MCP_AUTH_TOKEN: "", NODE_ENV: "test" });
    expect(cfg.mcpAuthToken).toBeNull();
  });
});
