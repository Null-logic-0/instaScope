export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

export interface OllamaClientOptions extends Partial<OllamaConfig> {
  fetch?: typeof fetch;
  pageHostname?: string;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "llama3.2",
  timeoutMs: 60_000,
  retries: 2,
  retryDelayMs: 1000,
};

export type OllamaState = "unavailable" | "model_missing" | "ready";

export interface OllamaStatus {
  state: OllamaState;
  baseUrl: string;
  model: string;
  models: string[];
  detail: string;
}

export type OllamaErrorKind =
  | "unavailable"
  | "model_missing"
  | "timeout"
  | "cancelled"
  | "request_failed"
  | "bad_response";

export class OllamaError extends Error {
  override name = "OllamaError";

  constructor(
    readonly kind: OllamaErrorKind,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  format?: Record<string, unknown>;
  options?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  promptTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
}

export class OllamaClient {
  #config: OllamaConfig;
  readonly #fetch: typeof fetch;
  readonly #pageHostname: string;

  constructor({ fetch: fetchImpl, pageHostname, ...config }: OllamaClientOptions = {}) {
    this.#config = { ...DEFAULT_OLLAMA_CONFIG, ...config };
    this.#fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.#pageHostname = pageHostname ?? globalThis.location?.hostname ?? "";
  }

  get config(): Readonly<OllamaConfig> {
    return { ...this.#config };
  }

  configure(patch: Partial<OllamaConfig>): Readonly<OllamaConfig> {
    this.#config = { ...this.#config, ...patch };
    return this.config;
  }

  async status(signal?: AbortSignal): Promise<OllamaStatus> {
    const { baseUrl, model } = this.#config;
    try {
      const models = await this.listModels(signal);
      const ready = models.map(stripLatest).includes(stripLatest(model));
      return {
        state: ready ? "ready" : "model_missing",
        baseUrl,
        model,
        models,
        detail: ready
          ? `Ollama at ${baseUrl} is running and model ${model} is installed.`
          : `Ollama is running but model ${model} is not installed (installed: ${models.join(", ") || "none"}). Run: ollama pull ${model}`,
      };
    } catch (error) {
      if (!(error instanceof OllamaError)) throw error;
      return { state: "unavailable", baseUrl, model, models: [], detail: this.#unavailableDetail(error) };
    }
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const body = await this.#request("/api/tags", { method: "GET" }, signal);
    const models = isRecord(body) && Array.isArray(body["models"]) ? body["models"] : null;
    if (!models) throw new OllamaError("bad_response", "Unexpected response from /api/tags");
    return models
      .map((entry) => (isRecord(entry) && typeof entry["name"] === "string" ? entry["name"] : null))
      .filter((name): name is string => name !== null);
  }

  async chat({ messages, format, options, signal }: ChatRequest): Promise<ChatResponse> {
    const body = await this.#request(
      "/api/chat",
      {
        method: "POST",
        body: JSON.stringify({
          model: this.#config.model,
          messages,
          stream: false,
          ...(format && { format }),
          ...(options && { options }),
        }),
      },
      signal,
    );
    if (!isRecord(body) || !isRecord(body["message"]) || typeof body["message"]["content"] !== "string") {
      throw new OllamaError("bad_response", "Unexpected response from /api/chat");
    }
    return {
      content: body["message"]["content"],
      promptTokens: numberOrNull(body["prompt_eval_count"]),
      outputTokens: numberOrNull(body["eval_count"]),
      durationMs: typeof body["total_duration"] === "number" ? Math.round(body["total_duration"] / 1e6) : null,
    };
  }

  async chatJson(request: ChatRequest): Promise<unknown> {
    const { content } = await this.chat(request);
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new OllamaError("bad_response", "The model did not return valid JSON");
    }
  }

  async #request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.#once(path, init, signal);
      } catch (error) {
        if (!(error instanceof OllamaError) || !error.retryable || attempt >= this.#config.retries) throw error;
        await delay(this.#config.retryDelayMs * 2 ** attempt, signal);
      }
    }
  }

  async #once(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const { baseUrl, timeoutMs } = this.#config;
    const guard = withTimeout(signal, timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.#fetch(`${baseUrl}${path}`, {
          ...init,
          headers: { "Content-Type": "application/json" },
          signal: guard.signal,
        });
      } catch (error) {
        if (isAbort(error)) {
          throw guard.timedOut()
            ? new OllamaError("timeout", `Ollama did not answer within ${timeoutMs} ms`, true)
            : new OllamaError("cancelled", "Cancelled");
        }
        throw new OllamaError("unavailable", `Cannot reach Ollama at ${baseUrl}`, true);
      }

      const body = await readJson(response);
      if (response.status === 404) {
        throw new OllamaError("model_missing", errorMessage(body) ?? `Not found: ${path}`);
      }
      if (!response.ok) {
        throw new OllamaError(
          "request_failed",
          `Ollama responded with HTTP ${response.status}${errorMessage(body) ? `: ${errorMessage(body)}` : ""}`,
          response.status >= 500,
        );
      }
      if (body === undefined) throw new OllamaError("bad_response", "Ollama returned a body that is not JSON");
      return body;
    } finally {
      guard.cleanup();
    }
  }

  #unavailableDetail(error: OllamaError): string {
    if (this.#pageHostname.endsWith("instagram.com")) {
      return (
        "This page cannot reach Ollama: Instagram's Content Security Policy blocks connections to localhost. " +
        "Export a JSON backup, open the workbench (npm run workbench) and import it there to use AI features. " +
        "Collection and CSV export keep working here."
      );
    }
    return (
      `${error.message}. Start Ollama (run "ollama serve" or open the Ollama app). ` +
      "AI features are disabled until then; collection, analytics and exports keep working."
    );
  }
}

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OllamaError("cancelled", "Cancelled"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new OllamaError("cancelled", "Cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort);
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function errorMessage(body: unknown): string | null {
  return isRecord(body) && typeof body["error"] === "string" ? body["error"] : null;
}

function isAbort(error: unknown): boolean {
  return isRecord(error) && error["name"] === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function stripLatest(name: string): string {
  return name.endsWith(":latest") ? name.slice(0, -":latest".length) : name;
}
