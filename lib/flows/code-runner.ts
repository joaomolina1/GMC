import vm from "node:vm";
import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CODE_LENGTH = 20_000;

export async function executeFlowCode(
  language: "javascript" | "python",
  code: string,
  input?: string
): Promise<string> {
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error(`Código excede ${MAX_CODE_LENGTH} caracteres`);
  }

  if (language === "javascript") {
    return runJavaScript(code, input);
  }
  return runPython(code, input);
}

function runJavaScript(code: string, input?: string): string {
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
  const wrapped = `(function() { ${code} })()`;
  const result = vm.runInContext(wrapped, context, {
    timeout: DEFAULT_TIMEOUT_MS,
    displayErrors: true,
  });

  const parts: string[] = [];
  if (logs.length > 0) parts.push(logs.join("\n"));
  if (result !== undefined) {
    parts.push(
      typeof result === "object" ? JSON.stringify(result, null, 2) : String(result)
    );
  }
  return parts.join("\n") || "Código executado sem output.";
}

function runPython(code: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const prelude = `input = ${JSON.stringify(input ?? "")}\n`;
    const script = `${prelude}${code}`;

    const proc = spawn("python3", ["-c", script], {
      timeout: DEFAULT_TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "Python 3 não disponível neste ambiente. Use JavaScript ou configure Python no servidor."
          )
        );
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python exit code ${code}`));
        return;
      }
      resolve(stdout.trim() || "Código executado sem output.");
    });
  });
}
