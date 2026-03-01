import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

const WIKI_URL = "https://hytalewiki.org/";
const WIKI_PARTITION = "persist:wikiviewer";

const isWikiUrl = (raw: string): boolean => {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (s === "about:blank") return true;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    return (u.protocol === "https:" || u.protocol === "http:") && (host === "hytalewiki.org" || host.endsWith(".hytalewiki.org"));
  } catch {
    return false;
  }
};

const WikiModal: React.FC<{
  open: boolean;
  initialUrl?: string | null;
  onClose: (lastUrl: string | null) => void;
  onUrlChange?: (url: string) => void;
}> = ({ open, initialUrl, onClose, onUrlChange }) => {
  const { t } = useTranslation();
  const webviewRef = useRef<any>(null);
  const [currentUrl, setCurrentUrl] = useState<string>(WIKI_URL);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);
  const wikiCssInjectedRef = useRef(false);

  const showCopied = () => {
    setCopied(true);
    if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimeoutRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    if (!open) return;

    const onLinkCopied = () => {
      showCopied();
    };

    try {
      window.ipcRenderer?.on?.("wiki:link-copied", onLinkCopied as any);
    } catch {
      // ignore
    }

    return () => {
      try {
        window.ipcRenderer?.off?.("wiki:link-copied", onLinkCopied as any);
      } catch {
        // ignore
      }
    };
  }, [open]);

  const src = useMemo(() => {
    const candidate = typeof initialUrl === "string" ? initialUrl.trim() : "";
    return isWikiUrl(candidate) ? candidate : WIKI_URL;
  }, [initialUrl]);

  useEffect(() => {
    // Keep the displayed URL in sync with the webview navigation.
    if (!open) return;

    let active = true;
    setCurrentUrl(src);

    const w = webviewRef.current;
    if (!w) return;

    const update = (maybeUrl?: unknown) => {
      if (!active) return;

      const raw = typeof maybeUrl === "string" ? maybeUrl : w?.getURL?.();
      if (typeof raw !== "string") return;
      if (!isWikiUrl(raw)) return;

      setCurrentUrl(raw);
      try {
        onUrlChange?.(raw);
      } catch {
        // ignore
      }
    };

    const onDidNavigate = (ev: any) => update(ev?.url);
    const onDidNavigateInPage = (ev: any) => update(ev?.url);
    const injectWikiCss = () => {
      if (wikiCssInjectedRef.current) return;
      wikiCssInjectedRef.current = true;

      try {
        void w.insertCSS?.(`
          html, body {
            overflow-x: hidden !important;
            max-width: 100vw !important;
          }

          /* Prevent common overflow culprits */
          img, video, canvas, svg, iframe {
            max-width: 100% !important;
            height: auto !important;
          }

          pre, code {
            white-space: pre-wrap !important;
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
          }

          table {
            max-width: 100% !important;
          }
        `);
      } catch {
        // ignore
      }
    };

    const onDomReady = () => {
      injectWikiCss();
      update();
    };

    try {
      w.addEventListener?.("did-navigate", onDidNavigate);
      w.addEventListener?.("did-navigate-in-page", onDidNavigateInPage);
      w.addEventListener?.("dom-ready", onDomReady);
    } catch {
      // ignore
    }

    // Best-effort initial sync.
    const t0 = setTimeout(() => update(), 50);

    return () => {
      active = false;
      clearTimeout(t0);
      try {
        w.removeEventListener?.("did-navigate", onDidNavigate);
        w.removeEventListener?.("did-navigate-in-page", onDidNavigateInPage);
        w.removeEventListener?.("dom-ready", onDomReady);
      } catch {
        // ignore
      }
    };
  }, [open, src, onUrlChange]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    };
  }, []);

  const copyCurrentUrl = async () => {
    const url = String(currentUrl ?? "").trim();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      showCopied();
      return;
    } catch {
      // ignore
    }

    // Fallback: older Electron clipboard restrictions.
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showCopied();
    } catch {
      // ignore
    }
  };

  const closeWithState = () => {
    try {
      const url = webviewRef.current?.getURL?.();
      if (typeof url === "string" && isWikiUrl(url)) {
        onClose(url);
        return;
      }
    } catch {
      // ignore
    }
    onClose(null);
  };

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in"
      onClick={closeWithState}
      role="dialog"
      aria-modal="true"
      aria-label={t("launcher.buttons.wiki")}
    >
      <div
        className={cn(
          `
          relative w-[92vw] max-w-[2400px] h-[88vh] mx-auto
          rounded-xl
          bg-linear-to-b from-[#1b2030]/70 to-[#141824]/70
          border border-white/10
          shadow-2xl
          px-4 py-4
          flex flex-col animate-settings-in`,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
          onClick={closeWithState}
          title={t("common.close")}
        >
          <IconX size={18} />
        </button>

        <div className="flex items-center justify-between gap-3 mb-3 pr-12">
          <div className="w-full min-w-0">
            <h2 className="text-lg font-semibold text-white tracking-wide">{t("launcher.buttons.wiki")}</h2>

            <div className="mt-2 flex items-center gap-2 min-w-0">
              <div className="shrink-0 text-[11px] text-white/60 font-semibold">
                {t("wikiModal.currentUrl")}
              </div>

              <input
                readOnly
                value={currentUrl}
                className={cn(
                  "no-drag flex-1 min-w-0 px-3 py-1.5 rounded-md",
                  "bg-black/25 border border-white/10",
                  "text-[11px] text-white/85 font-mono",
                  "outline-none focus:border-blue-400/60",
                  "leading-tight",
                  "cursor-pointer",
                )}
                onClick={() => void copyCurrentUrl()}
                onFocus={(e) => e.currentTarget.select()}
                title={t("wikiModal.copyHint")}
              />

              <div
                className={cn(
                  "shrink-0 w-16 text-right text-[11px] font-semibold",
                  copied ? "text-green-300" : "text-transparent",
                )}
              >
                {t("common.copied")}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-white/10 bg-black/20">
          {/*
            Electron <webview> provides a real browser-like experience.
            Navigation is domain-restricted in the main process (see electron/main.ts).
          */}
          <webview
            ref={webviewRef}
            src={src}
            partition={WIKI_PARTITION}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default WikiModal;
