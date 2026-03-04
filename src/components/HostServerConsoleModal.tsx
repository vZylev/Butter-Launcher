import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Box, Button, HStack, IconButton, Input, Text } from "@chakra-ui/react";

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
        case 30: return "text-gray-200";
        case 31: return "text-red-400";
        case 32: return "text-green-400";
        case 33: return "text-yellow-400";
        case 34: return "text-blue-400";
        case 35: return "text-purple-400";
        case 36: return "text-cyan-400";
        case 37: return "text-gray-100";
        case 90: return "text-gray-400";
        case 91: return "text-red-300";
        case 92: return "text-green-300";
        case 93: return "text-yellow-300";
        case 94: return "text-blue-300";
        case 95: return "text-purple-300";
        case 96: return "text-cyan-300";
        case 97: return "text-white";
        default: return "text-gray-200";
      }
    };

    const stripOsc = (input: string) =>
      input.replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, "");

    const parseAnsi = (line: string): Segment[] => {
      let s = String(line ?? "");
      s = stripOsc(s);
      const out: Segment[] = [];
      let fgClass = "text-gray-200";
      let bold = false;

      const pushText = (text: string) => {
        if (!text) return;
        const className = fgClass + (bold ? " font-semibold" : "");
        const last = out[out.length - 1];
        if (last && last.className === className) { last.text += text; return; }
        out.push({ text, className });
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
          if (p === 0) { fgClass = "text-gray-200"; bold = false; continue; }
          if (p === 1) { bold = true; continue; }
          if (p === 22) { bold = false; continue; }
          if (p === 39) { fgClass = "text-gray-200"; continue; }
          if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) { fgClass = fgToClass(p); continue; }
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
    <Box
      className="glass-backdrop animate-fade-in"
      position="fixed"
      inset={0}
      zIndex={50}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onClick={close}
    >
      <Box
        className={closing ? "animate-settings-out" : "animate-settings-in"}
        position="relative"
        w="92vw"
        maxW="2000px"
        h="88vh"
        mx="auto"
        rounded="xl"
        bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
        border="1px solid"
        borderColor="whiteAlpha.100"
        shadow="2xl"
        px={6}
        py={5}
        display="flex"
        flexDir="column"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
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
                <div key={idx}>
                  {segs.map((seg, i) => (
                    <span key={i} className={seg.className}>{seg.text}</span>
                  ))}
                </div>
              ))
            ) : (
              <span style={{ color: "#d1d5db" }}> </span>
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
          <Button
            type="submit"
            color="white"
            fontWeight="bold"
            style={{ background: "linear-gradient(90deg,#0268D4,#02D4D4)" }}
            _hover={{ opacity: 0.9 }}
          >
            {t("common.send")}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default HostServerConsoleModal;
