export type AddressPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const MAP_HOST =
  /^(?:https?:\/\/)?(?:www\.)?(?:maps\.(?:google\.[a-z.]+|app\.goo\.gl)|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page)/i;

const URL_IN_TEXT = /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?'"')\]]/gi;

export function normalizeExternalHref(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** True when the whole value is (or contains only) an external web / maps link. */
export function isExternalLinkText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  if (MAP_HOST.test(t)) return true;
  return false;
}

/** Split address text into plain text and clickable URL segments. */
export function parseAddressParts(text: string): AddressPart[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (isExternalLinkText(trimmed)) {
    return [{ type: "link", value: trimmed, href: normalizeExternalHref(trimmed) }];
  }

  const parts: AddressPart[] = [];
  let lastIndex = 0;
  for (const match of trimmed.matchAll(URL_IN_TEXT)) {
    const url = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      const chunk = trimmed.slice(lastIndex, index);
      if (chunk.trim()) parts.push({ type: "text", value: chunk });
    }
    parts.push({ type: "link", value: url, href: normalizeExternalHref(url) });
    lastIndex = index + url.length;
  }

  if (lastIndex < trimmed.length) {
    parts.push({ type: "text", value: trimmed.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: trimmed }];
}
