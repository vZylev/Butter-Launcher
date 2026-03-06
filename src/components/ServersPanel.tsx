import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ModalBackdrop } from "./ui";

type ServerListItem = {
  id: string;
  name: string;
  ip: string;
  bannerUrl: string;
  previews: Array<{ key: string; url: string }>;
  description: string;
  kind: "recommended" | "servers";
  premium?: boolean;
  nameColor?: string;
  nameColor2?: string;
  nameHueRotate?: number;
};

const safeText = (v: unknown): string => (typeof v === "string" ? v : "");

const safeNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const safeBoolean = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return undefined;
};

type ServerCategory = "all" | "premium" | "standard";

const filterServersByCategory = (list: ServerListItem[], category: ServerCategory): ServerListItem[] => {
  if (category === "all") return list;
  const isPremium = (s: ServerListItem) => Boolean(s.premium);
  if (category === "premium") return list.filter((s) => isPremium(s));
  return list.filter((s) => !isPremium(s));
};

const normalizeHueRotate = (deg: number): number => {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

const parseHexColor = (hex: string): { r: number; g: number; b: number } | null => {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(raw) && !/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const toHex2 = (n: number): string => n.toString(16).padStart(2, "0");

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string =>
  `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();

const mixRgb = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } => {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const tt = clamp(t);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * tt);
  return { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b) };
};

const makeChromaGradientForTwoHex = (hex1: string, hex2: string): string | null => {
  const a = parseHexColor(hex1);
  const b = parseHexColor(hex2);
  if (!a || !b) return null;
  const aLight = mixRgb(a, { r: 255, g: 255, b: 255 }, 0.18);
  const bLight = mixRgb(b, { r: 255, g: 255, b: 255 }, 0.18);
  const A = rgbToHex(a);
  const B = rgbToHex(b);
  const AL = rgbToHex(aLight);
  const BL = rgbToHex(bLight);
  return `linear-gradient(90deg, ${A} 0%, ${AL} 12%, ${A} 24%, ${B} 50%, ${BL} 62%, ${B} 74%, ${A} 100%)`;
};

const rgbaFromRgb = (rgb: { r: number; g: number; b: number }, a: number): string => {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${aa})`;
};

const getRecommendedDecor = (
  s: ServerListItem,
): {
  fillColor: string;
  overlayColor: string;
  edgeGradient: string;
  borderColor: string;
  boxShadow: string;
  frameTintGradient: string;
  frameBorderColor: string;
  frameBoxShadow: string;
} | null => {
  if (s.kind !== "recommended") return null;
  if (!s.nameColor) return null;
  const c1 = parseHexColor(s.nameColor);
  if (!c1) return null;
  const baseBg = { r: 31, g: 37, b: 56 };
  const tintedBg = mixRgb(baseBg, c1, 0.22);
  return {
    fillColor: rgbToHex(tintedBg),
    overlayColor: rgbaFromRgb(c1, 0.02),
    edgeGradient: `radial-gradient(120% 120% at 50% 50%, ${rgbaFromRgb(c1, 0)} 62%, ${rgbaFromRgb(c1, 0.16)} 100%)`,
    borderColor: rgbaFromRgb(c1, 0.18),
    boxShadow: `0 0 10px ${rgbaFromRgb(c1, 0.12)}, 0 0 22px ${rgbaFromRgb(c1, 0.06)}, inset 0 0 18px ${rgbaFromRgb(c1, 0.05)}`,
    frameTintGradient: `linear-gradient(135deg, ${rgbaFromRgb(c1, 0.10)} 0%, ${rgbaFromRgb(c1, 0)} 60%)`,
    frameBorderColor: rgbaFromRgb(c1, 0.14),
    frameBoxShadow: `0 0 26px ${rgbaFromRgb(c1, 0.07)}, inset 0 0 26px ${rgbaFromRgb(c1, 0.04)}`,
  };
};

const parseServerListPayload = (raw: unknown, kind: "recommended" | "servers"): ServerListItem[] => {
  const payload = raw as any;
  const list = Array.isArray(payload?.servers) ? payload.servers : Array.isArray(payload) ? payload : [];

  const parsePreviews = (s: any): Array<{ key: string; url: string }> => {
    const rawPreviews = s?.previews ?? s?.previewUrls ?? s?.preview_urls;
    if (!Array.isArray(rawPreviews)) return [];
    const parsed = rawPreviews
      .map((p: any, index: number) => {
        if (typeof p === "string") {
          const url = safeText(p);
          return url ? { url, key: String(index + 1), pos: undefined as number | undefined, index } : null;
        }
        const url = safeText(p?.url) || safeText(p?.previewUrl) || safeText(p?.preview_url);
        const keyRaw = safeText(p?.key) || safeText(p?.id) || safeText(p?.tag) || safeText(p?.mode) || safeText(p?.name);
        const key = keyRaw || String(index + 1);
        const pos = safeNumber(p?.pos ?? p?.position ?? p?.order);
        if (!url) return null;
        return { url, key, pos, index };
      })
      .filter(Boolean) as Array<{ url: string; key: string; pos?: number; index: number }>;
    parsed.sort((a, b) => {
      const ap = typeof a.pos === "number" ? a.pos : Number.POSITIVE_INFINITY;
      const bp = typeof b.pos === "number" ? b.pos : Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return a.index - b.index;
    });
    const out: Array<{ key: string; url: string }> = [];
    const seenKeys = new Set<string>();
    for (const p of parsed) {
      const k = safeText(p.key).trim() || "";
      if (!k) continue;
      const norm = k.toLowerCase();
      if (seenKeys.has(norm)) continue;
      seenKeys.add(norm);
      out.push({ key: k, url: p.url });
      if (out.length >= 3) break;
    }
    return out;
  };

  return list
    .map((s: any) => {
      const id = safeText(s?.id) || safeText(s?.ip) || safeText(s?.name);
      const name = safeText(s?.name);
      const ip = safeText(s?.ip);
      const bannerUrl = safeText(s?.bannerUrl) || safeText(s?.banner) || safeText(s?.banner_url);
      const description = safeText(s?.description);
      const premium = safeBoolean(s?.premium ?? s?.isPremium ?? s?.is_premium) ?? false;
      const previews = parsePreviews(s);
      const nameColor = safeText(s?.nameColor) || safeText(s?.name_color);
      const nameColor2 = safeText(s?.nameColor2) || safeText(s?.name_color2);
      const nameHueRotate = safeNumber(s?.nameHueRotate ?? s?.name_hue_rotate);
      if (!id || !name || !ip || !bannerUrl) return null;
      return {
        id, name, ip, bannerUrl, previews, description, kind, premium,
        nameColor: nameColor || undefined,
        nameColor2: nameColor2 || undefined,
        nameHueRotate,
      } satisfies ServerListItem;
    })
    .filter(Boolean) as ServerListItem[];
};

const PREVIEW_TOKEN_RE_GLOBAL = /\{\{\s*preview\s*:\s*([^}]+?)\s*\}\}/gi;
const PREVIEW_TOKEN_RE_TEST = /\{\{\s*preview\s*:\s*[^}]+?\s*\}\}/i;

const normalizeDescriptionText = (v: string): string =>
  safeText(v).replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");



const renderDescriptionWithPreviews = (
  description: string,
  previews: Array<{ key: string; url: string }>,
  serverName: string,
  onOpenImage?: (src: string, alt?: string) => void,
): React.ReactNode => {
  const text = normalizeDescriptionText(description);
  if (!text) return null;
  const map = new Map<string, string>();
  previews.forEach((p, index) => {
    const key = safeText(p.key).trim();
    const url = safeText(p.url).trim();
    if (!key || !url) return;
    map.set(key.toLowerCase(), url);
    map.set(String(index + 1), url);
  });
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  PREVIEW_TOKEN_RE_GLOBAL.lastIndex = 0;
  while ((m = PREVIEW_TOKEN_RE_GLOBAL.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    const keyRaw = safeText(m[1]).trim();
    const before = text.slice(lastIndex, start);
    if (before) {
      nodes.push(
        <Box key={`desc:text:${nodes.length}`} whiteSpace="pre-wrap">{before}</Box>,
      );
    }
    const url = keyRaw ? map.get(keyRaw.toLowerCase()) : undefined;
    if (url) {
      nodes.push(
        <Box
          as="img"
          key={`desc:img:${nodes.length}`}
          src={url}
          alt={`${serverName} preview ${keyRaw}`}
          w="468px"
          maxW="100%"
          h="120px"
          rounded="sm"
          border="1px solid"
          borderColor="whiteAlpha.100"
          bg="whiteAlpha.50"
          objectFit="cover"
          cursor="zoom-in"
          display="block"
          loading="lazy"
          onClick={() => onOpenImage?.(url, `${serverName} preview ${keyRaw}`)}
        />,
      );
    } else {
      nodes.push(
        <Box key={`desc:badtoken:${nodes.length}`} whiteSpace="pre-wrap">{m[0]}</Box>,
      );
    }
    lastIndex = end;
  }
  const tail = text.slice(lastIndex);
  if (tail) {
    nodes.push(
      <Box key={`desc:tail:${nodes.length}`} whiteSpace="pre-wrap">{tail}</Box>,
    );
  }
  return <VStack gap={2} align="stretch">{nodes}</VStack>;
};

const getRecommendedNameChroma = (
  s: ServerListItem,
): { className: string; style: React.CSSProperties } | null => {
  if (s.kind !== "recommended") return null;
  const chromaBase: React.CSSProperties = {
    fontWeight: 800,
    letterSpacing: "0.025em",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    color: "transparent",
  };
  if (s.nameColor) {
    const gradient = makeChromaGradientForTwoHex(s.nameColor, s.nameColor2 || s.nameColor);
    if (gradient) {
      return {
        className: "bg-chroma-animated animate-chroma-shift",
        style: { ...chromaBase, backgroundImage: gradient },
      };
    }
  }
  if (typeof s.nameHueRotate === "number") {
    const hueRotate = normalizeHueRotate(s.nameHueRotate);
    return {
      className: "bg-chroma-animated animate-chroma-shift",
      style: {
        ...chromaBase,
        backgroundImage: "linear-gradient(90deg, #3b82f6, #22d3ee, #3b82f6)",
        filter: `hue-rotate(${hueRotate}deg)`,
      },
    };
  }
  return null;
};

const copyToClipboard = async (text: string) => {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); return; } catch {}
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.top = "-9999px";
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand("copy"); } finally { document.body.removeChild(el); }
};

const getServerPrimaryRgb = (s: ServerListItem): { r: number; g: number; b: number } | null => {
  if (!s?.nameColor) return null;
  return parseHexColor(s.nameColor);
};

const ServersPanel: React.FC = () => {
  const { t } = useTranslation();
  const [imageViewer, setImageViewer] = useState<{
    open: boolean; src: string; alt?: string; zoomed: boolean;
  }>({ open: false, src: "", alt: "", zoomed: false });
  const imageViewerImgRef = useRef<HTMLImageElement | null>(null);
  const [imageViewerZoomDims, setImageViewerZoomDims] = useState<{ w: number; h: number } | null>(null);
  const [copiedFlashKey, setCopiedFlashKey] = useState<string>("");
  const [copiedNotice, setCopiedNotice] = useState<string>("");
  const copyFlashTimeoutRef = useRef<number | null>(null);
  const copyNoticeTimeoutRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [recommended, setRecommended] = useState<ServerListItem[]>([]);
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [selected, setSelected] = useState<ServerListItem | null>(null);
  const [activeTab, setActiveTab] = useState<"recommended" | "servers">("recommended");
  const [recommendedCategory, setRecommendedCategory] = useState<ServerCategory>("all");
  const [serversCategory, setServersCategory] = useState<ServerCategory>("all");
  const category = activeTab === "recommended" ? recommendedCategory : serversCategory;
  const setCategory = activeTab === "recommended" ? setRecommendedCategory : setServersCategory;
  const filteredRecommended = useMemo(
    () => filterServersByCategory(recommended, recommendedCategory),
    [recommended, recommendedCategory],
  );
  const filteredServers = useMemo(
    () => filterServersByCategory(servers, serversCategory),
    [servers, serversCategory],
  );

  const showCopyFeedback = (key: string) => {
    setCopiedFlashKey(key);
    setCopiedNotice(t("serversModal.feedback.ipCopied"));
    if (copyFlashTimeoutRef.current) window.clearTimeout(copyFlashTimeoutRef.current);
    if (copyNoticeTimeoutRef.current) window.clearTimeout(copyNoticeTimeoutRef.current);
    copyFlashTimeoutRef.current = window.setTimeout(() => { setCopiedFlashKey(""); copyFlashTimeoutRef.current = null; }, 650);
    copyNoticeTimeoutRef.current = window.setTimeout(() => { setCopiedNotice(""); copyNoticeTimeoutRef.current = null; }, 2200);
  };

  const handleCopyIp = async (ip: string, key: string) => {
    try { await copyToClipboard(ip); showCopyFeedback(key); } catch {}
  };

  const urls = useMemo(() => {
    const env = (import.meta as any).env ?? {};
    return {
      recommendedUrl: (env.VITE_SERVERS_RECOMMENDED_URL as string | undefined) || "",
      serversUrl: (env.VITE_SERVERS_URL as string | undefined) || "",
    };
  }, []);

  useEffect(() => {
    setSelected(null);
    setError("");
    setActiveTab("recommended");
    setRecommendedCategory("all");
    setServersCategory("all");
    const { recommendedUrl, serversUrl } = urls;
    if (!recommendedUrl || !serversUrl) {
      setRecommended([]);
      setServers([]);
      setError(t("serversModal.errors.missingUrls"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const hasIpc = typeof (window as any)?.ipcRenderer?.invoke === "function";
        const fetchJson = async (url: string) => {
          if (hasIpc) {
            const status = await (window as any).ipcRenderer.invoke("fetch:head", url);
            if (status !== 200) throw new Error(`HTTP ${status} (${url})`);
            return await (window as any).ipcRenderer.invoke("fetch:json", url);
          }
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
          return await r.json();
        };
        const [r1, r2] = await Promise.all([fetchJson(recommendedUrl), fetchJson(serversUrl)]);
        if (cancelled) return;
        setRecommended(parseServerListPayload(r1, "recommended"));
        setServers(parseServerListPayload(r2, "servers"));
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load servers lists", e);
        setRecommended([]);
        setServers([]);
        setError(t("serversModal.errors.loadFailed"));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t, urls]);

  useEffect(() => {
    return () => {
      if (copyFlashTimeoutRef.current) window.clearTimeout(copyFlashTimeoutRef.current);
      if (copyNoticeTimeoutRef.current) window.clearTimeout(copyNoticeTimeoutRef.current);
    };
  }, []);

  const openImageViewer = (src: string, alt?: string) => {
    const s = typeof src === "string" ? src.trim() : "";
    if (!s) return;
    setImageViewer({ open: true, src: s, alt, zoomed: false });
    setImageViewerZoomDims(null);
  };

  const closeImageViewer = () => {
    setImageViewer({ open: false, src: "", alt: "", zoomed: false });
    setImageViewerZoomDims(null);
  };

  useEffect(() => {
    if (!imageViewer.open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") closeImageViewer(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewer.open]);


  const openedRecommendedDecor = selected ? getRecommendedDecor(selected) : null;

  const tabBtn = (tab: "recommended" | "servers", label: string) => {
    const active = activeTab === tab;
    return (
      <Box
        as="button"
        flex={1}
        position="relative"
        overflow="hidden"
        fontSize="xs"
        px={3}
        py={1.5}
        rounded="lg"
        border="1px solid"
        borderColor={active ? "rgba(96,165,250,0.3)" : "#2a3146"}
        bg={active ? "rgba(31,37,56,0.7)" : "rgba(31,37,56,0.7)"}
        cursor="pointer"
        transition="all 0.15s"
        _hover={active ? {} : { bg: "#23293a" }}
        onClick={() => setActiveTab(tab)}
      >
        {active ? (
          <Box
            aria-hidden="true"
            pointerEvents="none"
            position="absolute"
            inset={0}
            className="bg-chroma-animated animate-chroma-shift"
            style={{ backgroundImage: "linear-gradient(90deg, rgba(59,130,246,0.12), rgba(34,211,238,0.06), rgba(59,130,246,0.12))" }}
          />
        ) : null}
        <Box
          as="span"
          position="relative"
          zIndex={1}
          className="bg-chroma-animated animate-chroma-shift"
          style={{
            backgroundImage: active ? "linear-gradient(90deg, #3b82f6, #22d3ee, #3b82f6)" : undefined,
            WebkitBackgroundClip: active ? "text" : undefined,
            WebkitTextFillColor: active ? "transparent" : undefined,
            backgroundClip: active ? "text" : undefined,
            color: active ? "transparent" : "rgba(255,255,255,0.85)",
            fontWeight: active ? 700 : 400,
          } as React.CSSProperties}
        >
          {label}
        </Box>
      </Box>
    );
  };

  const catBtn = (key: ServerCategory, label: string) => {
    const active = category === key;
    return (
      <Box
        as="button"
        key={`${activeTab}:cat:${key}`}
        flex={1}
        fontSize="xs"
        px={3}
        py={1.5}
        rounded="md"
        border="1px solid"
        borderColor={active ? "rgba(96,165,250,0.3)" : "#2a3146"}
        bg={active ? "#23293a" : "rgba(31,37,56,0.7)"}
        color={active ? "white" : "rgba(255,255,255,0.85)"}
        fontWeight={active ? "bold" : "normal"}
        cursor="pointer"
        transition="all 0.15s"
        _hover={active ? {} : { bg: "#23293a" }}
        onClick={() => setCategory(key)}
      >
        {label}
      </Box>
    );
  };

  return (
    <Box
      position="relative"
      w="full"
      h="full"
      overflow="hidden"
    >
      {imageViewer.open
        ? createPortal(
            <ModalBackdrop onClose={closeImageViewer} zIndex={10060}>
              <IconButton
                aria-label={t("common.close")}
                position="absolute"
                top={4}
                right={4}
                size="sm"
                variant="ghost"
                color="gray.200"
                _hover={{ color: "white", bg: "#23293a" }}
                rounded="full"
                border="1px solid"
                borderColor="whiteAlpha.100"
                bg="rgba(20,24,36,0.8)"
                onClick={(e) => { e.stopPropagation(); closeImageViewer(); }}
              >
                <IconX size={18} />
              </IconButton>
              <Box
                maxW="92vw"
                maxH="88vh"
                overflow="auto"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <Box
                  as="img"
                  src={imageViewer.src}
                  alt={imageViewer.alt || "Image"}
                  ref={imageViewerImgRef}
                  display="block"
                  rounded="lg"
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                  bg="whiteAlpha.50"
                  shadow="2xl"
                  objectFit="contain"
                  cursor={imageViewer.zoomed ? "zoom-out" : "zoom-in"}
                  transition="width 120ms ease, height 120ms ease"
                  {...(imageViewer.zoomed
                    ? {
                        w: imageViewerZoomDims ? `${imageViewerZoomDims.w}px` : "184vw",
                        h: imageViewerZoomDims ? `${imageViewerZoomDims.h}px` : "auto",
                        maxW: "none",
                        maxH: "none",
                      }
                    : {
                        maxW: "92vw",
                        maxH: "88vh",
                      })}
                  onClick={() => {
                    setImageViewer((v) => {
                      if (!v.zoomed) {
                        const rect = imageViewerImgRef.current?.getBoundingClientRect();
                        if (rect && rect.width > 0 && rect.height > 0) {
                          setImageViewerZoomDims({ w: Math.round(rect.width * 2), h: Math.round(rect.height * 2) });
                        } else {
                          setImageViewerZoomDims(null);
                        }
                      } else {
                        setImageViewerZoomDims(null);
                      }
                      return { ...v, zoomed: !v.zoomed };
                    });
                  }}
                />
              </Box>
            </ModalBackdrop>,
            document.body,
          )
        : null}

      <Box
        position="relative"
        w="full"
        h="full"
        rounded="xl"
        border="1px solid"
        borderColor={openedRecommendedDecor ? openedRecommendedDecor.frameBorderColor : "#2a3146"}
        px={8}
        py={5}
        display="flex"
        flexDir="column"
        style={{
          background: openedRecommendedDecor
            ? "rgba(20,24,36,0.55)"
            : "linear-gradient(to bottom, rgba(27,32,48,0.95), rgba(20,24,36,0.95))",
          backdropFilter: openedRecommendedDecor ? "blur(24px)" : undefined,
          boxShadow: openedRecommendedDecor ? openedRecommendedDecor.frameBoxShadow : undefined,
        } as React.CSSProperties}
      >
        {openedRecommendedDecor ? (
          <>
            <Box
              aria-hidden="true"
              pointerEvents="none"
              position="absolute"
              inset={0}
              rounded="xl"
              style={{ backgroundImage: openedRecommendedDecor.frameTintGradient }}
            />
            <Box
              aria-hidden="true"
              pointerEvents="none"
              position="absolute"
              inset={0}
              rounded="xl"
              opacity={0.35}
              style={{ backgroundImage: openedRecommendedDecor.edgeGradient }}
            />
          </>
        ) : null}

        <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide" mb={4} zIndex={1}>
          {t("serversModal.title")}
        </Text>

        <Box flex={1} minH={0} overflow="hidden" pr={2} display="flex" flexDir="column" zIndex={1}>
          {loading ? (
            <Box rounded="lg" border="1px solid" borderColor="#2a3146" bg="rgba(31,37,56,0.7)" p={4}>
              <Text fontSize="xs" color="gray.300">{t("common.loading")}</Text>
            </Box>
          ) : error ? (
            <Box rounded="lg" border="1px solid" borderColor="rgba(239,68,68,0.3)" bg="rgba(31,37,56,0.7)" p={4}>
              <Text fontSize="xs" color="red.300">{error}</Text>
            </Box>
          ) : selected ? (
            <Box
              flex={1}
              minH={0}
              overflowY="auto"
              rounded="lg"
              border="1px solid"
              p={4}
              pb={6}
              className="dark-scrollbar"
              style={(() => {
                const decor = getRecommendedDecor(selected);
                if (!decor) return { background: "rgba(20,24,36,0.8)", borderColor: "#2a3146" };
                return {
                  background: "rgba(20,24,36,0.8)",
                  borderColor: decor.borderColor,
                  boxShadow: decor.boxShadow,
                };
              })()}
            >
              <HStack justify="space-between" gap={3} mb={3}>
                {(() => {
                  const chroma = getRecommendedNameChroma(selected);
                  return (
                    <Box
                      fontSize="sm"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                      fontWeight={chroma ? undefined : "semibold"}
                      color={chroma ? undefined : "white"}
                      className={chroma ? chroma.className : undefined}
                      style={chroma ? chroma.style : undefined}
                    >
                      {selected.name}
                    </Box>
                  );
                })()}
                <Button
                  size="sm"
                  variant="outline"
                  borderColor="#2a3146"
                  bg="#23293a"
                  _hover={{ bg: "#2f3650" }}
                  color="white"
                  onClick={() => setSelected(null)}
                >
                  {t("common.back")}
                </Button>
              </HStack>

              <VStack gap={2} align="center">
                <Box
                  as="img"
                  src={selected.bannerUrl}
                  alt={selected.name}
                  w="468px"
                  h="60px"
                  maxW="100%"
                  rounded="sm"
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                  bg="whiteAlpha.50"
                  objectFit="cover"
                  cursor="zoom-in"
                  loading="lazy"
                  onClick={() => openImageViewer(selected.bannerUrl, selected.name)}
                />
                <Text fontSize="xs" color="gray.300">
                  {t("serversModal.labels.ip")}: <Box as="span" fontFamily="mono">{selected.ip}</Box>
                </Text>
                <Box
                  as="button"
                  fontSize="xs"
                  px={3}
                  py={2}
                  rounded="lg"
                  border="1px solid"
                  color="white"
                  fontWeight="bold"
                  cursor="pointer"
                  transition="all 0.15s"
                  style={(() => {
                    const isCopied = copiedFlashKey === `detail:${selected.id}`;
                    const primary = getServerPrimaryRgb(selected);
                    if (!primary) {
                      const glow = "rgba(2,104,212,0.35)";
                      return {
                        borderColor: "rgba(96,165,250,0.30)",
                        backgroundImage: "linear-gradient(90deg, #0268D4 0%, #02D4D4 100%)",
                        backgroundSize: "100% 100%",
                        boxShadow: isCopied ? `0 0 0 2px ${glow}, 0 0 18px ${glow}` : undefined,
                      } as React.CSSProperties;
                    }
                    const solid = rgbToHex(primary);
                    const border = rgbaFromRgb(primary, 0.28);
                    const glow = rgbaFromRgb(primary, 0.35);
                    return {
                      borderColor: border,
                      backgroundColor: solid,
                      boxShadow: isCopied ? `0 0 0 2px ${glow}, 0 0 18px ${glow}` : undefined,
                    } as React.CSSProperties;
                  })()}
                  onClick={() => void handleCopyIp(selected.ip, `detail:${selected.id}`)}
                >
                  {t("serversModal.actions.copyIp")}
                </Box>
              </VStack>

              <Box mt={4}>
                <Text fontSize="11px" color="gray.400" fontWeight="bold" textTransform="uppercase">
                  {t("serversModal.labels.description")}
                </Text>
                <Box mt={1} fontSize="xs" color="gray.200">
                  {(() => {
                    const normalized = normalizeDescriptionText(selected.description || "");
                    const hasTokens = PREVIEW_TOKEN_RE_TEST.test(normalized);
                    if (normalized) {
                      if (hasTokens) {
                        return renderDescriptionWithPreviews(normalized, selected.previews, selected.name, openImageViewer);
                      }
                      return <Box whiteSpace="pre-wrap">{normalized}</Box>;
                    }
                    return <Box whiteSpace="pre-wrap">{t("serversModal.empty.noDescription")}</Box>;
                  })()}
                  {!PREVIEW_TOKEN_RE_TEST.test(normalizeDescriptionText(selected.description || "")) && selected.previews?.length ? (
                    <HStack mt={2} gap={2} w="468px" maxW="full">
                      {selected.previews.slice(0, 3).map((p, i) => (
                        <Box
                          as="img"
                          key={`${selected.id}:preview:${p.key}:${i}`}
                          src={p.url}
                          alt={`${selected.name} preview ${p.key}`}
                          flex={1}
                          h="84px"
                          maxW="100%"
                          rounded="sm"
                          border="1px solid"
                          borderColor="whiteAlpha.100"
                          bg="whiteAlpha.50"
                          objectFit="cover"
                          cursor="zoom-in"
                          loading="lazy"
                          onClick={() => openImageViewer(p.url, `${selected.name} preview ${p.key}`)}
                        />
                      ))}
                    </HStack>
                  ) : null}
                </Box>
              </Box>
            </Box>
          ) : (
            <Box h="full" display="flex" flexDir="column" overflow="hidden">
              <Box mb={2} rounded="lg" border="1px solid" borderColor="#2a3146" bg="rgba(31,37,56,0.5)" px={3} py={2}>
                <Text fontSize="11px" color="gray.200">{t("serversModal.notes.clickToLearn")}</Text>
                <Text fontSize="11px" color="gray.300">{t("serversModal.notes.addYourServer")}</Text>
              </Box>

              <HStack gap={2} mb={2}>
                {tabBtn("recommended", t("serversModal.sections.recommended"))}
                {tabBtn("servers", t("serversModal.sections.servers"))}
              </HStack>

              <HStack mb={2} rounded="lg" border="1px solid" borderColor="#2a3146" bg="rgba(31,37,56,0.5)" p={1} gap={1}>
                {catBtn("all", t("serversModal.filters.all"))}
                {catBtn("premium", t("serversModal.filters.premium"))}
                {catBtn("standard", t("serversModal.filters.standard"))}
              </HStack>

              <Box flex={1} overflowY="auto" pr={1} className="dark-scrollbar">
                <VStack gap={1} align="stretch">
                  {(activeTab === "recommended" ? filteredRecommended : filteredServers).length ? (
                    (activeTab === "recommended" ? filteredRecommended : filteredServers).map((s) => {
                      const decor = getRecommendedDecor(s);
                      const key = `${activeTab}:${s.id}`;
                      const copyKey = `${activeTab === "recommended" ? "rec" : "srv"}:${s.id}`;
                      const isCopied = copiedFlashKey === copyKey;
                      return (
                        <Box
                          key={key}
                          position="relative"
                          overflow="hidden"
                          rounded="lg"
                          border="1px solid"
                          p={2}
                          cursor="pointer"
                          transition="background 0.15s"
                          _hover={{ bg: "#23293a" }}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelected(s)}
                          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") setSelected(s); }}
                          style={
                            decor
                              ? { backgroundColor: decor.fillColor, borderColor: decor.borderColor, boxShadow: decor.boxShadow }
                              : { background: "rgba(31,37,56,0.7)", borderColor: "#2a3146" }
                          }
                        >
                          {decor ? (
                            <>
                              <Box aria-hidden pointerEvents="none" position="absolute" inset={0} opacity={0.2} style={{ backgroundColor: decor.overlayColor }} />
                              <Box aria-hidden pointerEvents="none" position="absolute" inset={0} opacity={0.4} style={{ backgroundImage: decor.edgeGradient }} />
                            </>
                          ) : null}
                          <Box position="relative" zIndex={1}>
                            <HStack justify="space-between" gap={3}>
                              <VStack flex={1} gap={1} align="center">
                                {(() => {
                                  const chroma = getRecommendedNameChroma(s);
                                  return (
                                    <Box
                                      fontSize="xs"
                                      w="full"
                                      textAlign="center"
                                      overflow="hidden"
                                      textOverflow="ellipsis"
                                      whiteSpace="nowrap"
                                      fontWeight={chroma ? undefined : "semibold"}
                                      color={chroma ? undefined : "white"}
                                      className={chroma ? chroma.className : undefined}
                                      style={chroma ? chroma.style : undefined}
                                    >
                                      {s.name}
                                    </Box>
                                  );
                                })()}
                                <Box
                                  as="img"
                                  src={s.bannerUrl}
                                  alt={s.name}
                                  w="468px"
                                  h="60px"
                                  maxW="100%"
                                  rounded="sm"
                                  border="1px solid"
                                  borderColor="whiteAlpha.100"
                                  bg="whiteAlpha.50"
                                  objectFit="cover"
                                  loading="lazy"
                                />
                                <Text fontSize="11px" color="gray.300" fontFamily="mono">{s.ip}</Text>
                              </VStack>
                              <Box
                                as="button"
                                flexShrink={0}
                                fontSize="11px"
                                px={2.5}
                                py={1.5}
                                rounded="lg"
                                border="1px solid"
                                borderColor={isCopied ? "rgba(96,165,250,0.3)" : "#2a3146"}
                                bg="#23293a"
                                color="white"
                                cursor="pointer"
                                transition="all 0.15s"
                                _hover={{ bg: "#2f3650" }}
                                style={isCopied ? { outline: "2px solid rgba(96,165,250,0.3)" } : undefined}
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); void handleCopyIp(s.ip, copyKey); }}
                              >
                                {t("serversModal.actions.copyIp")}
                              </Box>
                            </HStack>
                          </Box>
                        </Box>
                      );
                    })
                  ) : (
                    <Text fontSize="xs" color="gray.400">
                      {activeTab === "recommended"
                        ? t("serversModal.empty.noRecommended")
                        : t("serversModal.empty.noServers")}
                    </Text>
                  )}
                </VStack>
              </Box>
            </Box>
          )}
        </Box>

        {copiedNotice ? (
          <Box
            pointerEvents="none"
            position="absolute"
            left="50%"
            bottom={5}
            transform="translateX(-50%)"
            className="animate-fade-in"
          >
            <Box
              rounded="full"
              bg="rgba(0,0,0,0.6)"
              border="1px solid"
              borderColor="whiteAlpha.100"
              px={4}
              py={2}
            >
              <Text fontSize="xs" color="white">{copiedNotice}</Text>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};

export default ServersPanel;
