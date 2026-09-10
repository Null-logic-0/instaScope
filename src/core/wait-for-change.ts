export type ChangeOutcome = "changed" | "timeout" | "aborted";

export interface WaitOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}


export function waitForChange(target: Node, { timeoutMs, signal }: WaitOptions): Promise<ChangeOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }

    const finish = (outcome: ChangeOutcome): void => {
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => finish("aborted");
    const observer = new MutationObserver(() => finish("changed"));
    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    signal?.addEventListener("abort", onAbort);
    observer.observe(target, { childList: true, subtree: true });
  });
}
