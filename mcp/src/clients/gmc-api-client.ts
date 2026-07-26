import { AppError, mapHttpStatusToError } from "../errors.js";

export type GmcApiClientOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class GmcApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GmcApiClientOptions) {
    if (!options.baseUrl) throw new AppError("CONFIG_INVALID", "GMC_API_URL is required");
    if (!options.apiKey) throw new AppError("CONFIG_INVALID", "GMC_API_KEY is required");
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(this.url(path), {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          if (res.ok) {
            throw new AppError(
              "GMC_INVALID_RESPONSE",
              "A API GMC devolveu uma resposta JSON inválida."
            );
          }
          data = null;
        }
      }

      if (!res.ok) {
        const apiMessage =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : undefined;
        throw mapHttpStatusToError(res.status, apiMessage);
      }

      return data as T;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AppError("GMC_TIMEOUT", "Timeout ao contactar a API GMC.", {
          retryable: true,
          cause: err,
        });
      }
      throw new AppError(
        "GMC_API_ERROR",
        "Falha de rede ao contactar a API GMC.",
        { retryable: true, cause: err }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  get<T = unknown>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  delete<T = unknown>(path: string) {
    return this.request<T>("DELETE", path);
  }
}
