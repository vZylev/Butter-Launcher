import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

type TocItem = {
  id: string;
  text: string;
  level: number;
};

const stripInlineMarkdown = (raw: string): string => {
  let s = String(raw ?? "");
  // links/images -> keep label
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // unescape markdown escapes like \) \( \* etc.
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1");
  // inline code + emphasis + strikethrough markers
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  // drop any leftover html tags
  s = s.replace(/<[^>]+>/g, "");
  return s.trim();
};

const flattenText = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (React.isValidElement(node)) return flattenText((node as any).props?.children);
  return "";
};

const slugify = (raw: string): string => {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");
  return s || "section";
};

// NOTE: We intentionally build the TOC from rendered heading elements (DOM)
// rather than regex-parsing markdown. That guarantees clicking a TOC entry
// scrolls to the exact section ReactMarkdown actually rendered.

const PatchNotesModal: React.FC<{
  open: boolean;
  markdownUrl: string | null;
  channel: VersionType | null;
  onClose: () => void;
}> = ({ open, markdownUrl, channel, onClose }) => {
  const { t } = useTranslation();
  const mouseDownOnBackdrop = React.useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [markdown, setMarkdown] = useState<string>("");
  const [toc, setToc] = useState<TocItem[]>([]);

  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const headingSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // When the rendered markdown changes, rebuild the TOC from actual headings.
    // We wait a tick so the DOM is updated.
    if (!open) return;
    if (loading || error || !markdown.trim()) {
      setToc([]);
      return;
    }

    let cancelled = false;
    const handle = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const root = contentScrollRef.current;
      if (!root) return;
      const els = Array.from(
        root.querySelectorAll(
          "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]",
        ),
      ) as HTMLElement[];

      const items: TocItem[] = [];
      for (const el of els) {
        const id = (el.getAttribute("id") || "").trim();
        const text = (el.textContent || "").trim();
        if (!id || !text) continue;
        const level = Number(String(el.tagName || "").slice(1)) || 1;
        items.push({ id, text, level });
      }
      setToc(items);
    });

    return () => {
      cancelled = true;
      try {
        window.cancelAnimationFrame(handle);
      } catch {
        // ignore
      }
    };
  }, [open, loading, error, markdown]);

  useEffect(() => {
    if (!open) return;
    if (!markdownUrl) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setMarkdown("");

    (async () => {
      try {
        const ipc = (window as any)?.ipcRenderer;
        const headers = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/markdown,text/plain,*/*",
        };

        const text =
          ipc && typeof ipc.invoke === "function"
            ? ((await ipc.invoke("fetch:text", markdownUrl, { headers })) as string)
            : await (async () => {
                const res = await fetch(markdownUrl, {
                  cache: "no-store",
                  headers,
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
              })();

        if (cancelled) return;
        setMarkdown(typeof text === "string" ? text : String(text ?? ""));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || t("launcher.patchNotes.failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, markdownUrl, t]);

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  const channelLabel =
    channel === "pre-release"
      ? t("launcher.version.preRelease")
      : t("launcher.version.release");

  const title = `${t("launcher.patchNotes.title")} (${channelLabel})`;

  const scrollTo = (id: string) => {
    try {
      const root = contentScrollRef.current;
      if (!root) return;
      const escape = (CSS as any)?.escape as ((v: string) => string) | undefined;
      const selector = escape ? `#${escape(id)}` : `[id="${id.replace(/"/g, "\\\"")}"]`;
      const el = root.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    } catch {
      // ignore
    }
  };

  const renderHeading = (Tag: keyof JSX.IntrinsicElements) =>
    function Heading(
      props: React.HTMLAttributes<HTMLHeadingElement> & {
        node?: unknown;
        children?: React.ReactNode;
      },
    ) {
      const { children, className, id: providedId, ...rest } = props;
      // Stable deterministic IDs derived from rendered heading text.
      const headingText = stripInlineMarkdown(flattenText(children));
      const base = slugify(headingText);
      const seen = headingSeenRef.current;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const generatedId = n === 1 ? base : `${base}-${n}`;

      const id = (providedId as string | undefined) ?? generatedId;

      return (
        <Tag
          {...(rest as any)}
          id={id}
          className={cn(
            "scroll-mt-4",
            Tag === "h1" || Tag === "h2"
              ? "text-white font-extrabold mt-6 mb-3"
              : "text-white font-bold mt-5 mb-2",
            className,
          )}
        >
          {children}
        </Tag>
      );
    };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center glass-backdrop animate-fadeIn"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={() => {
        mouseDownOnBackdrop.current = false;
      }}
      onMouseLeave={() => {
        mouseDownOnBackdrop.current = false;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
          onClose();
        }
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div
        className="relative w-[96vw] h-[90vh] rounded-xl shadow-2xl bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95 border border-[#2a3146] p-5 animate-settings-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-white font-extrabold text-lg">{title}</div>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
            onClick={onClose}
            title={t("common.close")}
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="mt-4 flex-1 min-h-0 grid grid-cols-[260px_1fr] gap-4">
          <div className="min-h-0 rounded-lg border border-[#2a3146] bg-white/5 overflow-auto p-3">
            <div className="text-xs font-bold text-gray-200 mb-2">{t("launcher.patchNotes.contents")}</div>
            {toc.length ? (
              <div className="flex flex-col gap-1">
                {toc.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "text-left text-xs rounded-md px-2 py-1 transition",
                      "hover:bg-white/10 text-gray-200 hover:text-white",
                      item.level <= 2 ? "font-semibold" : "font-normal",
                    )}
                    style={{
                      marginLeft: `${Math.min(
                        18,
                        Math.max(0, (item.level - 2) * 10),
                      )}px`,
                    }}
                    onClick={() => scrollTo(item.id)}
                    title={item.text}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400">
                {loading ? t("launcher.patchNotes.loading") : t("launcher.patchNotes.noContents")}
              </div>
            )}
          </div>

          <div
            ref={contentScrollRef}
            className="min-h-0 rounded-lg border border-[#2a3146] bg-white/5 overflow-auto p-4"
          >
            {loading ? (
              <div className="text-sm text-gray-200">{t("launcher.patchNotes.loading")}</div>
            ) : error ? (
              <div className="text-sm text-red-200 whitespace-pre-wrap">
                {t("launcher.patchNotes.failed")}
                {error ? `\n${error}` : ""}
              </div>
            ) : markdown.trim() ? (
              <div className="text-sm text-gray-200 leading-relaxed">
                {(() => {
                  // Ensure heading IDs stay stable even if ReactMarkdown re-renders.
                  headingSeenRef.current = new Map();
                  return null;
                })()}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: renderHeading("h1"),
                    h2: renderHeading("h2"),
                    h3: renderHeading("h3"),
                    h4: renderHeading("h4"),
                    h5: renderHeading("h5"),
                    h6: renderHeading("h6"),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        className="text-blue-200 hover:text-white underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {children}
                      </a>
                    ),
                    code: ({ children }) => (
                      <code className="px-1 py-0.5 rounded bg-black/30 text-gray-100 text-[12px]">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="p-3 rounded-lg bg-black/30 overflow-auto text-[12px]">
                        {children}
                      </pre>
                    ),
                    li: ({ children }) => (
                      <li className="ml-5 list-disc">{children}</li>
                    ),
                    p: ({ children }) => <p className="my-2">{children}</p>,
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-gray-400">{t("launcher.patchNotes.empty")}</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PatchNotesModal;
