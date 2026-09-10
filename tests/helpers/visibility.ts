export function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

export function resetVisibility(): void {
  delete (document as { visibilityState?: unknown }).visibilityState;
}
