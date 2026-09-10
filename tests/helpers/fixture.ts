import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");


export function loadFixture(name: string): Document {
  document.body.innerHTML = readFileSync(join(FIXTURES_DIR, name), "utf8");
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-scroll-height], [data-client-height]",
  )) {
    defineGeometry(element);
  }
  return document;
}

export function defineGeometry(element: HTMLElement): void {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => Number(element.dataset["scrollHeight"] ?? 0),
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => Number(element.dataset["clientHeight"] ?? 0),
  });
}
