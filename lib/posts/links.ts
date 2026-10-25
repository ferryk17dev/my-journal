export function isAllowedPostLink(href: string) {
  if (href.length === 0 || href.length > 2_048 || href.trim() !== href) {
    return false;
  }

  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}
