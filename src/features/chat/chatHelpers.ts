/**
 * Chat-related text helpers — extracted from FriendsMenu.tsx.
 */

export const MAX_MSG_LINE_BREAKS = 3;

export const countLineBreaks = (raw: string): number => {
  const s = String(raw || "");
  return (s.match(/\n/g) || []).length;
};

export type HttpLinkPart = { type: "text" | "link"; value: string; href?: string };

export const splitHttpLinks = (content: string): HttpLinkPart[] => {
  const text = String(content || "");
  const parts: HttpLinkPart[] = [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  let lastIndex = 0;
  for (const match of text.matchAll(urlRegex)) {
    const raw = String(match[0] || "");
    const start = match.index ?? -1;
    if (start < 0) continue;

    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start) });
    }

    const trimmed = raw.replace(/[),.;\]]+$/g, "");
    parts.push({ type: "link", value: trimmed, href: trimmed });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
};

export const openExternalSafe = async (url: string): Promise<void> => {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return;
  try {
    const opener = (window as any)?.config?.openExternal;
    if (typeof opener === "function") {
      await opener(u);
      return;
    }
  } catch { /* ignore */ }
  try {
    window.open(u, "_blank", "noopener,noreferrer");
  } catch { /* ignore */ }
};

export const isMongoObjectId = (s: string): boolean =>
  /^[a-f0-9]{24}$/i.test(String(s || "").trim());
