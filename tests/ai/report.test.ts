import { describe, expect, it } from "vitest";
import { OllamaClient, OllamaError } from "../../src/ai/ollama";
import { explainStats, sanitize } from "../../src/ai/report";
import type { Stats } from "../../src/analytics";
import { chatReply, fakeFetch, networkError } from "../helpers/fake-ollama";

const stats: Stats = {
  subject: "me",
  followers: 421,
  following: 380,
  mutuals: 300,
  notFollowingBack: 80,
  fans: 121,
  newFollowers: 37,
  lostFollowers: 12,
  followersTakenAt: "2026-09-10T00:00:00.000Z",
  previousFollowersTakenAt: "2026-09-01T00:00:00.000Z",
  followingTakenAt: "2026-09-10T00:00:00.000Z",
};

const client = (fetchImpl: typeof fetch) =>
  new OllamaClient({ fetch: fetchImpl, pageHostname: "localhost", retryDelayMs: 1, timeoutMs: 200 });

describe("explainStats", () => {
  it("hands the computed statistics to the model and returns its text", async () => {
    const { fetch, calls } = fakeFetch(() => chatReply("  You gained 37 followers and lost 12.\r\n"));

    const text = await explainStats({ client: client(fetch), stats });

    expect(text).toBe("You gained 37 followers and lost 12.");
    const body = calls[0]!.body as {
      messages: { role: string; content: string }[];
      options: { temperature: number };
      format?: unknown;
    };
    expect(body.messages[0]!.content).toMatch(/never invent figures/);
    expect(JSON.parse(body.messages[1]!.content)).toEqual(stats);
    expect(body.format).toBeUndefined();
  });

  it("propagates Ollama errors", async () => {
    const { fetch } = fakeFetch(networkError, networkError, networkError);

    await expect(explainStats({ client: client(fetch), stats })).rejects.toBeInstanceOf(OllamaError);
  });

  it("clips very long answers", async () => {
    const { fetch } = fakeFetch(() => chatReply("x".repeat(5000)));

    const text = await explainStats({ client: client(fetch), stats, maxChars: 100 });

    expect(text).toHaveLength(101);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("sanitize", () => {
  it("strips control characters and normalises line endings", () => {
    const escape = String.fromCharCode(27);
    const bell = String.fromCharCode(7);

    expect(sanitize(`ab\r\nc${escape}[31m${bell}\tok`, 100)).toBe("ab\nc[31m\tok");
  });
});
