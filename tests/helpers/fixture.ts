import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

// Loads tests/fixtures/<name> into the document body. happy-dom has no layout
// engine, so scrollHeight/clientHeight are always 0; fixtures declare the
// geometry observed in a real browser through data-scroll-height and
// data-client-height, exposed as live getters so a test can simulate content
// growth by editing the attribute.
export function loadFixture(name: string): Document {
  document.body.innerHTML = readFileSync(join(FIXTURES_DIR, name), "utf8");
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-scroll-height], [data-client-height]",
  )) {
    defineGeometry(element);
  }
  return document;
}

function defineGeometry(element: HTMLElement): void {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => Number(element.dataset["scrollHeight"] ?? 0),
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => Number(element.dataset["clientHeight"] ?? 0),
  });
}
