import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, HStack, IconButton, Input, Text } from "@chakra-ui/react";
import { IconArrowLeft } from "@tabler/icons-react";

const WIKI_URL = "https://hytalewiki.org/";
const WIKI_PARTITION = "persist:wikiviewer";

const isWikiUrl = (raw: string): boolean => {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (s === "about:blank") return true;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    return (u.protocol === "https:" || u.protocol === "http:") &&
           (host === "hytalewiki.org" || host.endsWith(".hytalewiki.org"));
  } catch { return false; }
};

const WikiPanel: React.FC<{
  initialUrl?: string | null;
  onClose: (lastUrl: string | null) => void;
  onUrlChange?: (url: string) => void;
}> = ({ initialUrl, onClose, onUrlChange }) => {
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
    const onLinkCopied = () => showCopied();
    try { window.ipcRenderer?.on?.("wiki:link-copied", onLinkCopied as any); } catch {}
    return () => {
      try { window.ipcRenderer?.off?.("wiki:link-copied", onLinkCopied as any); } catch {}
    };
  }, []);

  const src = useMemo(() => {
    const candidate = typeof initialUrl === "string" ? initialUrl.trim() : "";
    return isWikiUrl(candidate) ? candidate : WIKI_URL;
  }, [initialUrl]);

  useEffect(() => {
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
      try { onUrlChange?.(raw); } catch {}
    };

    const injectWikiCss = () => {
      if (wikiCssInjectedRef.current) return;
      wikiCssInjectedRef.current = true;
      try {
        void w.insertCSS?.(`
          html, body { overflow-x:hidden!important; max-width:100vw!important; }
          img, video, canvas, svg, iframe { max-width:100%!important; height:auto!important; }
          pre, code { white-space:pre-wrap!important; word-break:break-word!important; overflow-wrap:anywhere!important; }
          table { max-width:100%!important; }
        `);
      } catch {}
    };

    const onDomReady = () => { injectWikiCss(); update(); };
    try {
      w.addEventListener?.("did-navigate", (ev: any) => update(ev?.url));
      w.addEventListener?.("did-navigate-in-page", (ev: any) => update(ev?.url));
      w.addEventListener?.("dom-ready", onDomReady);
    } catch {}

    const t0 = setTimeout(() => update(), 50);
    return () => {
      active = false;
      clearTimeout(t0);
      try {
        w.removeEventListener?.("did-navigate", (ev: any) => update(ev?.url));
        w.removeEventListener?.("did-navigate-in-page", (ev: any) => update(ev?.url));
        w.removeEventListener?.("dom-ready", onDomReady);
      } catch {}
    };
  }, [src, onUrlChange]);

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
    try { await navigator.clipboard.writeText(url); showCopied(); return; } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.style.top = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); showCopied();
    } catch {}
  };

  return (
    <Box
      position="relative"
      w="full"
      h="full"
      rounded="xl"
      bg="linear-gradient(to bottom, rgba(27,32,48,0.72), rgba(20,24,36,0.72))"
      border="1px solid"
      borderColor="whiteAlpha.100"
      px={4}
      py={4}
      display="flex"
      flexDir="column"
    >

        <HStack pr={2} mb={3} gap={2}>
          <IconButton
            aria-label={t("common.close")}
            size="sm"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            rounded="full"
            flexShrink={0}
            onClick={() => {
              try {
                const url = webviewRef.current?.getURL?.();
                if (typeof url === "string" && isWikiUrl(url)) { onClose(url); return; }
              } catch {}
              onClose(null);
            }}
          >
            <IconArrowLeft size={18} />
          </IconButton>
          <Box flex={1} minW={0}>
          <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide">
            {t("launcher.buttons.wiki")}
          </Text>
          <HStack mt={2} gap={2} minW={0}>
            <Text fontSize="11px" color="whiteAlpha.500" fontWeight="semibold" flexShrink={0}>
              {t("wikiModal.currentUrl")}
            </Text>
            <Input
              readOnly
              value={currentUrl}
              className="no-drag"
              flex={1}
              minW={0}
              px={3}
              py={1.5}
              h="auto"
              rounded="md"
              bg="blackAlpha.300"
              border="1px solid"
              borderColor="whiteAlpha.100"
              fontSize="11px"
              color="whiteAlpha.800"
              fontFamily="mono"
              _focus={{ borderColor: "rgba(96,165,250,0.6)" }}
              cursor="pointer"
              onClick={() => void copyCurrentUrl()}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select()}
              title={t("wikiModal.copyHint")}
            />
            <Text
              fontSize="11px"
              fontWeight="semibold"
              flexShrink={0}
              w={16}
              textAlign="right"
              color={copied ? "green.300" : "transparent"}
            >
              {t("common.copied")}
            </Text>
          </HStack>
          </Box>
        </HStack>

        <Box
          flex={1}
          minH={0}
          rounded="lg"
          overflow="hidden"
          border="1px solid"
          borderColor="whiteAlpha.100"
          bg="blackAlpha.400"
        >
          <webview
            ref={webviewRef}
            src={src}
            partition={WIKI_PARTITION}
            style={{ width: "100%", height: "100%", display: "flex" }}
          />
        </Box>
    </Box>
  );
};

export default WikiPanel;
