export interface ScrollSimulator {
  readonly positions: number[];
}


export function simulateScrolling(
  element: Element,
  onScroll?: (top: number) => void,
): ScrollSimulator {
  const positions: number[] = [];
  let top = 0;

  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      top = Math.min(Math.max(0, value), max);
      positions.push(top);
      if (onScroll) setTimeout(() => onScroll(top), 0);
    },
  });

  return { positions };
}
