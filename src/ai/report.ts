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
      { role: "user", content: JSON.stringify(stats, null, 2) },
    ],
    options: { temperature: 0.3 },
    signal,
  });
  return sanitize(content, maxChars);
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
