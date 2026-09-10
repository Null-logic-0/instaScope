import { waitForChange } from "./wait-for-change";

export interface ClickAndWaitOptions<T> {
  until: (doc: Document) => T | null;
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function clickAndWaitFor<T>(
  control: Element,
  { until, timeoutMs, signal }: ClickAndWaitOptions<T>,
): Promise<T | null> {
  const doc = control.ownerDocument;
  const deadline = Date.now() + timeoutMs;
  (control as HTMLElement).click();

  while (true) {
    const result = until(doc);
    if (result !== null) return result;

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Nothing happened after clicking the control");

    const outcome = await waitForChange(doc.body, { timeoutMs: remaining, signal });
    if (outcome === "aborted") return null;
  }
}
