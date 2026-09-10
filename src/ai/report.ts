import type { Stats } from "../analytics";
import type { OllamaClient } from "./ollama";

export interface ReportOptions {
  client: OllamaClient;
  stats: Stats;
  signal?: AbortSignal;
  maxChars?: number;
}

export async function explainStats({ client, stats, signal, maxChars = 2000 }: ReportOptions): Promise<string> {
  const { content } = await client.chat({
    messages: [
      {
        role: "system",
        content:
          "You explain Instagram account statistics to the account owner. The numbers were computed exactly by software; " +
          "use only the numbers given and never invent figures, names or reasons. A null value means that data has not " +
          "been collected yet; say so rather than guessing. Write three to six short plain sentences, no headings, no " +
          "markdown, no growth advice. If a previous snapshot exists, describe what changed since it.",
      },
      { role: "user", content: describeStats(stats) },
    ],
    options: { temperature: 0 },
    signal,
  });
  return sanitize(content, maxChars);
}

export function describeStats(stats: Stats): string {
  const n = (value: number | null) => (value === null ? "not collected yet" : String(value));
  const date = (value: string | null) => (value ? value.slice(0, 10) : "none");
  return [
    `Account: ${stats.subject}`,
    `Followers: ${n(stats.followers)} (snapshot taken ${date(stats.followersTakenAt)})`,
    `Accounts the account follows: ${n(stats.following)} (snapshot taken ${date(stats.followingTakenAt)})`,
    `Mutual follows, both follow each other: ${n(stats.mutuals)}`,
    `Accounts the account follows that do not follow it back: ${n(stats.notFollowingBack)}`,
    `Followers the account does not follow back: ${n(stats.fans)}`,
    `Previous followers snapshot: ${date(stats.previousFollowersTakenAt)}`,
    `New followers since the previous snapshot: ${n(stats.newFollowers)}`,
    `Lost followers since the previous snapshot: ${n(stats.lostFollowers)}`,
  ].join("\n");
}

const ch = String.fromCharCode;
const CONTROL_CHARACTERS = new RegExp(
  `[${ch(0)}-${ch(8)}${ch(11)}${ch(12)}${ch(14)}-${ch(31)}${ch(127)}-${ch(159)}]`,
  "g",
);

export function sanitize(text: string, maxChars: number): string {
  const clean = text.replace(CONTROL_CHARACTERS, "").replace(/\r\n?/g, "\n").trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars)}…` : clean;
}
