import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, Grid, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { IconX } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "./ui";

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

  const renderHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) =>
    function Heading(
      props: React.HTMLAttributes<HTMLHeadingElement> & {
        node?: unknown;
        children?: React.ReactNode;
      },
    ) {
      const { children, className: _className, id: providedId, ...rest } = props;
      // Stable deterministic IDs derived from rendered heading text.
      const headingText = stripInlineMarkdown(flattenText(children));
      const base = slugify(headingText);
      const seen = headingSeenRef.current;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const generatedId = n === 1 ? base : `${base}-${n}`;

      const id = (providedId as string | undefined) ?? generatedId;
      const isLarge = level <= 2;

      return (
        <Box
          as={`h${level}` as any}
          {...(rest as any)}
          id={id}
          scrollMarginTop={4}
          color="white"
          fontWeight={isLarge ? "extrabold" : "bold"}
          mt={isLarge ? 6 : 5}
          mb={isLarge ? 3 : 2}
        >
          {children}
        </Box>
      );
    };

  return createPortal(
    <ModalBackdrop onClose={onClose}>
      <Box
        position="relative"
        w="96vw"
        h="90vh"
        rounded="xl"
        shadow="2xl"
        bgGradient="to-b"
        gradientFrom="rgba(27,32,48,0.95)"
        gradientTo="rgba(20,24,36,0.95)"
        border="1px solid #2a3146"
        p={5}
        className="animate-settings-in"
        display="flex"
        flexDir="column"
        onClick={(e) => e.stopPropagation()}
      >
        <HStack justify="space-between" align="flex-start" gap={4}>
          <Text color="white" fontWeight="extrabold" fontSize="lg">{title}</Text>
          <IconButton
            aria-label={t("common.close")}
            size="sm"
            w={8}
            h={8}
            rounded="full"
            bg="#23293a"
            color="gray.400"
            _hover={{ color: "white", bg: "#2f3650" }}
            onClick={onClose}
          >
            <IconX size={20} />
          </IconButton>
        </HStack>

        <Grid
          mt={4}
          flex={1}
          minH={0}
          templateColumns="260px 1fr"
          gap={4}
        >
          {/* TOC Sidebar */}
          <Box
            minH={0}
            rounded="lg"
            border="1px solid #2a3146"
            bg="whiteAlpha.50"
            overflowY="auto"
            p={3}
            className="dark-scrollbar"
          >
            <Text fontSize="xs" fontWeight="bold" color="gray.200" mb={2}>
              {t("launcher.patchNotes.contents")}
            </Text>
            {toc.length ? (
              <VStack gap={1} align="stretch">
                {toc.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    justifyContent="flex-start"
                    size="xs"
                    px={2}
                    py={1}
                    borderRadius="md"
                    color="gray.200"
                    fontWeight={item.level <= 2 ? "semibold" : "normal"}
                    _hover={{ bg: "whiteAlpha.100", color: "white" }}
                    ml={`${Math.min(18, Math.max(0, (item.level - 2) * 10))}px`}
                    onClick={() => scrollTo(item.id)}
                    title={item.text}
                  >
                    {item.text}
                  </Button>
                ))}
              </VStack>
            ) : (
              <Text fontSize="xs" color="gray.400">
                {loading ? t("launcher.patchNotes.loading") : t("launcher.patchNotes.noContents")}
              </Text>
            )}
          </Box>

          {/* Content */}
          <Box
            ref={contentScrollRef}
            minH={0}
            rounded="lg"
            border="1px solid #2a3146"
            bg="whiteAlpha.50"
            overflowY="auto"
            p={4}
            className="dark-scrollbar"
          >
            {loading ? (
              <Text fontSize="sm" color="gray.200">{t("launcher.patchNotes.loading")}</Text>
            ) : error ? (
              <Text fontSize="sm" color="red.200" whiteSpace="pre-wrap">
                {t("launcher.patchNotes.failed")}
                {error ? `\n${error}` : ""}
              </Text>
            ) : markdown.trim() ? (
              <Box fontSize="sm" color="gray.200" lineHeight="relaxed">
                {(() => {
                  headingSeenRef.current = new Map();
                  return null;
                })()}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: renderHeading(1),
                    h2: renderHeading(2),
                    h3: renderHeading(3),
                    h4: renderHeading(4),
                    h5: renderHeading(5),
                    h6: renderHeading(6),
                    a: ({ href, children }) => (
                      <Box
                        as="a"
                        href={href}
                        color="blue.200"
                        _hover={{ color: "white" }}
                        textDecoration="underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {children}
                      </Box>
                    ),
                    code: ({ children }) => (
                      <Box
                        as="code"
                        px={1}
                        py="2px"
                        rounded="sm"
                        bg="blackAlpha.500"
                        color="gray.100"
                        fontSize="12px"
                      >
                        {children}
                      </Box>
                    ),
                    pre: ({ children }) => (
                      <Box
                        as="pre"
                        p={3}
                        rounded="lg"
                        bg="blackAlpha.500"
                        overflow="auto"
                        fontSize="12px"
                      >
                        {children}
                      </Box>
                    ),
                    li: ({ children }) => (
                      <Box as="li" ml={5} listStyleType="disc">
                        {children}
                      </Box>
                    ),
                    p: ({ children }) => (
                      <Box as="p" my={2}>
                        {children}
                      </Box>
                    ),
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </Box>
            ) : (
              <Text fontSize="sm" color="gray.400">{t("launcher.patchNotes.empty")}</Text>
            )}
          </Box>
        </Grid>
      </Box>
    </ModalBackdrop>,
    document.body,
  );
};

export default PatchNotesModal;
