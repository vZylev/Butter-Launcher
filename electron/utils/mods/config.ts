export type CurseForgeConfig = {
  baseUrl: string;
  gameId: number;
  apiKey?: string;
};

// Remote config fetching: trust, but verify… then retry anyway.

export type ModsConfig = {
  curseforge: CurseForgeConfig;
};

const DEFAULT_BASE_URL = "https://api.curseforge.com/v1";
const DEFAULT_GAME_ID = 70216;
const DEFAULT_REMOTE_CONFIG_URL = "https://updates.butterlauncher.tech/curseforge.json";

const asNonEmptyString = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : undefined;
};

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const normalizeConfig = (raw: any): ModsConfig => {
  const cf = raw?.curseforge ?? raw?.curseForge ?? raw?.cf ?? raw ?? {};

  const baseUrl = asNonEmptyString(cf?.baseUrl) ?? DEFAULT_BASE_URL;
  const gameId = asNumber(cf?.gameId) ?? DEFAULT_GAME_ID;
  const apiKey =
    asNonEmptyString(cf?.apiKey) ??
    asNonEmptyString(cf?.key) ??
    asNonEmptyString(cf?.xApiKey);

  return {
    curseforge: {
      baseUrl,
      gameId,
      apiKey,
    },
  };
};

let cached: { value: ModsConfig; fetchedAt: number } | null = null;

/**
 * Loads mods configuration.
 *
 * Precedence:
 * 1) Remote JSON from `BUTTER_MODS_CONFIG_URL` (runtime-rotatable)
 * 2) Env fallback `CURSEFORGE_API_KEY` (optional; mainly for local/dev)
 */
export const getModsConfig = async (): Promise<ModsConfig> => {
  const now = Date.now();
  const ttlMs = 5 * 60 * 1000;
  if (cached && now - cached.fetchedAt < ttlMs) return cached.value;

  const configUrl =
    asNonEmptyString(process.env.BUTTER_MODS_CONFIG_URL) ??
    DEFAULT_REMOTE_CONFIG_URL;

  if (configUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(configUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent":
            "ButterLauncher/1 (mods-config; +https://butterlauncher.tech)",
        },
      });

      clearTimeout(timeout);
      if (res.ok) {
        const raw = await res.json();
        const normalized = normalizeConfig(raw);
        // Note: we intentionally do NOT override the remote apiKey with env here.
        // This keeps runtime rotation working via the remote config URL.
        cached = { value: normalized, fetchedAt: now };
        return normalized;
      }
    } catch {
      // ignore and fall back
    }
  }

  const envKey = asNonEmptyString(process.env.CURSEFORGE_API_KEY);
  const fallback = {
    curseforge: {
      baseUrl: DEFAULT_BASE_URL,
      gameId: DEFAULT_GAME_ID,
      apiKey: envKey,
    },
  } satisfies ModsConfig;

  cached = { value: fallback, fetchedAt: now };
  return fallback;
};

export const clearModsConfigCache = () => {
  cached = null;
};
