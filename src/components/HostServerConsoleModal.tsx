import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Box, HStack, IconButton, Input, Text } from "@chakra-ui/react";
import { ModalBackdrop, ModalCard, GradientButton } from "./ui";

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
    type Segment = { text: string; color: string; bold: boolean };

    const fgToColor = (code: number): string => {
      switch (code) {
        case 30: return "#e5e7eb";
        case 31: return "#f87171";
        case 32: return "#4ade80";
        case 33: return "#facc15";
        case 34: return "#60a5fa";
        case 35: return "#c084fc";
        case 36: return "#22d3ee";
        case 37: return "#f3f4f6";
        case 90: return "#9ca3af";
        case 91: return "#fca5a5";
        case 92: return "#86efac";
        case 93: return "#fde047";
        case 94: return "#93c5fd";
        case 95: return "#d8b4fe";
        case 96: return "#67e8f9";
        case 97: return "#ffffff";
        default: return "#e5e7eb";
      }
    };

    const stripOsc = (input: string) =>
      input.replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, "");

    const parseAnsi = (line: string): Segment[] => {
      let s = String(line ?? "");
      s = stripOsc(s);
      const out: Segment[] = [];
      let fgColor = "#e5e7eb";
      let bold = false;

      const pushText = (text: string) => {
        if (!text) return;
        const last = out[out.length - 1];
        if (last && last.color === fgColor && last.bold === bold) { last.text += text; return; }
        out.push({ text, color: fgColor, bold });
      };

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
          if (p === 0) { fgColor = "#e5e7eb"; bold = false; continue; }
          if (p === 1) { bold = true; continue; }
          if (p === 22) { bold = false; continue; }
          if (p === 39) { fgColor = "#e5e7eb"; continue; }
          if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) { fgColor = fgToColor(p); continue; }
        }
        lastIndex = re.lastIndex;
      }
      pushText(s.slice(lastIndex));
      for (const seg of out) {
        seg.text = seg.text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\u001b/g, "");
      }
      return out;
    };

    return logs.map((line, idx) => ({ idx, segs: parseAnsi(line) }));
  }, [logs]);

  const close = () => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 160);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHistoryIndex(null);
    setHistoryDraft("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, logs.length]);

  if (!open && !closing) return null;

  return (
    <ModalBackdrop onClose={close}>
      <ModalCard maxW="2000px" w="92vw">
        <Box h="88vh" display="flex" flexDir="column">
          <IconButton
            aria-label={t("common.close")}
            position="absolute"
            top={3}
            right={3}
            size="sm"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            rounded="full"
            onClick={close}
          >
            <IconX size={18} />
          </IconButton>

          <HStack justify="space-between" pr={10}>
            <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide">
              {t("hostServerModal.console.title")}
            </Text>
          </HStack>

          <Box
            ref={scrollRef}
            mt={4}
            flex={1}
            minH={0}
            rounded="lg"
            border="1px solid"
            borderColor="whiteAlpha.100"
            bg="rgba(15,19,32,0.72)"
            p={3}
            overflowY="auto"
            className="dark-scrollbar"
          >
            <Box fontSize="12px" lineHeight="relaxed" whiteSpace="pre-wrap" wordBreak="break-words" fontFamily="mono">
              {renderedLines.length ? (
                renderedLines.map(({ idx, segs }) => (
                  <Box key={idx}>
                    {segs.map((seg, i) => (
                      <Box
                        as="span"
                        key={i}
                        color={seg.color}
                        fontWeight={seg.bold ? "semibold" : undefined}
                      >
                        {seg.text}
                      </Box>
                    ))}
                  </Box>
                ))
              ) : (
                <Box as="span" color="#d1d5db"> </Box>
              )}
            </Box>
          </Box>

          <Box
            as="form"
            mt={3}
            display="flex"
            alignItems="center"
            gap={2}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              const cmd = command.trim();
              if (!cmd) return;
              onCommand(cmd);
              setCommandHistory((prev) => {
                const next = prev.length && prev[prev.length - 1] === cmd ? prev : [...prev, cmd];
                return next.length > 100 ? next.slice(next.length - 100) : next;
              });
              setCommand("");
              setHistoryIndex(null);
              setHistoryDraft("");
            }}
          >
            <Input
              value={command}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = e.target.value;
                if (historyIndex != null) { setHistoryIndex(null); setHistoryDraft(v); }
                setCommand(v);
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                if (!commandHistory.length) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.key === "ArrowUp") {
                  setHistoryIndex((prev) => {
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
                setHistoryIndex((prev) => {
                  if (prev == null) return null;
                  const nextIdx = prev + 1;
                  if (nextIdx >= commandHistory.length) { setCommand(historyDraft); return null; }
                  setCommand(commandHistory[nextIdx] ?? "");
                  return nextIdx;
                });
              }}
              placeholder={t("hostServerModal.console.commandPlaceholder")}
              flex={1}
              bg="rgba(20,24,36,0.85)"
              border="1px solid"
              borderColor="whiteAlpha.100"
              color="white"
              fontSize="sm"
              _placeholder={{ color: "whiteAlpha.400" }}
              _focus={{ borderColor: "rgba(96,165,250,0.6)" }}
            />
            <GradientButton type="submit">
              {t("common.send")}
            </GradientButton>
          </Box>
        </Box>
      </ModalCard>
    </ModalBackdrop>
  );
};

export default HostServerConsoleModal;
