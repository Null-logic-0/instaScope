export interface ScrollPosition {
  top: number;
  height: number;
  viewport: number;
  atBottom: boolean;
}

export function readScrollPosition(element: Element): ScrollPosition {
  const { scrollTop: top, scrollHeight: height, clientHeight: viewport } = element;
  return { top, height, viewport, atBottom: top + viewport >= height - 1 };
}


export function scrollForward(element: Element): ScrollPosition {
  const before = readScrollPosition(element);
  const max = Math.max(0, before.height - before.viewport);
  element.scrollTop = Math.min(before.top + before.viewport, max);
  return readScrollPosition(element);
}
