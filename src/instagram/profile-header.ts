const DIGIT = /\p{Nd}/u;

export interface ProfileStats {
  followers: Element;
  following: Element;
}

export function findProfileStats(doc: Document): ProfileStats | null {
  const header = doc.querySelector("header");
  if (!header) return null;

  for (const candidate of header.querySelectorAll("div")) {
    if (candidate.children.length !== 3) continue;
    const posts = candidate.children.item(0);
    const followers = statLink(candidate.children.item(1));
    const following = statLink(candidate.children.item(2));
    if (!posts || !followers || !following) continue;
    if (posts.querySelector("a") !== null) continue;
    if (!Array.from(candidate.children).every((cell) => DIGIT.test(cell.textContent ?? ""))) continue;
    return { followers, following };
  }
  return null;
}

function statLink(cell: Element | null): Element | null {
  return cell?.querySelector('a[href="#"]') ?? null;
}
