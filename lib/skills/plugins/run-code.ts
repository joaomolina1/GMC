import vm from "node:vm";
import type { SkillDefinition } from "../types";

const DEFAULT_TIMEOUT_MS = 5_000;

export const runCodeSkill: SkillDefinition = {
  key: "run_code",
  name: "Run Code",
  description:
    "Execute JavaScript code in a sandboxed environment. Use for calculations, data transformations, or parsing. No network or filesystem access. Returns the result or console output.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript code to execute" },
      input: {
        type: "string",
        description: "Optional input data (available as `input` variable)",
      },
    },
    required: ["code"],
  },
  async execute(params, ctx) {
    const code = String(params.code);
    const input = params.input != null ? String(params.input) : undefined;
    const config = ctx.skillConfigs?.run_code ?? {};
    const timeoutMs = Number(config.timeout_ms ?? DEFAULT_TIMEOUT_MS);

    if (code.length > 10_000) {
      return "Code exceeds maximum length (10,000 characters)";
    }

    const logs: string[] = [];
    const sandbox = {
      input,
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    const context = vm.createContext(sandbox);

    try {
      const wrapped = `(function() { ${code} })()`;
      const result = vm.runInContext(wrapped, context, {
        timeout: timeoutMs,
        displayErrors: true,
      });

      const parts: string[] = [];
      if (logs.length > 0) {
        parts.push(`Console:\n${logs.join("\n")}`);
      }
      if (result !== undefined) {
        parts.push(`Result:\n${typeof result === "object" ? JSON.stringify(result, null, 2) : String(result)}`);
      }
      if (parts.length === 0) {
        parts.push("Code executed successfully (no output).");
      }

      return parts.join("\n\n");
    } catch (err) {
      return `Execution error: ${err instanceof Error ? err.message : "Unknown error"}`;
    }
  },
};
