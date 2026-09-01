import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "lib"),
      "@": path.resolve(__dirname, "app"),
    },
  },
});
