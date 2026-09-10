import { profileAnchors, type DiscoveredList } from "./discovery";

export function hasLoadingIndicator({
  list,
  scrollContainer,
}: Pick<DiscoveredList, "list" | "scrollContainer">): boolean {
  let section: Element | null = list;
  while (section && section.parentElement !== scrollContainer) {
    section = section.parentElement;
  }
  if (!section) return false;

  for (let sibling = section.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    if (sibling.querySelector("svg") !== null && profileAnchors(sibling).length === 0) {
      return true;
    }
  }
  return false;
}
