import { describe, expect, it } from "vitest";
import { OllamaClient, OllamaError } from "../../src/ai/ollama";
import { chatReply, fakeFetch, hangsUntilAborted, json, networkError, tags } from "../helpers/fake-ollama";

const fast = { retryDelayMs: 1, timeoutMs: 200 };

function client(fetchImpl: typeof fetch, options: Partial<ConstructorParameters<typeof OllamaClient>[0]> = {}) {
  return new OllamaClient({ fetch: fetchImpl, pageHostname: "localhost", ...fast, ...options });
}

async function failure(promise: Promise<unknown>): Promise<OllamaError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof OllamaError) return error;
    throw error;
  }
  throw new Error("expected the promise to reject");
}

describe("OllamaClient.status", () => {
  it("is ready when the configured model is installed", async () => {
    const { fetch, calls } = fakeFetch(() => tags("llama3.2:latest", "gemma3:1b"));

    const status = await client(fetch).status();

    expect(status).toMatchObject({ state: "ready", model: "llama3.2", models: ["llama3.2:latest", "gemma3:1b"] });
    expect(calls[0]).toMatchObject({ url: "http://localhost:11434/api/tags", method: "GET" });
  });

  it("reports a missing model with the install command", async () => {
    const { fetch } = fakeFetch(() => tags("gemma3:1b"));

    const status = await client(fetch, { model: "llama3.2" }).status();

    expect(status.state).toBe("model_missing");
    expect(status.detail).toMatch(/ollama pull llama3.2/);
    expect(status.detail).toMatch(/installed: gemma3:1b/);
  });

  it("reports Ollama as unavailable when the server cannot be reached", async () => {
    const { fetch, calls } = fakeFetch(networkError, networkError, networkError);

    const status = await client(fetch).status();

    expect(status).toMatchObject({ state: "unavailable", models: [] });
    expect(status.detail).toMatch(/Cannot reach Ollama at http:\/\/localhost:11434/);
    expect(status.detail).toMatch(/collection, analytics and exports keep working/i);
    expect(calls).toHaveLength(3);
  });

  it("explains the Content Security Policy when running on instagram.com", async () => {
    const { fetch } = fakeFetch(networkError, networkError, networkError);

    const status = await client(fetch, { pageHostname: "www.instagram.com" }).status();

    expect(status.state).toBe("unavailable");
    expect(status.detail).toMatch(/Content Security Policy/);
    expect(status.detail).toMatch(/workbench/);
  });
});

describe("OllamaClient.chat", () => {
  it("sends a non-streaming chat request and returns content with token counts", async () => {
    const { fetch, calls } = fakeFetch(() => chatReply("hello"));
    const schema = { type: "object" };

    const reply = await client(fetch, { model: "gemma3:1b" }).chat({
      messages: [{ role: "user", content: "hi" }],
      format: schema,
      options: { temperature: 0 },
    });

    expect(reply).toEqual({ content: "hello", promptTokens: 100, outputTokens: 50, durationMs: 2500 });
    expect(calls[0]).toMatchObject({
      url: "http://localhost:11434/api/chat",
      method: "POST",
      body: { model: "gemma3:1b", stream: false, format: schema, options: { temperature: 0 }, messages: [{ role: "user", content: "hi" }] },
    });
  });

  it("parses JSON content and rejects malformed JSON", async () => {
    const { fetch } = fakeFetch(
      () => chatReply('{"a":1}'),
      () => chatReply("not json {"),
    );
    const c = client(fetch);

    await expect(c.chatJson({ messages: [] })).resolves.toEqual({ a: 1 });
    expect((await failure(c.chatJson({ messages: [] }))).kind).toBe("bad_response");
  });

  it("maps a 404 to model_missing without retrying", async () => {
    const { fetch, calls } = fakeFetch(() => json({ error: "model 'nope' not found" }, 404));

    const error = await failure(client(fetch).chat({ messages: [] }));

    expect(error).toMatchObject({ kind: "model_missing", message: "model 'nope' not found", retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("retries server errors with backoff and then succeeds", async () => {
    const { fetch, calls } = fakeFetch(
      () => json({ error: "busy" }, 503),
      () => json({ error: "busy" }, 503),
      () => chatReply("ok"),
    );

    const reply = await client(fetch).chat({ messages: [] });

    expect(reply.content).toBe("ok");
    expect(calls).toHaveLength(3);
  });

  it("gives up after the configured retries", async () => {
    const { fetch, calls } = fakeFetch(
      () => json({ error: "busy" }, 500),
      () => json({ error: "busy" }, 500),
    );

    const error = await failure(client(fetch, { retries: 1 }).chat({ messages: [] }));

    expect(error).toMatchObject({ kind: "request_failed", retryable: true });
    expect(error.message).toMatch(/HTTP 500: busy/);
    expect(calls).toHaveLength(2);
  });

  it("does not retry client errors", async () => {
    const { fetch, calls } = fakeFetch(() => json({ error: "bad request" }, 400));

    const error = await failure(client(fetch).chat({ messages: [] }));

    expect(error).toMatchObject({ kind: "request_failed", retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("times out a request that never answers, retrying it", async () => {
    const { fetch, calls } = fakeFetch(hangsUntilAborted(), hangsUntilAborted());

    const error = await failure(client(fetch, { timeoutMs: 15, retries: 1 }).chat({ messages: [] }));

    expect(error.kind).toBe("timeout");
    expect(error.message).toMatch(/within 15 ms/);
    expect(calls).toHaveLength(2);
  });

  it("reports cancellation as cancelled and stops immediately", async () => {
    const { fetch, calls } = fakeFetch(hangsUntilAborted());
    const controller = new AbortController();

    const pending = client(fetch, { timeoutMs: 5000 }).chat({ messages: [], signal: controller.signal });
    controller.abort();

    expect((await failure(pending)).kind).toBe("cancelled");
    expect(calls).toHaveLength(1);
  });

  it("cancels while waiting to retry", async () => {
    const { fetch, calls } = fakeFetch(networkError);
    const controller = new AbortController();
    const pending = client(fetch, { retryDelayMs: 1000 }).chat({ messages: [], signal: controller.signal });

    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();

    expect((await failure(pending)).kind).toBe("cancelled");
    expect(calls).toHaveLength(1);
  });

  it("rejects a body that is not JSON or lacks a message", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html>", { status: 200 }),
      () => json({ done: true }),
    );
    const c = client(fetch);

    expect((await failure(c.chat({ messages: [] }))).kind).toBe("bad_response");
    expect((await failure(c.chat({ messages: [] }))).kind).toBe("bad_response");
  });

  it("uses the configured base URL and model after configure()", async () => {
    const { fetch, calls } = fakeFetch(() => chatReply("ok"));
    const c = client(fetch);

    c.configure({ baseUrl: "http://127.0.0.1:9999", model: "qwen3:4b" });
    await c.chat({ messages: [] });

    expect(calls[0]).toMatchObject({ url: "http://127.0.0.1:9999/api/chat", body: { model: "qwen3:4b" } });
    expect(c.config.model).toBe("qwen3:4b");
  });
});
