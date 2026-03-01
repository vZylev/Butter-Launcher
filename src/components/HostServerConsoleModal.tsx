import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

const HostServerConsoleModal: React.FC<{
  open: boolean;
  onClose: () => void;
  logs: string[];
  onCommand: (command: string) => void;
}> = ({ open, onClose, logs, onCommand }) => {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const renderedLines = useMemo(() => {
    type Segment = { text: string; className: string };

    const fgToClass = (code: number): string => {
      switch (code) {
        // Standard
        case 30:
          return "text-gray-200"; // black (keep readable on dark bg)
        case 31:
          return "text-red-400";
        case 32:
          return "text-green-400";
        case 33:
          return "text-yellow-400";
        case 34:
          return "text-blue-400";
        case 35:
          return "text-purple-400";
        case 36:
          return "text-cyan-400";
        case 37:
          return "text-gray-100";
        // Bright
        case 90:
          return "text-gray-400";
        case 91:
          return "text-red-300";
        case 92:
          return "text-green-300";
        case 93:
          return "text-yellow-300";
        case 94:
          return "text-blue-300";
        case 95:
          return "text-purple-300";
        case 96:
          return "text-cyan-300";
        case 97:
          return "text-white";
        default:
          return "text-gray-200";
      }
    };

    const stripOsc = (input: string) => {
      // OSC: ESC ] ... BEL or ESC \
      return input.replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, "");
    };

    const parseAnsi = (line: string): Segment[] => {
      let s = String(line ?? "");
      s = stripOsc(s);

      const out: Segment[] = [];
      let fgClass = "text-gray-200";
      let bold = false;

      const pushText = (text: string) => {
        if (!text) return;
        const className = cn(fgClass, bold && "font-semibold");
        const last = out[out.length - 1];
        if (last && last.className === className) {
          last.text += text;
          return;
        }
        out.push({ text, className });
      };

      // SGR sequences: ESC [ ... m
      const re = /\u001b\[((?:\d{1,3};?)*)m/g;
      let lastIndex = 0;
      for (;;) {
        const match = re.exec(s);
        if (!match) break;

        pushText(s.slice(lastIndex, match.index));

        const paramsRaw = match[1];
        const params = paramsRaw
          ? paramsRaw.split(";").filter(Boolean).map((p) => Number.parseInt(p, 10))
          : [0];

        for (const p of params) {
          if (!Number.isFinite(p)) continue;
          if (p === 0) {
            fgClass = "text-gray-200";
            bold = false;
            continue;
          }
          if (p === 1) {
            bold = true;
            continue;
          }
          if (p === 22) {
            bold = false;
            continue;
          }
          if (p === 39) {
            fgClass = "text-gray-200";
            continue;
          }
          if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) {
            fgClass = fgToClass(p);
            continue;
          }
          // Ignore other SGR params (background, underline, etc.) for now.
        }

        lastIndex = re.lastIndex;
      }

      pushText(s.slice(lastIndex));

      // Remove any leftover ESC chars/control sequences that weren't SGR.
      for (const seg of out) {
        seg.text = seg.text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\u001b/g, "");
      }

      return out;
    };

    return logs.map((line, idx) => ({ idx, segs: parseAnsi(line) }));
  }, [logs]);

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 160);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // When opening the modal, reset the navigation cursor but keep history.
    setHistoryIndex(null);
    setHistoryDraft("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Scroll to bottom when logs change.
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, logs.length]);

  if (!open && !closing) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in"
      onClick={close}
    >
      <div
        className={cn(
          "relative w-[92vw] max-w-[2000px] h-[88vh] mx-auto rounded-xl",
          "bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95 border border-[#2a3146]",
          "shadow-2xl px-6 py-5 flex flex-col animate-settings-in",
          closing && "animate-settings-out",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
          onClick={close}
          title={t("common.close")}
        >
          <IconX size={18} />
        </button>

        <div className="flex items-center justify-between pr-10">
          <h2 className="text-lg font-semibold text-white tracking-wide">
            {t("hostServerModal.console.title")}
          </h2>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            "mt-4 flex-1 min-h-0 rounded-lg border border-[#2a3146]",
            "bg-[#0f1320]/70 p-3 overflow-y-auto dark-scrollbar",
          )}
        >
          <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words font-mono">
            {renderedLines.length ? (
              renderedLines.map(({ idx, segs }) => (
                <div key={idx}>
                  {segs.map((seg, i) => (
                    <span key={i} className={seg.className}>
                      {seg.text}
                    </span>
                  ))}
                </div>
              ))
            ) : (
              <span className="text-gray-200"> </span>
            )}
          </div>
        </div>

        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const cmd = command.trim();
            if (!cmd) return;
            onCommand(cmd);

            setCommandHistory((prev) => {
              const next = prev.length && prev[prev.length - 1] === cmd ? prev : [...prev, cmd];
              // Keep history bounded.
              return next.length > 100 ? next.slice(next.length - 100) : next;
            });

            setCommand("");
            setHistoryIndex(null);
            setHistoryDraft("");
          }}
        >
          <input
            value={command}
            onChange={(e) => {
              const v = e.target.value;
              // If user types while navigating history, exit history mode.
              if (historyIndex != null) {
                setHistoryIndex(null);
                setHistoryDraft(v);
              }
              setCommand(v);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              if (!commandHistory.length) return;

              // Prevent cursor movement / parent handlers.
              e.preventDefault();
              e.stopPropagation();

              if (e.key === "ArrowUp") {
                setHistoryIndex((prev) => {
                  // Enter history navigation from the current draft.
                  if (prev == null) {
                    setHistoryDraft(command);
                    const nextIdx = commandHistory.length - 1;
                    setCommand(commandHistory[nextIdx] ?? "");
                    return nextIdx;
                  }

                  const nextIdx = Math.max(0, prev - 1);
                  setCommand(commandHistory[nextIdx] ?? "");
                  return nextIdx;
                });
                return;
              }

              // ArrowDown
              setHistoryIndex((prev) => {
                if (prev == null) return null;

                const nextIdx = prev + 1;
                if (nextIdx >= commandHistory.length) {
                  // Past the newest entry: restore draft (often empty).
                  setCommand(historyDraft);
                  return null;
                }

                setCommand(commandHistory[nextIdx] ?? "");
                return nextIdx;
              });
            }}
            placeholder={t("hostServerModal.console.commandPlaceholder")}
            className="flex-1 px-3 py-2 rounded-lg bg-[#141824]/80 border border-[#2a3146] text-white text-sm outline-none focus:border-blue-400/60"
          />
          <button
            type="submit"
            className={cn(
              "px-4 py-2 rounded-lg border border-white/10 text-white font-bold",
              "bg-linear-to-r from-[#0268D4] to-[#02D4D4]",
              "hover:scale-[1.02] transition",
            )}
          >
            {t("common.send")}
          </button>
        </form>
      </div>
    </div>
  );
};

export default HostServerConsoleModal;
