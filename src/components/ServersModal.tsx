import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

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

type ServerCategory = "all" | "premium" | "noPremium";

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

  const full = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;

  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
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
  return {
    r: lerp(a.r, b.r),
    g: lerp(a.g, b.g),
    b: lerp(a.b, b.b),
  };
};

const makeChromaGradientForTwoHex = (hex1: string, hex2: string): string | null => {
  const a = parseHexColor(hex1);
  const b = parseHexColor(hex2);
  if (!a || !b) return null;

  // Use two user-chosen colors, but add a subtle "spark" highlight for each.
  // This keeps the gradient anchored to the chosen colors while still animating nicely.
  const aLight = mixRgb(a, { r: 255, g: 255, b: 255 }, 0.18);
  const bLight = mixRgb(b, { r: 255, g: 255, b: 255 }, 0.18);

  const A = rgbToHex(a);
  const B = rgbToHex(b);
  const AL = rgbToHex(aLight);
  const BL = rgbToHex(bLight);

  // Repeating pattern -> movement is visible with background-position animation.
  return `linear-gradient(90deg, ${A} 0%, ${AL} 12%, ${A} 24%, ${B} 50%, ${BL} 62%, ${B} 74%, ${A} 100%)`;
};

const rgbaFromRgb = (rgb: { r: number; g: number; b: number }, a: number): string => {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${aa})`;
};

const getRecommendedDecor = (
  s: ServerListItem,
):
  | {
      fillColor: string;
      overlayColor: string;
      edgeGradient: string;
      borderColor: string;
      boxShadow: string;

      frameTintGradient: string;
      frameBorderColor: string;
      frameBoxShadow: string;
    }
  | null => {
  if (s.kind !== "recommended") return null;
  if (!s.nameColor) return null;

  const c1 = parseHexColor(s.nameColor);
  if (!c1) return null;

  // IMPORTANT: if we just lay a translucent color1 overlay over our bluish base,
  // red-ish tones look purple/blue. So we tint the actual background toward color1
  // (opaque), then keep overlays very subtle for depth.
  // Translation: alpha blending will bully your reds into looking like grape soda.
  const baseBg = { r: 31, g: 37, b: 56 }; // ~ #1f2538
  const tintedBg = mixRgb(baseBg, c1, 0.22);

  return {
    fillColor: rgbToHex(tintedBg),
    overlayColor: rgbaFromRgb(c1, 0.02),
    edgeGradient: `radial-gradient(120% 120% at 50% 50%, ${rgbaFromRgb(c1, 0)} 62%, ${rgbaFromRgb(c1, 0.16)} 100%)`,
    borderColor: rgbaFromRgb(c1, 0.18),
    boxShadow: `0 0 10px ${rgbaFromRgb(c1, 0.12)}, 0 0 22px ${rgbaFromRgb(c1, 0.06)}, inset 0 0 18px ${rgbaFromRgb(c1, 0.05)}`,

    frameTintGradient: `linear-gradient(135deg, ${rgbaFromRgb(c1, 0.10)} 0%, ${rgbaFromRgb(c1, 0)} 60%)`,
    frameBorderColor: rgbaFromRgb(c1, 0.14),
    // Tiny glow so the panel feels alive (and not like a sad rectangle).
    frameBoxShadow: `0 0 26px ${rgbaFromRgb(c1, 0.07)}, inset 0 0 26px ${rgbaFromRgb(c1, 0.04)}`,
  };
};

const parseServerListPayload = (
  raw: unknown,
  kind: "recommended" | "servers",
): ServerListItem[] => {
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
        const keyRaw =
          safeText(p?.key) ||
          safeText(p?.id) ||
          safeText(p?.tag) ||
          safeText(p?.mode) ||
          safeText(p?.name);
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
        id,
        name,
        ip,
        bannerUrl,
        previews,
        description,
        kind,
        premium,
        nameColor: nameColor || undefined,
        nameColor2: nameColor2 || undefined,
        nameHueRotate,
      } satisfies ServerListItem;
    })
    .filter(Boolean) as ServerListItem[];
};

const PREVIEW_TOKEN_RE_GLOBAL = /\{\{\s*preview\s*:\s*([^}]+?)\s*\}\}/gi;
const PREVIEW_TOKEN_RE_TEST = /\{\{\s*preview\s*:\s*[^}]+?\s*\}\}/i;

const normalizeDescriptionText = (v: string): string => {
  // Some VPS/backends double-escape newlines, resulting in literal "\n" being shown.
  // Support both real newlines and escaped sequences.
  return safeText(v)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
};

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
        <div key={`desc:text:${nodes.length}`} className="whitespace-pre-wrap">
          {before}
        </div>,
      );
    }

    const url = keyRaw ? map.get(keyRaw.toLowerCase()) : undefined;
    if (url) {
      nodes.push(
        <img
          key={`desc:img:${nodes.length}`}
          src={url}
          alt={`${serverName} preview ${keyRaw}`}
          className="w-[468px] max-w-full h-[120px] rounded-md border border-white/10 bg-white/5 object-cover cursor-zoom-in"
          loading="lazy"
          onClick={() => onOpenImage?.(url, `${serverName} preview ${keyRaw}`)}
        />,
      );
    } else {
      // Unknown token -> keep it as text so the JSON author can spot the mistake.
      nodes.push(
        <div key={`desc:badtoken:${nodes.length}`} className="whitespace-pre-wrap">
          {m[0]}
        </div>,
      );
    }

    lastIndex = end;
  }

  const tail = text.slice(lastIndex);
  if (tail) {
    nodes.push(
      <div key={`desc:tail:${nodes.length}`} className="whitespace-pre-wrap">
        {tail}
      </div>,
    );
  }

  return <div className="space-y-2">{nodes}</div>;
};

const getRecommendedNameChroma = (s: ServerListItem): { className: string; style?: React.CSSProperties } | null => {
  if (s.kind !== "recommended") return null;

  // Preferred: if a color is provided, build the chromatic gradient from that hue.
  // This keeps colors anchored to the JSON instead of hue-rotating the base blue/cyan gradient.
  if (s.nameColor) {
    const gradient = makeChromaGradientForTwoHex(
      s.nameColor,
      s.nameColor2 || s.nameColor,
    );
    if (gradient) {
      return {
        className: "font-extrabold tracking-wide bg-clip-text text-transparent bg-chroma-animated animate-chroma-shift",
        style: { backgroundImage: gradient },
      };
    }
  }

  // Advanced/manual: allow directly hue-rotating the base gradient.
  if (typeof s.nameHueRotate === "number") {
    const hueRotate = normalizeHueRotate(s.nameHueRotate);
    return {
      className:
        "font-extrabold tracking-wide bg-linear-to-r from-blue-500 via-cyan-400 to-blue-500 bg-clip-text text-transparent bg-chroma-animated animate-chroma-shift",
      style: { filter: `hue-rotate(${hueRotate}deg)` },
    };
  }

  return null;
};

const copyToClipboard = async (text: string) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fallback
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.top = "-9999px";
  document.body.appendChild(el);
  el.focus();
  el.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(el);
  }
};

const getServerPrimaryRgb = (s: ServerListItem): { r: number; g: number; b: number } | null => {
  if (!s?.nameColor) return null;
  return parseHexColor(s.nameColor);
};

const ServersModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);

  const [imageViewer, setImageViewer] = useState<{
    open: boolean;
    src: string;
    alt?: string;
    zoomed: boolean;
  }>({ open: false, src: "", alt: "", zoomed: false });

  const imageViewerImgRef = useRef<HTMLImageElement | null>(null);
  const [imageViewerZoomDims, setImageViewerZoomDims] = useState<{ w: number; h: number } | null>(
    null,
  );

  const [copiedFlashKey, setCopiedFlashKey] = useState<string>("");
  const [copiedNotice, setCopiedNotice] = useState<string>("");
  const copyFlashTimeoutRef = useRef<number | null>(null);
  const copyNoticeTimeoutRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [recommended, setRecommended] = useState<ServerListItem[]>([]);
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [selected, setSelected] = useState<ServerListItem | null>(null);
  const [activeTab, setActiveTab] = useState<"recommended" | "servers">(
    "recommended",
  );

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

    copyFlashTimeoutRef.current = window.setTimeout(() => {
      setCopiedFlashKey("");
      copyFlashTimeoutRef.current = null;
    }, 650);

    copyNoticeTimeoutRef.current = window.setTimeout(() => {
      setCopiedNotice("");
      copyNoticeTimeoutRef.current = null;
    }, 2200);
  };

  const handleCopyIp = async (ip: string, key: string) => {
    try {
      await copyToClipboard(ip);
      showCopyFeedback(key);
    } catch {
      // If clipboard fails, don't show success notice.
    }
  };

  const urls = useMemo(() => {
    const env = (import.meta as any).env ?? {};
    const recommendedUrl = (env.VITE_SERVERS_RECOMMENDED_URL as string | undefined) || "";
    const serversUrl = (env.VITE_SERVERS_URL as string | undefined) || "";
    return { recommendedUrl, serversUrl };
  }, []);

  useEffect(() => {
    if (!open) return;

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
        const hasIpc =
          typeof (window as any)?.ipcRenderer?.invoke === "function";

        const fetchJson = async (url: string) => {
          if (hasIpc) {
            const status = await (window as any).ipcRenderer.invoke(
              "fetch:head",
              url,
            );
            if (status !== 200) throw new Error(`HTTP ${status} (${url})`);
            return await (window as any).ipcRenderer.invoke("fetch:json", url);
          }

          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
          return await r.json();
        };

        const [r1, r2] = await Promise.all([
          fetchJson(recommendedUrl),
          fetchJson(serversUrl),
        ]);

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

    return () => {
      cancelled = true;
    };
  }, [open, t, urls]);

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeImageViewer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewer.open]);

  if (!open && !closing) return null;

  const openedRecommendedDecor = selected ? getRecommendedDecor(selected) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in">
      {imageViewer.open
        ? createPortal(
            <div
              className="fixed inset-0 z-[10060] glass-backdrop flex items-center justify-center p-6"
              onClick={() => closeImageViewer()}
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
            >
              <button
                type="button"
                className="absolute top-4 right-4 w-9 h-9 rounded-full border border-white/10 bg-[#141824]/80 text-gray-200 hover:text-white hover:bg-[#23293a] transition flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  closeImageViewer();
                }}
                title={t("common.close")}
              >
                <IconX size={18} />
              </button>

              <div className="max-w-[92vw] max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <img
                  src={imageViewer.src}
                  alt={imageViewer.alt || "Image"}
                  ref={imageViewerImgRef}
                  className={cn(
                    "block rounded-xl border border-white/10 bg-white/5 shadow-2xl",
                    imageViewer.zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
                  )}
                  style={
                    imageViewer.zoomed
                      ? {
                          width: imageViewerZoomDims ? `${imageViewerZoomDims.w}px` : "184vw",
                          height: imageViewerZoomDims ? `${imageViewerZoomDims.h}px` : "auto",
                          maxWidth: "none",
                          maxHeight: "none",
                          objectFit: "contain",
                          transition: "width 120ms ease, height 120ms ease",
                        }
                      : {
                          maxWidth: "92vw",
                          maxHeight: "88vh",
                          objectFit: "contain",
                          transition: "width 120ms ease, height 120ms ease",
                        }
                  }
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
              </div>
            </div>,
            document.body,
          )
        : null}

      <div
        className={cn(
          `
          relative w-full max-w-4xl h-[560px] mx-auto
          rounded-xl
          ${openedRecommendedDecor ? "bg-[#141824]/55 backdrop-blur-xl" : "bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95"}
          border border-[#2a3146]
          shadow-2xl
          px-8 py-5
          flex flex-col animate-settings-in`,
          closing && "animate-settings-out",
        )}
        style={
          openedRecommendedDecor
            ? ({
                borderColor: openedRecommendedDecor.frameBorderColor,
                boxShadow: openedRecommendedDecor.frameBoxShadow,
              } as React.CSSProperties)
            : undefined
        }
      >
        {openedRecommendedDecor ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{ backgroundImage: openedRecommendedDecor.frameTintGradient }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl opacity-35"
              style={{ backgroundImage: openedRecommendedDecor.edgeGradient }}
            />
          </>
        ) : null}
        <button
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
          onClick={() => {
            setClosing(true);
            setTimeout(() => {
              setClosing(false);
              onClose();
            }, 160);
          }}
          title={t("common.close")}
        >
          ×
        </button>

        <h2 className="text-lg font-semibold text-white tracking-wide mb-4">
          {t("serversModal.title")}
        </h2>

        <div className="flex-1 min-h-0 overflow-hidden pr-2 flex flex-col">
          {loading ? (
            <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-4 text-xs text-gray-300">
              {t("common.loading")}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-[#1f2538]/70 p-4 text-xs text-red-300">
              {error}
            </div>
          ) : selected ? (
            <div
              className={cn(
                "flex-1 min-h-0 overflow-y-auto rounded-lg border p-4 pb-6 bg-[#141824]/80 dark-scrollbar overscroll-contain",
                getRecommendedDecor(selected) ? "relative" : "border-[#2a3146]",
              )}
              style={(() => {
                const decor = getRecommendedDecor(selected);
                if (!decor) return undefined;
                return {
                  borderColor: decor.borderColor,
                  boxShadow: decor.boxShadow,
                } as React.CSSProperties;
              })()}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                {(() => {
                  const chroma = getRecommendedNameChroma(selected);
                  return (
                    <div
                      className={cn(
                        "text-sm truncate",
                        chroma ? chroma.className : "font-semibold text-white",
                      )}
                      style={chroma ? chroma.style : undefined}
                    >
                      {selected.name}
                    </div>
                  );
                })()}
                <button
                  type="button"
                  className="text-xs px-3 py-2 rounded-lg border border-[#2a3146] bg-[#23293a] hover:bg-[#2f3650] text-white transition"
                  onClick={() => setSelected(null)}
                  title={t("common.back")}
                >
                  {t("common.back")}
                </button>
              </div>

              <div className="flex flex-col items-center text-center">
                <img
                  src={selected.bannerUrl}
                  alt={selected.name}
                  className="w-[468px] h-[60px] max-w-full rounded-md border border-white/10 bg-white/5 object-cover cursor-zoom-in"
                  loading="lazy"
                  onClick={() => openImageViewer(selected.bannerUrl, selected.name)}
                />

                <div className="mt-2 text-xs text-gray-300">
                  {t("serversModal.labels.ip")}: <span className="font-mono">{selected.ip}</span>
                </div>

                <button
                  type="button"
                  className={cn(
                    "mt-2 text-xs px-3 py-2 rounded-lg border text-white font-bold transition",
                    copiedFlashKey === `detail:${selected.id}` && "animate-pulse",
                  )}
                  style={(() => {
                    const isCopied = copiedFlashKey === `detail:${selected.id}`;
                    const primary = getServerPrimaryRgb(selected);

                    if (!primary) {
                      const glow = "rgba(2, 104, 212, 0.35)";
                      return {
                        borderColor: "rgba(96, 165, 250, 0.30)",
                        backgroundImage: "linear-gradient(90deg, #0268D4 0%, #02D4D4 100%)",
                        backgroundSize: "100% 100%",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "left",
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
                  title={t("serversModal.actions.copyIp")}
                >
                  {t("serversModal.actions.copyIp")}
                </button>
              </div>

              <div className="mt-4">
                <div className="text-[11px] text-gray-400 font-bold uppercase">
                  {t("serversModal.labels.description")}
                </div>
                <div className="mt-1 text-xs text-gray-200">
                  {(() => {
                    const normalized = normalizeDescriptionText(selected.description || "");
                    const hasTokens = PREVIEW_TOKEN_RE_TEST.test(normalized);

                    if (normalized) {
                      if (hasTokens) {
                        return renderDescriptionWithPreviews(
                          normalized,
                          selected.previews,
                          selected.name,
                          openImageViewer,
                        );
                      }

                      return (
                        <div className="whitespace-pre-wrap">{normalized}</div>
                      );
                    }

                    return (
                      <div className="whitespace-pre-wrap">{t("serversModal.empty.noDescription")}</div>
                    );
                  })()}

                  {!PREVIEW_TOKEN_RE_TEST.test(normalizeDescriptionText(selected.description || "")) && selected.previews?.length ? (
                    <div className="mt-2 w-[468px] max-w-full flex gap-2">
                      {selected.previews.slice(0, 3).map((p, i) => (
                        <img
                          key={`${selected.id}:preview:${p.key}:${i}`}
                          src={p.url}
                          alt={`${selected.name} preview ${p.key}`}
                          className="flex-1 h-[84px] max-w-full rounded-md border border-white/10 bg-white/5 object-cover cursor-zoom-in"
                          loading="lazy"
                          onClick={() => openImageViewer(p.url, `${selected.name} preview ${p.key}`)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col overflow-hidden">
              <div className="mb-2 rounded-lg border border-[#2a3146] bg-[#1f2538]/50 px-3 py-2">
                <div className="text-[11px] text-gray-200">
                  {t("serversModal.notes.clickToLearn")}
                </div>
                <div className="text-[11px] text-gray-300">
                  {t("serversModal.notes.addYourServer")}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  className={cn(
                    "flex-1 relative overflow-hidden text-xs px-3 py-1.5 rounded-lg border transition",
                    activeTab === "recommended"
                      ? "border-blue-400/30 bg-[#1f2538]/70 font-bold animate-softGlowStrong"
                      : "border-[#2a3146] bg-[#1f2538]/70 text-gray-200 hover:bg-[#23293a]",
                  )}
                  onClick={() => setActiveTab("recommended")}
                >
                  {activeTab === "recommended" ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-linear-to-r from-blue-500/12 via-cyan-400/6 to-blue-500/12 bg-chroma-animated animate-chroma-shift animate-hue-slow"
                    />
                  ) : null}

                  <span className="relative z-10 bg-linear-to-r from-blue-500 via-cyan-400 to-blue-500 bg-clip-text text-transparent bg-chroma-animated animate-chroma-shift">
                    {t("serversModal.sections.recommended")}
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 text-xs px-3 py-1.5 rounded-lg border transition",
                    activeTab === "servers"
                      ? "border-blue-400/30 bg-[linear-gradient(90deg,#0268D4_0%,#02D4D4_100%)] bg-[length:100%_100%] bg-no-repeat bg-left text-white font-bold"
                      : "border-[#2a3146] bg-[#1f2538]/70 text-gray-200 hover:bg-[#23293a]",
                  )}
                  onClick={() => setActiveTab("servers")}
                >
                  {t("serversModal.sections.servers")}
                </button>
              </div>

              <div className="mb-2 rounded-lg border border-[#2a3146] bg-[#1f2538]/50 p-1 flex items-center gap-1">
                {([
                  { key: "all" as const, label: t("serversModal.filters.all") },
                  { key: "premium" as const, label: t("serversModal.filters.premium") },
                  { key: "noPremium" as const, label: t("serversModal.filters.noPremium") },
                ] satisfies Array<{ key: ServerCategory; label: string }>).map((opt) => (
                  <button
                    key={`${activeTab}:cat:${opt.key}`}
                    type="button"
                    className={cn(
                      "flex-1 text-xs px-3 py-1.5 rounded-md border transition",
                      category === opt.key
                        ? "border-blue-400/30 bg-[#23293a] text-white font-bold"
                        : "border-[#2a3146] bg-[#1f2538]/70 text-gray-200 hover:bg-[#23293a]",
                    )}
                    onClick={() => setCategory(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-1">
                {(activeTab === "recommended" ? filteredRecommended : filteredServers).length ? (
                  (activeTab === "recommended" ? filteredRecommended : filteredServers).map((s) => (
                    <div
                      key={`${activeTab}:${s.id}`}
                      className={cn(
                        "rounded-lg border p-2",
                        "hover:bg-[#23293a] transition cursor-pointer",
                        getRecommendedDecor(s) ? "relative overflow-hidden" : "border-[#2a3146]",
                        getRecommendedDecor(s) ? undefined : "bg-[#1f2538]/70",
                      )}
                      style={(() => {
                        const decor = getRecommendedDecor(s);
                        if (!decor) return undefined;
                        return {
                          backgroundColor: decor.fillColor,
                          borderColor: decor.borderColor,
                          boxShadow: decor.boxShadow,
                        } as React.CSSProperties;
                      })()}
                      onClick={() => setSelected(s)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelected(s);
                      }}
                    >
                      {(() => {
                        const decor = getRecommendedDecor(s);
                        if (!decor) return null;
                        return (
                          <>
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 opacity-20"
                              style={{ backgroundColor: decor.overlayColor }}
                            />
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 opacity-40"
                              style={{ backgroundImage: decor.edgeGradient }}
                            />
                          </>
                        );
                      })()}

                      <div className={getRecommendedDecor(s) ? "relative z-10" : undefined}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 flex flex-col items-center text-center">
                          {(() => {
                            const chroma = getRecommendedNameChroma(s);
                            return (
                              <div
                                className={cn(
                                  "text-xs truncate w-full",
                                  chroma
                                    ? chroma.className
                                    : "font-semibold text-white",
                                )}
                                style={chroma ? chroma.style : undefined}
                              >
                                {s.name}
                              </div>
                            );
                          })()}
                          <img
                            src={s.bannerUrl}
                            alt={s.name}
                            className="mt-1 w-[468px] h-[60px] max-w-full rounded-md border border-white/10 bg-white/5 object-cover"
                            loading="lazy"
                          />
                          <div className="mt-1 text-[11px] text-gray-300 font-mono">
                            {s.ip}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-[#2a3146] bg-[#23293a] hover:bg-[#2f3650] text-white transition",
                            copiedFlashKey ===
                              `${activeTab === "recommended" ? "rec" : "srv"}:${s.id}` &&
                              "animate-pulse ring-2 ring-blue-400/30",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyIp(
                              s.ip,
                              `${activeTab === "recommended" ? "rec" : "srv"}:${s.id}`,
                            );
                          }}
                          title={t("serversModal.actions.copyIp")}
                        >
                          {t("serversModal.actions.copyIp")}
                        </button>
                      </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-400">
                    {activeTab === "recommended"
                      ? t("serversModal.empty.noRecommended")
                      : t("serversModal.empty.noServers")}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {copiedNotice ? (
          <div className="pointer-events-none absolute left-1/2 bottom-5 -translate-x-1/2 animate-fade-in">
            <div className="rounded-full bg-black/60 border border-white/10 px-4 py-2 text-xs text-white">
              {copiedNotice}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ServersModal;
