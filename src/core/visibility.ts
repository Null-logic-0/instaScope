export type VisibilityOutcome = "visible" | "aborted";

export function isHidden(doc: Document): boolean {
  return doc.visibilityState === "hidden";
}

export function waitUntilVisible(doc: Document, signal?: AbortSignal): Promise<VisibilityOutcome> {
  return new Promise((resolve) => {
    if (!isHidden(doc)) {
      resolve("visible");
      return;
    }
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }

    const finish = (outcome: VisibilityOutcome): void => {
      doc.removeEventListener("visibilitychange", onChange);
      signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onChange = (): void => {
      if (!isHidden(doc)) finish("visible");
    };
    const onAbort = (): void => finish("aborted");

    doc.addEventListener("visibilitychange", onChange);
    signal?.addEventListener("abort", onAbort);
  });
}
