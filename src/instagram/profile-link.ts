const INSTAGRAM_ORIGIN = "https://www.instagram.com";
const INSTAGRAM_HOSTS = new Set(["www.instagram.com", "instagram.com"]);
const USERNAME = /^[a-z0-9._]{1,30}$/;

const RESERVED_PATHS = new Set([
  "explore",
  "reels",
  "reel",
  "direct",
  "stories",
  "accounts",
  "legal",
  "archive",
  "p",
  "tv",
]);


export function parseProfileHref(href: string | null | undefined): string | null {
  if (!href) return null;

  let url: URL;
  try {
    url = new URL(href, INSTAGRAM_ORIGIN);
  } catch {
    return null;
  }
  if (!INSTAGRAM_HOSTS.has(url.hostname)) return null;

  const [, segment] = /^\/([^/]+)\/?$/.exec(url.pathname) ?? [];
  if (!segment) return null;

  const username = segment.toLowerCase();
  if (!USERNAME.test(username) || RESERVED_PATHS.has(username)) return null;
  return username;
}

export function profileUrl(username: string): string {
  return `${INSTAGRAM_ORIGIN}/${username}/`;
}
