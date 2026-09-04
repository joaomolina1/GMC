/** Erro que não vale a pena repetir (ficheiro inválido, candidato não aprovado, etc.). */
export class NonRetryableError extends Error {
  readonly retryable = false as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NonRetryableError";
  }
}

/** Passo interrompido por SIGTERM: o job volta à fila sem gastar uma tentativa. */
export class AbortedError extends Error {
  readonly aborted = true as const;
  constructor(message = "Interrompido") {
    super(message);
    this.name = "AbortedError";
  }
}

export function isAborted(err: unknown): boolean {
  return err instanceof AbortedError || (err instanceof Error && err.name === "AbortError");
}

export function isRetryable(err: unknown): boolean {
  return !(err instanceof NonRetryableError);
}
