export type SanitizeTextOptions = {
  maxLength?: number;
};

// Sanitization: because the internet cannot be trusted. Ever.

const stripControlChars = (s: string): string =>
  // Keep \t, \n, \r. Strip other C0 controls + DEL.
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const clamp = (s: string, maxLength?: number): string => {
  if (!maxLength || maxLength <= 0) return s;
  if (s.length <= maxLength) return s;
  return s.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
};

/**
 * Converts a possibly-HTML string into plain text.
 *
 * This is intended for remote/untrusted content (news feeds, mod descriptions, etc.)
 * to avoid XSS. It does not preserve arbitrary HTML; it intentionally strips it.
 */
export const stripHtmlToText = (
  input: unknown,
  options: SanitizeTextOptions = {},
): string => {
  const raw = typeof input === "string" ? input : "";
  if (!raw) return "";

  // Preserve basic line breaks from common tags before parsing.
  const withBreaks = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*div\s*>/gi, "\n")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*li\s*>/gi, "• ");

  let text = withBreaks;

  try {
    if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(withBreaks, "text/html");
      text = doc.body.textContent ?? "";
    } else {
      // Very small fallback for non-DOM environments.
      text = withBreaks.replace(/<[^>]*>/g, "");
    }
  } catch {
    text = withBreaks.replace(/<[^>]*>/g, "");
  }

  text = stripControlChars(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.trim();

  return clamp(text, options.maxLength);
};

export const sanitizeHtmlAllowImages = (
  input: unknown,
  opts?: { maxLength?: number },
): string => {
  const maxLength = typeof opts?.maxLength === "number" ? opts.maxLength : 200_000;
  const raw = typeof input === "string" ? input : "";
  if (!raw) return "";

  // Renderer only: DOMParser should exist.
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // Fallback to plain text.
    const text = stripHtmlToText(raw, { maxLength: Math.min(maxLength, 20000) });
    return text ? `<pre>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>` : "";
  }

  const allowedTags = new Set([
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "code",
    "pre",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "img",
    "hr",
    "span",
    "div",
  ]);

  // Use a detached wrapper element as the sanitation root.
  // This avoids edge-cases where DOMParser() yields a document with a null body.
  const parser = new DOMParser();
  const doc = parser.parseFromString("<!doctype html><html><body></body></html>", "text/html");
  const root = doc.createElement("div");
  root.innerHTML = raw;

  const isSafeUrl = (url: string) => {
    try {
      const u = new URL(url, window.location.origin);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  };

  const walk = (node: Node) => {
    // Remove comments
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      // Drop dangerous elements entirely
      if (
        [
          "script",
          "style",
          "iframe",
          "object",
          "embed",
          "link",
          "meta",
          "form",
          "input",
          "button",
          "textarea",
          "select",
          "video",
          "audio",
          "canvas",
        ].includes(tag)
      ) {
        el.remove();
        return;
      }

      // Convert anchors to plain text (avoid navigation)
      if (tag === "a") {
        const text = doc.createTextNode(el.textContent ?? "");
        el.replaceWith(text);
        return;
      }

      // Strip tags not in allowlist but keep children (unwrap)
      if (!allowedTags.has(tag)) {
        const fragment = doc.createDocumentFragment();
        while (el.firstChild) fragment.appendChild(el.firstChild);
        el.replaceWith(fragment);
        return;
      }

      // Remove event handlers + style
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(attr.name);
        }
      }

      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        if (!src || !isSafeUrl(src)) {
          el.remove();
          return;
        }

        // Keep only safe img attributes
        const alt = el.getAttribute("alt") || "";
        el.setAttribute("loading", "lazy");
        el.setAttribute("decoding", "async");
        if (alt) el.setAttribute("alt", alt);

        for (const attr of Array.from(el.attributes)) {
          const n = attr.name.toLowerCase();
          if (!["src", "alt", "loading", "decoding"].includes(n)) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }

    // Recurse children
    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
  };

  walk(root);

  const html = (root.innerHTML || "").slice(0, maxLength);
  return html;
};
