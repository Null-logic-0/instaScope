import { defineGeometry } from "./fixture";
import { simulateScrolling, type ScrollSimulator } from "./scroll-simulator";

export function rowHtml(username: string, displayName = `Name of ${username}`): string {
  return `<div><div><a href="/${username}/" role="link"><div><span dir="auto">${username}</span></div></a></div><span dir="auto"><span>${displayName}</span></span></div>`;
}

export function usernames(count: number, prefix = "user"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

export interface FakeList {
  root: HTMLElement;
  container: HTMLElement;
  list: HTMLElement;
  simulator: ScrollSimulator;
  readonly maxTop: number;
  appendRows(names: string[]): void;
  replaceRows(names: string[]): void;
  setScrollHeight(px: number): void;
  removeSpinner(): void;
}

export interface FakeListOptions {
  usernames: string[];
  viewport?: number;
  rowHeight?: number;
  spinner?: boolean;
  onScroll?: (top: number, list: FakeList) => void;
}

const SPINNER_HEIGHT = 40;

export function fakeDialog(options: FakeListOptions): FakeList {
  const { viewport = 300, rowHeight = 60, spinner = true, onScroll } = options;
  document.body.innerHTML = `
    <div role="dialog" aria-modal="true">
      <div><div role="heading" aria-level="1">Following</div></div>
      <div style="overflow-y: auto" data-client-height="${viewport}" data-scroll-height="0" data-test="container">
        <div style="overflow-y: auto"><div data-test="list"></div></div>
        ${spinner ? '<div data-test="spinner"><div><svg aria-label="Loading..." role="img"></svg></div></div>' : ""}
      </div>
    </div>`;

  const root = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const container = root.querySelector<HTMLElement>('[data-test="container"]')!;
  const list = root.querySelector<HTMLElement>('[data-test="list"]')!;
  defineGeometry(container);

  const spinnerHeight = () => (root.querySelector('[data-test="spinner"]') ? SPINNER_HEIGHT : 0);
  const fitHeight = () => fake.setScrollHeight(list.children.length * rowHeight + spinnerHeight());

  const fake: FakeList = {
    root,
    container,
    list,
    simulator: { positions: [] },
    get maxTop() {
      return Math.max(0, container.scrollHeight - container.clientHeight);
    },
    appendRows(names) {
      list.insertAdjacentHTML("beforeend", names.map((name) => rowHtml(name)).join(""));
      fitHeight();
    },
    replaceRows(names) {
      list.innerHTML = names.map((name) => rowHtml(name)).join("");
    },
    setScrollHeight(px) {
      container.dataset["scrollHeight"] = String(px);
    },
    removeSpinner() {
      root.querySelector('[data-test="spinner"]')?.remove();
      fitHeight();
    },
  };

  fake.simulator = simulateScrolling(container, onScroll && ((top) => onScroll(top, fake)));
  fake.appendRows(options.usernames);
  return fake;
}

export function fakePage(options: { usernames: string[]; viewport?: number; rowHeight?: number }): {
  root: HTMLElement;
  simulator: ScrollSimulator;
} {
  const { viewport = 900, rowHeight = 60 } = options;
  document.body.innerHTML = `
    <main role="main"><div><div data-test="list">${options.usernames.map((name) => rowHtml(name)).join("")}</div></div></main>`;

  const html = document.documentElement;
  html.dataset["clientHeight"] = String(viewport);
  html.dataset["scrollHeight"] = String(options.usernames.length * rowHeight);
  defineGeometry(html);

  return { root: document.querySelector("main")!, simulator: simulateScrolling(html) };
}
