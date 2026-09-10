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
    expect(body.messages[1]!.content).toBe(
      [
        "Account: me",
        "Followers: 421 (snapshot taken 2026-09-10)",
        "Accounts the account follows: 380 (snapshot taken 2026-09-10)",
        "Mutual follows, both follow each other: 300",
        "Accounts the account follows that do not follow it back: 80",
        "Followers the account does not follow back: 121",
        "Previous followers snapshot: 2026-09-01",
        "New followers since the previous snapshot: 37",
        "Lost followers since the previous snapshot: 12",
      ].join("\n"),
    );
    expect(body.options).toEqual({ temperature: 0 });
    expect(body.format).toBeUndefined();
  });

  it("spells out what has not been collected instead of sending nulls", async () => {
    const { fetch, calls } = fakeFetch(() => chatReply("ok"));

    await explainStats({
      client: client(fetch),
      stats: { ...stats, following: null, mutuals: null, newFollowers: null, previousFollowersTakenAt: null, followingTakenAt: null },
    });

    const content = (calls[0]!.body as { messages: { content: string }[] }).messages[1]!.content;
    expect(content).toContain("Accounts the account follows: not collected yet (snapshot taken none)");
    expect(content).toContain("New followers since the previous snapshot: not collected yet");
    expect(content).not.toContain("null");
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
