import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    env: { LOG_LEVEL: "silent" },
  },
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "../lib"),
    },
  },
});
