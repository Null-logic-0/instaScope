import { describe, expect, it } from "vitest";
import { classifyProfiles, DEFAULT_CATEGORIES, parseClassificationResponse } from "../../src/ai/classify";
import { OllamaClient } from "../../src/ai/ollama";
import { Store, type StorageBackend } from "../../src/store/store";
import type { User } from "../../src/types";
import { chatReply, fakeFetch, hangsUntilAborted, json, networkError, type RecordedCall } from "../helpers/fake-ollama";

function memoryBackend(): StorageBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function storeWith(count: number, backend = memoryBackend()): Store {
  const store = new Store(backend);
  const users: User[] = Array.from({ length: count }, (_, i) => ({
    username: `user${i}`,
    displayName: `Name ${i}`,
    profileUrl: `https://www.instagram.com/user${i}/`,
  }));
  store.recordSnapshot({ subject: "me", kind: "followers", users, takenAt: new Date(Date.UTC(2026, 8, 1)) });
  return store;
}

function replyFor(call: RecordedCall): Response {
  const body = call.body as { messages: { content: string }[] };
  const usernames = [...body.messages[1]!.content.matchAll(/username: (\S+),/g)].map((m) => m[1]);
  return chatReply(
    JSON.stringify({ profiles: usernames.map((username) => ({ username, category: "Creator", confidence: 0.8 })) }),
  );
}

const client = (fetchImpl: typeof fetch) =>
  new OllamaClient({ fetch: fetchImpl, pageHostname: "localhost", model: "test-model", retryDelayMs: 1, timeoutMs: 200 });
const now = () => new Date(Date.UTC(2026, 8, 10, 12));

describe("classifyProfiles", () => {
  it("classifies in batches, stores results and reports progress", async () => {
    const store = storeWith(45);
    const { fetch, calls } = fakeFetch(replyFor, replyFor, replyFor);
    const progress: number[] = [];

    const result = await classifyProfiles({ client: client(fetch), store, batchSize: 20, now, onProgress: (p) => progress.push(p.done) });

    expect(result).toMatchObject({ total: 45, classified: 45, skipped: 0, unresolved: [], failedBatches: 0, stopReason: "completed" });
    expect(calls).toHaveLength(3);
    expect(progress).toEqual([20, 40, 45]);
    expect(store.profile("user44")?.ai).toEqual({
      category: "Creator",
      confidence: 0.8,
      model: "test-model",
      classifiedAt: "2026-09-10T12:00:00.000Z",
    });
  });

  it("sends the categories as a JSON schema enum and lists display names in the prompt", async () => {
    const store = storeWith(2);
    const { fetch, calls } = fakeFetch(replyFor);

    await classifyProfiles({ client: client(fetch), store, categories: ["Cat", "Dog"], now });

    const body = calls[0]!.body as { format: { properties: { profiles: { items: { properties: { category: { enum: string[] } } } } } }; messages: { role: string; content: string }[]; options: { temperature: number } };
    expect(body.format.properties.profiles.items.properties.category.enum).toEqual(["Cat", "Dog"]);
    expect(body.messages[0]!.content).toMatch(/categories: Cat, Dog/);
    expect(body.messages[1]!.content).toBe("Classify these 2 accounts:\n1. username: user0, display name: Name 0\n2. username: user1, display name: Name 1");
    expect(body.options).toEqual({ temperature: 0 });
  });

  it("skips profiles that are already classified unless forced", async () => {
    const store = storeWith(3);
    store.setClassification("user1", { category: "Other", confidence: 0.5, model: "m", classifiedAt: "t" });
    const first = fakeFetch(replyFor);

    const result = await classifyProfiles({ client: client(first.fetch), store, now });

    expect(result).toMatchObject({ total: 2, classified: 2, skipped: 1 });
    expect((first.calls[0]!.body as { messages: { content: string }[] }).messages[1]!.content).not.toContain("user1,");
    expect(store.profile("user1")?.ai?.category).toBe("Other");

    const forced = fakeFetch(replyFor);
    await classifyProfiles({ client: client(forced.fetch), store, force: true, now });
    expect(store.profile("user1")?.ai?.category).toBe("Creator");
  });

  it("retries accounts the model left out once, then reports them unresolved", async () => {
    const store = storeWith(3);
    const { fetch, calls } = fakeFetch(
      () => chatReply(JSON.stringify({ profiles: [{ username: "user0", category: "Fitness", confidence: 0.9 }] })),
      () => chatReply(JSON.stringify({ profiles: [{ username: "user1", category: "Travel", confidence: 0.7 }] })),
    );

    const result = await classifyProfiles({ client: client(fetch), store, now });

    expect(calls).toHaveLength(2);
    expect((calls[1]!.body as { messages: { content: string }[] }).messages[1]!.content).toMatch(/these 2 accounts/);
    expect(result).toMatchObject({ classified: 2, unresolved: ["user2"], stopReason: "completed" });
  });

  it("ignores entries with unknown usernames, bad categories or bad confidence", async () => {
    const store = storeWith(3);
    const { fetch } = fakeFetch(
      () =>
        chatReply(
          JSON.stringify({
            profiles: [
              { username: "user0", category: "Fitness", confidence: 0.9 },
              { username: "stranger", category: "Fitness", confidence: 0.9 },
              { username: "user1", category: "Cooking", confidence: 0.9 },
              { username: "user2", category: "Travel", confidence: 7 },
            ],
          }),
        ),
      () => chatReply(JSON.stringify({ profiles: [] })),
    );

    const result = await classifyProfiles({ client: client(fetch), store, now });

    expect(result).toMatchObject({ classified: 1, unresolved: ["user1", "user2"] });
    expect(store.profile("stranger")).toBeUndefined();
    expect(store.profile("user1")?.ai).toBeUndefined();
  });

  it("survives a malformed batch and continues with the next", async () => {
    const store = storeWith(40);
    const { fetch, calls } = fakeFetch(
      () => chatReply("this is not json"),
      replyFor,
      () => chatReply("still not json"),
    );

    const result = await classifyProfiles({ client: client(fetch), store, batchSize: 20, now });

    expect(calls).toHaveLength(3);
    expect(result).toMatchObject({ classified: 20, failedBatches: 2, stopReason: "completed" });
    expect(result.unresolved).toHaveLength(20);
  });

  it("stops after repeated malformed responses", async () => {
    const store = storeWith(60);
    const { fetch, calls } = fakeFetch(
      () => chatReply("nope"),
      () => chatReply("nope"),
      () => chatReply("nope"),
      replyFor,
    );

    const result = await classifyProfiles({ client: client(fetch), store, batchSize: 10, maxConsecutiveFailures: 3, now });

    expect(calls).toHaveLength(3);
    expect(result).toMatchObject({ stopReason: "failed", failedBatches: 3, classified: 0 });
    expect(result.error?.kind).toBe("bad_response");
    expect(result.unresolved).toHaveLength(30);
  });

  it("fails cleanly when Ollama is unavailable and stores nothing", async () => {
    const backend = memoryBackend();
    const store = storeWith(5, backend);
    const { fetch } = fakeFetch(networkError, networkError, networkError);

    const result = await classifyProfiles({ client: client(fetch), store, now });

    expect(result).toMatchObject({ stopReason: "failed", classified: 0 });
    expect(result.error?.kind).toBe("unavailable");
    expect(store.profiles().every((p) => p.ai === undefined)).toBe(true);
  });

  it("fails immediately when the model is missing", async () => {
    const store = storeWith(5);
    const { fetch, calls } = fakeFetch(() => json({ error: "model 'test-model' not found" }, 404));

    const result = await classifyProfiles({ client: client(fetch), store, now });

    expect(result.stopReason).toBe("failed");
    expect(result.error?.kind).toBe("model_missing");
    expect(calls).toHaveLength(1);
  });

  it("fails with a timeout after the client's retries", async () => {
    const store = storeWith(5);
    const { fetch, calls } = fakeFetch(hangsUntilAborted(), hangsUntilAborted(), hangsUntilAborted());
    const c = new OllamaClient({ fetch, pageHostname: "localhost", timeoutMs: 10, retries: 2, retryDelayMs: 1 });

    const result = await classifyProfiles({ client: c, store, now });

    expect(result.error?.kind).toBe("timeout");
    expect(calls).toHaveLength(3);
  });

  it("keeps completed batches when cancelled, so a later run resumes", async () => {
    const backend = memoryBackend();
    const store = storeWith(40, backend);
    const controller = new AbortController();
    const { fetch, calls } = fakeFetch(
      (call) => {
        controller.abort();
        return replyFor(call);
      },
      replyFor,
    );

    const result = await classifyProfiles({ client: client(fetch), store, batchSize: 20, signal: controller.signal, now });

    expect(result).toMatchObject({ stopReason: "cancelled", classified: 20 });
    expect(calls).toHaveLength(1);
    expect(new Store(backend).profile("user0")?.ai?.category).toBe("Creator");

    const resumed = fakeFetch(replyFor);
    const second = await classifyProfiles({ client: client(resumed.fetch), store, batchSize: 20, now });
    expect(second).toMatchObject({ total: 20, skipped: 20, classified: 20, stopReason: "completed" });
  });

  it("only classifies the requested usernames", async () => {
    const store = storeWith(10);
    const { fetch, calls } = fakeFetch(replyFor);

    const result = await classifyProfiles({ client: client(fetch), store, usernames: ["user3", "user7", "ghost"], now });

    expect(result.total).toBe(2);
    expect((calls[0]!.body as { messages: { content: string }[] }).messages[1]!.content).toMatch(/these 2 accounts/);
  });
});

describe("parseClassificationResponse", () => {
  const expected = new Set(["alice", "bob"]);

  it("accepts canonical categories case-insensitively and rounds confidence", () => {
    const { valid, invalid } = parseClassificationResponse(
      { profiles: [{ username: "@Alice ", category: "fitness", confidence: 0.91234 }] },
      expected,
      DEFAULT_CATEGORIES,
    );

    expect([...valid]).toEqual([["alice", { category: "Fitness", confidence: 0.91 }]]);
    expect(invalid).toBe(0);
  });

  it.each([
    ["not an object", "text"],
    ["missing profiles", {}],
    ["profiles not an array", { profiles: {} }],
    ["entry not an object", { profiles: ["alice"] }],
    ["missing confidence", { profiles: [{ username: "alice", category: "Fitness" }] }],
    ["confidence as string", { profiles: [{ username: "alice", category: "Fitness", confidence: "0.9" }] }],
    ["negative confidence", { profiles: [{ username: "alice", category: "Fitness", confidence: -0.1 }] }],
    ["NaN confidence", { profiles: [{ username: "alice", category: "Fitness", confidence: Number.NaN }] }],
    ["unknown category", { profiles: [{ username: "alice", category: "Cooking", confidence: 0.9 }] }],
    ["unexpected username", { profiles: [{ username: "mallory", category: "Fitness", confidence: 0.9 }] }],
  ])("rejects %s", (_label, raw) => {
    expect(parseClassificationResponse(raw, expected, DEFAULT_CATEGORIES).valid.size).toBe(0);
  });

  it("keeps the first entry when the model repeats a username", () => {
    const { valid, invalid } = parseClassificationResponse(
      {
        profiles: [
          { username: "bob", category: "News", confidence: 0.6 },
          { username: "bob", category: "Travel", confidence: 0.9 },
        ],
      },
      expected,
      DEFAULT_CATEGORIES,
    );

    expect(valid.get("bob")).toEqual({ category: "News", confidence: 0.6 });
    expect(invalid).toBe(1);
  });
});
