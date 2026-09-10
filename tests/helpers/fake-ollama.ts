export interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

export type Responder = (call: RecordedCall, init: RequestInit) => Response | Promise<Response>;

export interface FakeFetch {
  fetch: typeof fetch;
  calls: RecordedCall[];
}

export function fakeFetch(...responders: Responder[]): FakeFetch {
  const calls: RecordedCall[] = [];
  const queue = [...responders];
  const fetchImpl: typeof globalThis.fetch = async (input, init = {}) => {
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    const responder = queue.shift();
    if (!responder) throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
    return responder(call, init);
  };
  return { fetch: fetchImpl, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function networkError(): never {
  throw new TypeError("Failed to fetch");
}

export function hangsUntilAborted(): Responder {
  return (_call, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted", "AbortError")));
    });
}

export function tags(...names: string[]): Response {
  return json({ models: names.map((name) => ({ name, model: name })) });
}

export function chatReply(content: string, extra: Record<string, unknown> = {}): Response {
  return json({
    model: "test",
    message: { role: "assistant", content },
    done: true,
    prompt_eval_count: 100,
    eval_count: 50,
    total_duration: 2_500_000_000,
    ...extra,
  });
}
