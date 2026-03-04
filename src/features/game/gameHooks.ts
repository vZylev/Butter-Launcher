/**
 * Game-related feature hooks — extracted from Launcher.tsx.
 *
 * Contains: useNewsFeed, useHytaleFeed, useOnlinePatchHealth,
 *           useHostServerIpc, useVersionGating.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { stripHtmlToText } from "../../utils/sanitize";
import {
  IPC_FETCH_JSON,
  IPC_ONLINE_PATCH_HEALTH,
  IPC_ONLINE_PATCH_ENABLE,
  IPC_ONLINE_PATCH_DISABLE,
  IPC_ONLINE_PATCH_FIX_CLIENT,
  IPC_ONLINE_PATCH_FINISHED,
  IPC_ONLINE_UNPATCH_FINISHED,
  IPC_ONLINE_UNPATCH_ERROR,
  IPC_HOST_SERVER_LOG,
  IPC_HOST_SERVER_STARTED,
  IPC_HOST_SERVER_EXITED,
  IPC_HOST_SERVER_ERROR,
} from "../../ipc/channels";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NewsItem = {
  title: string;
  content: string;
  url?: string;
  date?: string;
  image?: string;
};

export type NewsFeed = {
  version: number;
  items: NewsItem[];
};

export type HytaleFeedItem = {
  title: string;
  description: string;
  url: string;
  image?: string;
  date?: string;
};

export type NewsContentPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const HYTALE_FEED_URL =
  "https://launcher.hytale.com/launcher-feed/release/feed.json";
const HYTALE_FEED_IMAGE_BASE =
  "https://launcher.hytale.com/launcher-feed/release/";

export const NEWS_URL =
  (import.meta as any).env?.VITE_NEWS_URL ||
  "https://updates.butterlauncher.tech/news.json";

export const normalizeHytaleUrl = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s.startsWith("http://")) return s.replace(/^http:\/\//i, "https://");
  if (s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `https://launcher.hytale.com${s}`;
  return null;
};

export const normalizeHytaleImage = (raw: unknown): string | undefined => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  return `${HYTALE_FEED_IMAGE_BASE}${s.replace(/^\.\//, "")}`;
};

export const normalizeHytaleFeed = (feed: any): HytaleFeedItem[] => {
  const items =
    Array.isArray(feed?.articles)
      ? feed.articles
      : Array.isArray(feed?.items)
        ? feed.items
        : Array.isArray(feed)
          ? feed
          : [];

  return items
    .map((x: any) => {
      const title = stripHtmlToText(x?.title, { maxLength: 160 });
      const description = stripHtmlToText(x?.description ?? x?.content, {
        maxLength: 480,
      });
      const url =
        normalizeHytaleUrl(x?.dest_url) ||
        normalizeHytaleUrl(x?.destUrl) ||
        normalizeHytaleUrl(x?.url) ||
        normalizeHytaleUrl(x?.link);
      if (!title || !url) return null;
      const image =
        normalizeHytaleImage(x?.image_url) ||
        normalizeHytaleImage(x?.imageUrl) ||
        normalizeHytaleImage(x?.image);
      const date =
        typeof x?.publish_date === "string"
          ? x.publish_date
          : typeof x?.publishDate === "string"
            ? x.publishDate
            : undefined;
      return { title, description, url, image, date } satisfies HytaleFeedItem;
    })
    .filter(Boolean) as HytaleFeedItem[];
};

export const parseNewsContent = (content: string): NewsContentPart[] => {
  const parts: NewsContentPart[] = [];
  const re = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const start = match.index;
    const raw = match[0];
    if (start > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, start) });
    }
    const trimmed = raw.replace(/[),.;\]]+$/g, "");
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    parts.push({ type: "link", value: trimmed, href });
    lastIndex = start + raw.length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }
  return parts.length ? parts : [{ type: "text", value: content }];
};

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Loads Butter Launcher news feed on mount.
 */
export function useNewsFeed() {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const normalize = (feed: any): NewsItem[] => {
      const items = Array.isArray(feed?.items) ? feed.items : [];
      return items
        .filter((x: any) => x && typeof x.title === "string")
        .map((x: any) => {
          const title = stripHtmlToText(x.title, { maxLength: 160 });
          const content = stripHtmlToText(x.content, { maxLength: 8000 });
          if (!title) return null;
          return {
            title,
            content,
            url: typeof x.url === "string" ? x.url : undefined,
            date: typeof x.date === "string" ? x.date : undefined,
            image: typeof x.image === "string" ? x.image : undefined,
          } satisfies NewsItem;
        })
        .filter(Boolean) as NewsItem[];
    };

    const load = async () => {
      try {
        const remote = (await window.ipcRenderer.invoke(
          IPC_FETCH_JSON,
          NEWS_URL,
        )) as NewsFeed;
        const normalized = normalize(remote);
        if (!cancelled && normalized.length) {
          setNewsItems(normalized.slice(0, 3));
          return;
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch("/news.json", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load local news.json");
        const local = (await res.json()) as NewsFeed;
        const normalized = normalize(local);
        if (!cancelled && normalized.length) {
          setNewsItems(normalized.slice(0, 3));
        }
      } catch {
        if (!cancelled) {
          setNewsItems([
            {
              title: "News unavailable",
              content: "Unable to load updates feed. Check your connection or try again later.",
            },
          ]);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return newsItems;
}

/**
 * Lazy-loads Hytale launcher feed when open.
 */
export function useHytaleFeed(open: boolean) {
  const [items, setItems] = useState<HytaleFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (items.length) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const raw = await window.ipcRenderer.invoke(IPC_FETCH_JSON, HYTALE_FEED_URL, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "application/json,text/plain,*/*",
          },
        });
        const normalized = normalizeHytaleFeed(raw);
        if (!cancelled) {
          setItems(normalized.slice(0, 10));
          if (!normalized.length) setError("No Hytale news found.");
        }
      } catch {
        if (!cancelled) setError("Failed to load Hytale news.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, items.length]);

  return { items, loading, error };
}

/**
 * Online-patch health tracking & actions.
 */
export function useOnlinePatchHealth(
  gameDir: string | null,
  selected: GameVersion | null | undefined,
  patchAvailable: boolean,
) {
  const [onlinePatchEnabled, setOnlinePatchEnabled] = useState(false);
  const [needsFixClient, setNeedsFixClient] = useState(false);
  const [patchOutdated, setPatchOutdated] = useState(false);

  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const s = ++seq.current;

    if (!patchAvailable || !gameDir || !selected) {
      if (s !== seq.current) return;
      setOnlinePatchEnabled(false);
      setNeedsFixClient(false);
      setPatchOutdated(false);
      return;
    }
    try {
      const health = (await window.ipcRenderer.invoke(
        IPC_ONLINE_PATCH_HEALTH,
        gameDir,
        selected,
      )) as {
        enabled?: boolean;
        needsFixClient?: boolean;
        patchOutdated?: boolean;
      };
      if (s !== seq.current) return;
      setOnlinePatchEnabled(!!health?.enabled);
      setNeedsFixClient(!!health?.needsFixClient);
      setPatchOutdated(!!health?.patchOutdated);
    } catch {
      if (s !== seq.current) return;
      setOnlinePatchEnabled(false);
      setNeedsFixClient(false);
      setPatchOutdated(false);
    }
  }, [gameDir, patchAvailable, selected]);

  // Refresh on mount & whenever deps change.
  useEffect(() => { void refresh(); }, [refresh]);

  // Refresh when online-patch finishes or unpatches.
  useEffect(() => {
    if (!gameDir) return;
    const onDone = () => void refresh();
    window.ipcRenderer.on(IPC_ONLINE_PATCH_FINISHED, onDone);
    window.ipcRenderer.on(IPC_ONLINE_UNPATCH_FINISHED, onDone);
    return () => {
      window.ipcRenderer.off(IPC_ONLINE_PATCH_FINISHED, onDone);
      window.ipcRenderer.off(IPC_ONLINE_UNPATCH_FINISHED, onDone);
    };
  }, [gameDir, refresh]);

  const startPatch = useCallback(() => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send(IPC_ONLINE_PATCH_ENABLE, gameDir, selected);
  }, [gameDir, selected]);

  const disablePatch = useCallback(() => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send(IPC_ONLINE_PATCH_DISABLE, gameDir, selected);
  }, [gameDir, selected]);

  const disablePatchAndWait = useCallback(async (): Promise<boolean> => {
    if (!gameDir || !selected) return true;
    if (!onlinePatchEnabled) return true;

    return new Promise<boolean>((resolve) => {
      let done = false;
      const timeoutMs = 120_000;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(false);
      }, timeoutMs);

      window.ipcRenderer.once(IPC_ONLINE_UNPATCH_FINISHED, () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(true);
      });

      window.ipcRenderer.once(IPC_ONLINE_UNPATCH_ERROR, () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(false);
      });

      window.ipcRenderer.send(IPC_ONLINE_PATCH_DISABLE, gameDir, selected);
    });
  }, [gameDir, selected, onlinePatchEnabled]);

  const fixClient = useCallback(() => {
    if (!gameDir || !selected) return;
    window.ipcRenderer.send(IPC_ONLINE_PATCH_FIX_CLIENT, gameDir, selected);
  }, [gameDir, selected]);

  return {
    onlinePatchEnabled,
    needsFixClient,
    patchOutdated,
    refresh,
    startPatch,
    disablePatch,
    disablePatchAndWait,
    fixClient,
  };
}

/**
 * Host-server IPC event forwarding.
 */
export function useHostServerIpc() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const lastLogRef = useRef<{ key: string; ts: number } | null>(null);

  const pushLog = useCallback((line: string) => {
    const s = String(line ?? "");
    if (!s.trim()) return;
    setLogs((prev) => {
      const next = [...prev, s];
      if (next.length > 2000) return next.slice(next.length - 2000);
      return next;
    });
  }, []);

  useEffect(() => {
    const onLog = (_: any, payload: any) => {
      const line = typeof payload?.line === "string" ? payload.line : "";
      if (!line) return;
      const key = line.replace(/\r/g, "");
      const now = Date.now();
      const prev = lastLogRef.current;
      if (prev && prev.key === key && now - prev.ts < 250) return;
      lastLogRef.current = { key, ts: now };
      pushLog(line);
    };

    const onStarted = (_: any, payload: any) => {
      setRunning(true);
      const pid = payload?.pid;
      const serverDir = payload?.serverDir;
      pushLog(`[Launcher] Server started${typeof pid === "number" ? ` (pid ${pid})` : ""}`);
      if (typeof serverDir === "string" && serverDir.trim()) {
        pushLog(`[Launcher] CWD: ${serverDir}`);
      }
    };

    const onExited = (_: any, payload: any) => {
      setRunning(false);
      const code = payload?.code;
      const signal = payload?.signal;
      pushLog(
        `[Launcher] Server exited${typeof code === "number" ? ` (code ${code})` : ""}${signal ? ` (signal ${signal})` : ""}`,
      );
    };

    const onError = (_: any, payload: any) => {
      setRunning(false);
      const code = typeof payload?.code === "string" ? payload.code : "UNKNOWN";
      const message = typeof payload?.message === "string" ? payload.message : "";
      pushLog(`[Launcher] Server error: ${code}${message ? ` - ${message}` : ""}`);
    };

    window.ipcRenderer.on(IPC_HOST_SERVER_LOG, onLog);
    window.ipcRenderer.on(IPC_HOST_SERVER_STARTED, onStarted);
    window.ipcRenderer.on(IPC_HOST_SERVER_EXITED, onExited);
    window.ipcRenderer.on(IPC_HOST_SERVER_ERROR, onError);

    return () => {
      window.ipcRenderer.off(IPC_HOST_SERVER_LOG, onLog);
      window.ipcRenderer.off(IPC_HOST_SERVER_STARTED, onStarted);
      window.ipcRenderer.off(IPC_HOST_SERVER_EXITED, onExited);
      window.ipcRenderer.off(IPC_HOST_SERVER_ERROR, onError);
    };
  }, [pushLog]);

  return { running, logs, pushLog };
}

/**
 * Version gating for authenticated accounts.
 */
export function useVersionGating(
  availableVersions: GameVersion[],
  selectedVersion: number,
  setSelectedVersion: (i: number) => void,
  hasBuild1Installed: boolean,
  restrictVersionsUntilBuild1: boolean,
) {
  useEffect(() => {
    if (!restrictVersionsUntilBuild1) return;
    if (hasBuild1Installed) return;
    const current = availableVersions?.[selectedVersion] ?? null;
    if (!current) return;
    if (current.installed) return;
    if (current.build_index === 1 || current.isLatest) return;

    const latestIdx = availableVersions.findIndex((v) => !!v.isLatest);
    const fallbackIdx = latestIdx !== -1 ? latestIdx : 0;
    if (fallbackIdx !== selectedVersion) setSelectedVersion(fallbackIdx);
  }, [
    restrictVersionsUntilBuild1,
    hasBuild1Installed,
    availableVersions,
    selectedVersion,
    setSelectedVersion,
  ]);
}
