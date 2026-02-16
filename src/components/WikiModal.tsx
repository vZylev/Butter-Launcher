import React, { useMemo, useRef } from "react";
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

  const src = useMemo(() => {
    const candidate = typeof initialUrl === "string" ? initialUrl.trim() : "";
    return isWikiUrl(candidate) ? candidate : WIKI_URL;
  }, [initialUrl]);

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
          relative w-full max-w-6xl h-[560px] mx-auto
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
          <h2 className="text-lg font-semibold text-white tracking-wide">{t("launcher.buttons.wiki")}</h2>
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
