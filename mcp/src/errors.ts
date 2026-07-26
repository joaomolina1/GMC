export type ErrorCode =
  | "CONFIG_INVALID"
  | "AUTH_FAILED"
  | "INVALID_INPUT"
  | "GMC_TIMEOUT"
  | "GMC_INVALID_RESPONSE"
  | "GMC_UNAUTHORIZED"
  | "GMC_FORBIDDEN"
  | "GMC_RESOURCE_NOT_FOUND"
  | "GMC_RATE_LIMIT"
  | "GMC_API_ERROR"
  | "RATE_LIMIT"
  | "SESSION_INVALID"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { retryable?: boolean; status?: number; cause?: unknown }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }
}

export function toToolErrorPayload(err: unknown): {
  code: ErrorCode;
  message: string;
  retryable: boolean;
} {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Ocorreu um erro interno ao executar a ferramenta.",
    retryable: false,
  };
}

export function mapHttpStatusToError(status: number, apiMessage?: string): AppError {
  const message =
    apiMessage?.trim() ||
    (status === 401
      ? "A API GMC rejeitou a autenticação."
      : status === 403
        ? "Sem permissão para este recurso GMC."
        : status === 404
          ? "O recurso GMC solicitado não foi encontrado."
          : status === 429
            ? "A API GMC está a limitar pedidos. Tente mais tarde."
            : `A API GMC devolveu HTTP ${status}.`);

  if (status === 401) {
    return new AppError("GMC_UNAUTHORIZED", message, { status, retryable: false });
  }
  if (status === 403) {
    return new AppError("GMC_FORBIDDEN", message, { status, retryable: false });
  }
  if (status === 404) {
    return new AppError("GMC_RESOURCE_NOT_FOUND", message, { status, retryable: false });
  }
  if (status === 429) {
    return new AppError("GMC_RATE_LIMIT", message, { status, retryable: true });
  }
  if (status >= 500) {
    return new AppError("GMC_API_ERROR", message, { status, retryable: true });
  }
  return new AppError("GMC_API_ERROR", message, { status, retryable: false });
}
