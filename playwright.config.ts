import { defineConfig } from "@playwright/test";

/**
 * Testes ponta a ponta (Playwright) contra uma app a correr (dev ou preview).
 *   PT26_E2E_BASE_URL=http://localhost:3000 PT26_E2E_EMAIL=... PT26_E2E_PASSWORD=... npm run test:e2e
 * Sem credenciais os testes são ignorados (skip).
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PT26_E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1920, height: 1080 },
    locale: "pt-PT",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
