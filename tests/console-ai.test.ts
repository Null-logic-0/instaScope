import { describe, expect, it } from "vitest";
import { createConsoleApi } from "../src/console";
import type { StorageBackend } from "../src/store/store";
import type { User } from "../src/types";
import { chatReply, fakeFetch, hangsUntilAborted, networkError, tags, type RecordedCall } from "./helpers/fake-ollama";

function memoryBackend(): StorageBackend {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

function consoleWith(fetchImpl: typeof fetch, profiles = 25) {
  const lines: string[] = [];
  const api = createConsoleApi({
    log: (line) => lines.push(line),
    storage: memoryBackend(),
    ai: { fetch: fetchImpl, pageHostname: "localhost", model: "test-model", retryDelayMs: 1, timeoutMs: 200 },
  });
  const users: User[] = Array.from({ length: profiles }, (_, i) => ({ username: `user${i}`, profileUrl: `https://www.instagram.com/user${i}/` }));
  api.store.recordSnapshot({ subject: "me", kind: "followers", users, takenAt: new Date(Date.UTC(2026, 8, 1)) });
  api.store.recordSnapshot({ subject: "me", kind: "following", users: users.slice(0, 5), takenAt: new Date(Date.UTC(2026, 8, 2)) });
  return { api, lines };
}

function replyFor(call: RecordedCall): Response {
  const body = call.body as { messages: { content: string }[] };
  const usernames = [...body.messages[1]!.content.matchAll(/username: (\S+),/g)].map((m) => m[1]);
  return chatReply(JSON.stringify({ profiles: usernames.map((username) => ({ username, category: "Personal", confidence: 0.6 })) }));
}

describe("instaScope.ai", () => {
  it("reports each connection state in plain words", async () => {
    const ready = consoleWith(fakeFetch(() => tags("test-model")).fetch);
    await ready.api.ai.status();
    expect(ready.lines[0]).toMatch(/^\[instaScope\] Ollama connected, model ready\./);

    const missing = consoleWith(fakeFetch(() => tags("other")).fetch);
    await missing.api.ai.status();
    expect(missing.lines[0]).toMatch(/model unavailable.*ollama pull test-model/);

    const down = consoleWith(fakeFetch(networkError, networkError, networkError).fetch);
    const status = await down.api.ai.status();
    expect(status.state).toBe("unavailable");
    expect(down.lines[0]).toMatch(/^\[instaScope\] Ollama unavailable\..*exports keep working/);
  });

  it("classifies the store with progress lines and a summary", async () => {
    const { api, lines } = consoleWith(fakeFetch(replyFor, replyFor).fetch);

    const result = await api.ai.classify({ batchSize: 20 });

    expect(result).toMatchObject({ total: 25, classified: 25, stopReason: "completed" });
    expect(lines.filter((l) => l.includes("Classifying profiles"))).toEqual([
      "[instaScope] Classifying profiles: 20 / 25",
      "[instaScope] Classifying profiles: 25 / 25",
    ]);
    expect(lines.at(-1)).toBe("[instaScope] Classification done (25 classified, 0 already classified).");
    expect(api.exportCsv("followers").split("\r\n")[1]).toMatch(/,Personal,0\.6$/);
  });

  it("classifies only a dataset when asked", async () => {
    const { api } = consoleWith(fakeFetch(replyFor).fetch);

    const result = await api.ai.classify({ dataset: "mutuals" });

    expect(result.total).toBe(5);
    expect(api.store.profile("user7")?.ai).toBeUndefined();
  });

  it("explains a failure instead of throwing, keeping the store usable", async () => {
    const { api, lines } = consoleWith(fakeFetch(networkError, networkError, networkError).fetch);

    const result = await api.ai.classify();

    expect(result.stopReason).toBe("failed");
    expect(lines.at(-1)).toMatch(/Classification stopped: Cannot reach Ollama/);
    expect(api.exportCsv("followers").split("\r\n")[0]).toBe("username,display_name,profile_url,relationship,first_seen,last_seen");
  });

  it("cancels a running classification and refuses concurrent AI operations", async () => {
    const { api } = consoleWith(fakeFetch(hangsUntilAborted()).fetch);

    const pending = api.ai.classify();
    await expect(api.ai.report()).rejects.toThrow(/already running/);
    expect(api.ai.cancel()).toBe(true);

    await expect(pending).resolves.toMatchObject({ stopReason: "cancelled" });
    expect(api.ai.cancel()).toBe(false);
  });

  it("produces a report from deterministic statistics", async () => {
    const { api, lines } = consoleWith(fakeFetch(() => chatReply("Five of your followers follow you back.")).fetch);

    const { stats, text } = await api.ai.report();

    expect(stats).toMatchObject({ followers: 25, following: 5, mutuals: 5 });
    expect(text).toBe("Five of your followers follow you back.");
    expect(lines.at(-1)).toBe("[instaScope] me: Five of your followers follow you back.");
  });

  it("lets the user change the model and base URL", () => {
    const { api, lines } = consoleWith(fakeFetch().fetch);

    api.ai.configure({ model: "gemma3:4b", baseUrl: "http://127.0.0.1:11434" });

    expect(api.ai.config()).toMatchObject({ model: "gemma3:4b", baseUrl: "http://127.0.0.1:11434" });
    expect(lines.at(-1)).toBe("[instaScope] Ollama configured: http://127.0.0.1:11434, model gemma3:4b");
  });
});
