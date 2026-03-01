import { logger } from "../logger";
import fs from "node:fs";
import path from "node:path";
import { META_DIRECTORY } from "../const";
import { customAuthProvider } from "../dynamicModules/customAuthProvider";

export type AuthTokens = {
  identityToken: string;
  sessionToken: string;
};

const OFFICIAL_ACCOUNT_DATA_BASE = "https://account-data.hytale.com";
const OFFICIAL_SESSIONS_BASE = "https://sessions.hytale.com";
const DEFAULT_HYTALE_LAUNCHER_UA = "hytale-launcher/2026.02.12-54e579b";
const OFFICIAL_ISSUER = "https://sessions.hytale.com";

const premiumHttpDebugEnabled = () => {
  const raw = String(process.env.HYTALE_PREMIUM_HTTP_DEBUG ?? process.env.PREMIUM_HTTP_DEBUG ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

const redactAuth = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = { ...headers };
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === "authorization") out[k] = "<redacted>";
  }
  return out;
};

const snippet = (s: string, maxLen: number = 600) => {
  const t = String(s ?? "");
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
};

const logPremiumHttp = (level: "info" | "warn" | "error", msg: string, data: any) => {
  if (!premiumHttpDebugEnabled() && level === "info") return;
  (logger as any)[level](msg, data);
};

const PREMIUM_AUTH_FILE = path.join(META_DIRECTORY, "premium-auth.json");

const OFFLINE_TOKENS_FILE = path.join(META_DIRECTORY, "offline-tokens.json");
const OFFICIAL_JWKS_CACHE_FILE = path.join(META_DIRECTORY, "official-jwks.json");

type OfflineTokensStore = {
  updatedAt?: string;
  // New: store tokens by issuer so we can keep multiple variants.
  tokensByIssuer?: Record<string, Record<string, string>>;
  // Legacy: older versions stored just one token map by uuid.
  tokens?: Record<string, string>;
};

type Jwks = { keys: any[] };

export const ensureCustomJwks = async (opts?: { forceRefresh?: boolean }): Promise<Jwks | null> => {
  return await customAuthProvider.ensureCustomJwks(opts);
};

const readOfficialJwksBestEffort = (): Jwks | null => {
  try {
    if (!fs.existsSync(OFFICIAL_JWKS_CACHE_FILE)) return null;
    const raw = fs.readFileSync(OFFICIAL_JWKS_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const keys = parsed && typeof parsed === "object" ? (parsed as any).keys : null;
    if (!Array.isArray(keys)) return null;
    return { keys };
  } catch {
    return null;
  }
};

const writeOfficialJwksBestEffort = (jwks: Jwks) => {
  try {
    fs.mkdirSync(path.dirname(OFFICIAL_JWKS_CACHE_FILE), { recursive: true });
    const tmp = OFFICIAL_JWKS_CACHE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(jwks, null, 2), "utf8");
    fs.renameSync(tmp, OFFICIAL_JWKS_CACHE_FILE);
  } catch {
    // ignore
  }
};

const refreshOfficialJwks = async (): Promise<Jwks> => {
  const url = `${OFFICIAL_SESSIONS_BASE}/.well-known/jwks.json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { Accept: "application/json" } });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Failed to fetch Official JWKS (HTTP ${res.status})`);
    }
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const keys = json && typeof json === "object" ? json.keys : null;
    if (!Array.isArray(keys) || keys.length < 1) {
      throw new Error("Official JWKS invalid or empty");
    }
    const jwks: Jwks = { keys };
    writeOfficialJwksBestEffort(jwks);
    return jwks;
  } finally {
    try {
      clearTimeout(timer);
    } catch {
      // ignore
    }
  }
};

export const ensureOfficialJwks = async (opts?: { forceRefresh?: boolean }): Promise<Jwks | null> => {
  if (!opts?.forceRefresh) {
    const cached = readOfficialJwksBestEffort();
    if (cached) return cached;
  }
  try {
    return await refreshOfficialJwks();
  } catch {
    return readOfficialJwksBestEffort();
  }
};

const readOfflineTokensStoreBestEffort = (): OfflineTokensStore => {
  try {
    if (!fs.existsSync(OFFLINE_TOKENS_FILE)) return { tokens: {} };
    const raw = fs.readFileSync(OFFLINE_TOKENS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { tokens: {} };

    const tokensByIssuerRaw = (parsed as any).tokensByIssuer;
    const tokensRaw = (parsed as any).tokens;

    const tokensByIssuer =
      tokensByIssuerRaw && typeof tokensByIssuerRaw === "object"
        ? (tokensByIssuerRaw as Record<string, Record<string, string>>)
        : undefined;

    const tokens =
      tokensRaw && typeof tokensRaw === "object"
        ? (tokensRaw as Record<string, string>)
        : undefined;

    return {
      updatedAt: (parsed as any).updatedAt,
      tokensByIssuer,
      tokens,
    };
  } catch {
    return { tokens: {} };
  }
};

const writeOfflineTokensStoreBestEffort = (next: OfflineTokensStore) => {
  try {
    fs.mkdirSync(path.dirname(OFFLINE_TOKENS_FILE), { recursive: true });
    const tmp = OFFLINE_TOKENS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmp, OFFLINE_TOKENS_FILE);
  } catch {
    // ignore
  }
};

export const readStoredOfflineTokenBestEffort = (
  uuid: string,
  issuer?: string | null,
): string | null => {
  const u = String(uuid ?? "").trim().toLowerCase();
  if (!u) return null;
  const st = readOfflineTokensStoreBestEffort();

  const iss = String(issuer ?? "").trim();
  if (iss) {
    const tok = st.tokensByIssuer?.[iss]?.[u] ?? null;
    return typeof tok === "string" && tok.trim() ? tok.trim() : null;
  }

  // Fallback: ask dynamic provider for issuer preference, then fall back to official issuer.
  const preferred = customAuthProvider.getDefaultIssuerPreference(OFFICIAL_ISSUER);
  for (const iss of preferred) {
    const tok = st.tokensByIssuer?.[iss]?.[u] ?? null;
    if (typeof tok === "string" && tok.trim()) return tok.trim();
  }

  const legacy = st.tokens?.[u] ?? null;
  return typeof legacy === "string" && legacy.trim() ? legacy.trim() : null;
};

const storeOfflineTokenBestEffort = (uuid: string, issuer: string, token: string) => {
  const u = String(uuid ?? "").trim().toLowerCase();
  const iss = String(issuer ?? "").trim();
  const t = String(token ?? "").trim();
  if (!u || !iss || !t) return;
  const cur = readOfflineTokensStoreBestEffort();

  const tokensByIssuer: Record<string, Record<string, string>> = {
    ...(cur.tokensByIssuer ?? {}),
  };
  const bucket = { ...(tokensByIssuer[iss] ?? {}) };
  bucket[u] = t;
  tokensByIssuer[iss] = bucket;

  writeOfflineTokensStoreBestEffort({
    updatedAt: new Date().toISOString(),
    tokensByIssuer,
    // Keep legacy field as a best-effort compatibility mirror.
    tokens: { ...(cur.tokens ?? {}), [u]: t },
  });
};

const readPremiumTokenObjectBestEffort = (): any | null => {
  try {
    if (!fs.existsSync(PREMIUM_AUTH_FILE)) return null;
    const raw = fs.readFileSync(PREMIUM_AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const tok = (parsed as any)?.token;
    if (!tok || typeof tok !== "object") return null;
    return tok;
  } catch {
    return null;
  }
};

const readPremiumAccessTokenBestEffort = (): string | null => {
  const tok = readPremiumTokenObjectBestEffort();
  const access = typeof tok?.access_token === "string" ? tok.access_token.trim() : "";
  return access ? access : null;
};

const writePremiumTokenObjectBestEffort = (nextToken: any) => {
  try {
    if (!fs.existsSync(PREMIUM_AUTH_FILE)) return;
    const raw = fs.readFileSync(PREMIUM_AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    (parsed as any).token = nextToken;
    (parsed as any).obtainedAt = new Date().toISOString();
    fs.writeFileSync(PREMIUM_AUTH_FILE, JSON.stringify(parsed, null, 2), "utf8");
  } catch {
    // ignore
  }
};

const nowSec = () => Math.floor(Date.now() / 1000);

const getTokenExpiresAtSec = (tok: any): number | null => {
  const expiresAt = typeof tok?.expires_at === "number" && Number.isFinite(tok.expires_at) ? Math.floor(tok.expires_at) : null;
  if (expiresAt) return expiresAt;
  const obtainedAt = typeof tok?.obtained_at === "number" && Number.isFinite(tok.obtained_at) ? Math.floor(tok.obtained_at) : null;
  const expiresIn = typeof tok?.expires_in === "number" && Number.isFinite(tok.expires_in) ? Math.floor(tok.expires_in) : null;
  if (obtainedAt && expiresIn) return obtainedAt + expiresIn;
  return null;
};

const refreshPremiumAccessTokenIfNeeded = async (): Promise<string | null> => {
  const tok = readPremiumTokenObjectBestEffort();
  if (!tok) return null;

  const access = typeof tok?.access_token === "string" ? tok.access_token.trim() : "";
  const refresh = typeof tok?.refresh_token === "string" ? tok.refresh_token.trim() : "";
  if (!refresh) return access || null;

  const expiresAt = getTokenExpiresAtSec(tok);
  const skew = 90;
  if (access && typeof expiresAt === "number" && expiresAt - skew > nowSec()) return access;

  const tokenUrlRaw =
    String(process.env.HYTALE_OAUTH_TOKEN_URL ?? "").trim() ||
    "https://oauth.accounts.hytale.com/oauth2/token";

  // Match official launcher: Basic auth with client_id "hytale-launcher" and empty secret.
  const basicAuth = `Basic ${Buffer.from("hytale-launcher:").toString("base64")}`;
  const userAgent =
    String(process.env.HYTALE_OAUTH_USER_AGENT ?? process.env.HYTALE_LAUNCHER_USER_AGENT ?? "").trim() ||
    "hytale-launcher/2026.02.06-b95ae53";
  const launcherBranch =
    String(process.env.HYTALE_OAUTH_LAUNCHER_BRANCH ?? process.env.HYTALE_LAUNCHER_BRANCH ?? "").trim() ||
    "release";
  const launcherVersion =
    String(process.env.HYTALE_OAUTH_LAUNCHER_VERSION ?? process.env.HYTALE_LAUNCHER_VERSION ?? "").trim() ||
    "2026.02.06-b95ae53";

  try {
    const tokenUrl = new URL(tokenUrlRaw);
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refresh);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": userAgent,
      Authorization: basicAuth,
    };
    if (launcherBranch) headers["X-Hytale-Launcher-Branch"] = launcherBranch;
    if (launcherVersion) headers["X-Hytale-Launcher-Version"] = launcherVersion;

    const resp = await fetch(tokenUrl.toString(), { method: "POST", headers, body });
    const text = await resp.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!resp.ok) {
      logPremiumHttp("warn", "Premium HTTP refresh_token response", {
        req: {
          method: "POST",
          url: tokenUrl.toString(),
          headers: redactAuth(headers),
          body: "grant_type=refresh_token&refresh_token=<redacted>",
        },
        res: { status: resp.status, body: snippet(text, 800) },
      });
      return access || null;
    }

    const nextAccess = typeof json?.access_token === "string" ? json.access_token.trim() : "";
    if (!nextAccess) return access || null;

    const obtainedAt = nowSec();
    const expiresIn = typeof json?.expires_in === "number" && Number.isFinite(json.expires_in) ? Math.floor(json.expires_in) : 3600;
    const expiresAt = obtainedAt + Math.max(1, expiresIn);

    const merged = {
      ...tok,
      ...json,
      access_token: nextAccess,
      refresh_token:
        typeof json?.refresh_token === "string" && json.refresh_token.trim()
          ? json.refresh_token.trim()
          : tok.refresh_token,
      obtained_at: obtainedAt,
      expires_in: expiresIn,
      expires_at: expiresAt,
    };
    writePremiumTokenObjectBestEffort(merged);
    return nextAccess;
  } catch (e) {
    logger.warn("Premium token refresh threw", e);
    return access || null;
  }
};

const officialLauncherHeaders = (accessToken: string): Record<string, string> => {
  const userAgent =
    String(process.env.HYTALE_LAUNCHER_USER_AGENT ?? "").trim() ||
    String(process.env.HYTALE_CLIENT_USER_AGENT ?? "").trim() ||
    DEFAULT_HYTALE_LAUNCHER_UA;

  const launcherBranch =
    String(process.env.HYTALE_LAUNCHER_BRANCH ?? "").trim() ||
    String(process.env.HYTALE_OAUTH_LAUNCHER_BRANCH ?? "").trim() ||
    "release";

  const launcherVersion =
    String(process.env.HYTALE_LAUNCHER_VERSION ?? "").trim() ||
    String(process.env.HYTALE_OAUTH_LAUNCHER_VERSION ?? "").trim() ||
    userAgent.split("/")[1] ||
    "";

  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent,
    Authorization: `Bearer ${accessToken}`,
    "X-Hytale-Launcher-Branch": launcherBranch,
  };
  if (launcherVersion) h["X-Hytale-Launcher-Version"] = launcherVersion;
  // fetch will transparently decode gzip; adding the header keeps parity.
  h["Accept-Encoding"] = "gzip";
  return h;
};

export type PremiumLauncherProfile = {
  username: string;
  uuid: string;
};

const readPremiumStoredProfileBestEffort = (): PremiumLauncherProfile | null => {
  try {
    if (!fs.existsSync(PREMIUM_AUTH_FILE)) return null;
    const raw = fs.readFileSync(PREMIUM_AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const p = (parsed as any)?.profile;
    const username = typeof p?.username === "string" ? p.username.trim() : "";
    const uuid = typeof p?.uuid === "string" ? p.uuid.trim() : "";
    if (!username || !uuid) return null;
    return { username, uuid };
  } catch {
    return null;
  }
};

const normalizeOfficialUuid = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      s,
    )
  ) {
    return s.toLowerCase();
  }
  return null;
};

const normalizeOfficialUsername = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s : null;
};

const getOfficialOsArch = (): { os: string; arch: string } => {
  const os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  return { os, arch };
};

export const fetchPremiumLauncherPrimaryProfile = async (
  opts?: { forceNetwork?: boolean },
): Promise<PremiumLauncherProfile> => {
  const forceNetwork = !!opts?.forceNetwork;
  if (!forceNetwork) {
    const cached = readPremiumStoredProfileBestEffort();
    if (cached) return cached;
  }

  const accessToken =
    (await refreshPremiumAccessTokenIfNeeded()) ?? readPremiumAccessTokenBestEffort();
  if (!accessToken) {
    throw new Error("Premium login required (missing access token)");
  }

  const { os, arch } = getOfficialOsArch();
  const url = `${OFFICIAL_ACCOUNT_DATA_BASE}/my-account/get-launcher-data?arch=${encodeURIComponent(
    arch,
  )}&os=${encodeURIComponent(os)}`;

  const res = await fetch(url, { method: "GET", headers: officialLauncherHeaders(accessToken) });
  logPremiumHttp("info", "Premium HTTP get-launcher-data", {
    req: { method: "GET", url, headers: redactAuth(officialLauncherHeaders(accessToken)) },
    res: { status: res.status },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    logPremiumHttp("warn", "Premium HTTP get-launcher-data response", {
      req: { method: "GET", url, headers: redactAuth(officialLauncherHeaders(accessToken)) },
      res: { status: res.status, body: snippet(bodyText, 800) },
    });
    throw new Error(`get-launcher-data failed (HTTP ${res.status})${bodyText ? `: ${snippet(bodyText, 200)}` : ""}`);
  }
  const rawBody = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    json = null;
  }
  logPremiumHttp("info", "Premium HTTP get-launcher-data body", {
    res: {
      status: res.status,
      body: snippet(rawBody, 1200),
    },
  });
  if (!json) throw new Error("get-launcher-data returned non-JSON response");
  const profiles: any[] = Array.isArray(json?.profiles) ? json.profiles : [];
  const pickBestProfile = (): any | null => {
    if (!profiles.length) return null;
    // Prefer a profile that has the base game entitlement.
    const withEntitlement = profiles.find((p) => {
      const ent = Array.isArray(p?.entitlements) ? p.entitlements : [];
      return ent.includes("game.base");
    });
    return withEntitlement ?? profiles[0];
  };

  const best = pickBestProfile();
  const username = normalizeOfficialUsername(best?.username);
  const uuid = normalizeOfficialUuid(best?.uuid);
  if (!username || !uuid) {
    throw new Error("get-launcher-data returned no valid profile username/uuid");
  }

  return { username, uuid };
};

export const createPremiumGameSession = async (profileUuid: string): Promise<AuthTokens> => {
  const accessToken =
    (await refreshPremiumAccessTokenIfNeeded()) ?? readPremiumAccessTokenBestEffort();
  if (!accessToken) {
    throw new Error("Premium login required (missing access token)");
  }

  const url = `${OFFICIAL_SESSIONS_BASE}/game-session/new`;
  const reqHeaders = {
    ...officialLauncherHeaders(accessToken),
    "Content-Type": "application/json",
  };
  // Must match official launcher format.
  // Example payload length is 48 bytes: {"uuid":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
  const reqBodyObj = { uuid: profileUuid };
  const reqBody = JSON.stringify(reqBodyObj);

  logPremiumHttp("info", "Premium HTTP game-session/new", {
    req: {
      method: "POST",
      url,
      headers: redactAuth(reqHeaders),
      body: {
        uuid: `${profileUuid.slice(0, 8)}…${profileUuid.slice(-6)}`,
        contentLength: Buffer.byteLength(reqBody),
      },
    },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: reqHeaders,
    body: reqBody,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    logPremiumHttp("warn", "Premium HTTP game-session/new response", {
      req: {
        method: "POST",
        url,
        headers: redactAuth(reqHeaders),
        body: { uuid: `${profileUuid.slice(0, 8)}…${profileUuid.slice(-6)}` },
      },
      res: { status: res.status, body: snippet(text, 1200) },
    });
    throw new Error(
      `game-session/new failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  logPremiumHttp("info", "Premium HTTP game-session/new body", {
    res: { status: res.status, body: snippet(text, 1200) },
  });

  const identityToken = typeof json?.identityToken === "string" ? json.identityToken.trim() : "";
  const sessionToken = typeof json?.sessionToken === "string" ? json.sessionToken.trim() : "";
  if (!identityToken || !sessionToken) {
    throw new Error("game-session/new returned missing identityToken/sessionToken");
  }

  return { identityToken, sessionToken };
};

export const fetchPremiumLaunchAuth = async (): Promise<{
  username: string;
  uuid: string;
  identityToken: string;
  sessionToken: string;
}> => {
  const profile = await fetchPremiumLauncherPrimaryProfile();
  try {
    const tokens = await createPremiumGameSession(profile.uuid);
    return { ...profile, ...tokens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If the cached profile is stale/wrong, re-fetch launcher-data and retry once.
    if (/invalid game account for user/i.test(msg)) {
      const freshProfile = await fetchPremiumLauncherPrimaryProfile({ forceNetwork: true });
      const tokens = await createPremiumGameSession(freshProfile.uuid);
      return { ...freshProfile, ...tokens };
    }
    throw e;
  }
};

const postJsonFetch = async (opts: {
  url: string;
  payload: unknown;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<{ status: number; bodyText: string }> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(250, opts.timeoutMs));
  try {
    const body = JSON.stringify(opts.payload ?? {});
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...opts.headers,
      },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, bodyText: text };
  } finally {
    try {
      clearTimeout(timer);
    } catch {
      // ignore
    }
  }
};

const extractOfflineTokenFromResponse = (uuid: string, bodyText: string): string | null => {
  const u = String(uuid ?? "").trim().toLowerCase();
  if (!u) return null;
  let json: any = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = null;
  }
  const map = json && typeof json === "object" ? (json as any).offlineTokens : null;
  if (!map || typeof map !== "object") return null;
  const tok = (map as any)[u] ?? (map as any)[uuid] ?? null;
  return typeof tok === "string" && tok.trim() ? tok.trim() : null;
};

const extractOfflineTokenFromResponseField = (
  uuid: string,
  bodyText: string,
  field: string,
): string | null => {
  const u = String(uuid ?? "").trim().toLowerCase();
  if (!u) return null;
  let json: any = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = null;
  }
  const map = json && typeof json === "object" ? (json as any)[field] : null;
  if (!map || typeof map !== "object") return null;
  const tok = (map as any)[u] ?? (map as any)[uuid] ?? null;
  return typeof tok === "string" && tok.trim() ? tok.trim() : null;
};

export const refreshOfflineToken = async (opts: {
  accountType: "premium" | "custom";
  username: string;
  uuid: string;
  issuer?: string | null;
}): Promise<string> => {
  const timeoutMs = 8_000;
  const uuid = String(opts.uuid ?? "").trim().toLowerCase();
  const username = String(opts.username ?? "").trim();
  if (!uuid) throw new Error("Missing uuid");
  if (!username && opts.accountType !== "premium") throw new Error("Missing username");

  if (opts.accountType === "premium") {
    const accessToken =
      (await refreshPremiumAccessTokenIfNeeded()) ?? readPremiumAccessTokenBestEffort();
    if (!accessToken) throw new Error("Premium login required (missing access token)");

    const url = `${OFFICIAL_SESSIONS_BASE}/game-session/offline`;
    const reqHeaders = {
      ...officialLauncherHeaders(accessToken),
    };

    logPremiumHttp("info", "Premium HTTP game-session/offline", {
      req: { method: "POST", url, headers: redactAuth(reqHeaders) },
    });

    const { status, bodyText } = await postJsonFetch({
      url,
      payload: { uuid },
      headers: reqHeaders,
      timeoutMs,
    });

    if (status !== 200) {
      logPremiumHttp("warn", "Premium HTTP game-session/offline response", {
        req: { method: "POST", url, headers: redactAuth(reqHeaders) },
        res: { status, body: snippet(bodyText, 1200) },
      });
      throw new Error(`game-session/offline failed (HTTP ${status})`);
    }

    const tok = extractOfflineTokenFromResponse(uuid, bodyText);
    if (!tok) {
      logPremiumHttp("warn", "Premium HTTP game-session/offline missing token", {
        res: { status, body: snippet(bodyText, 1200) },
      });
      throw new Error("game-session/offline returned missing offline token");
    }
    storeOfflineTokenBestEffort(uuid, OFFICIAL_ISSUER, tok);
    return tok;
  }

  // Custom provider sessions
  const { status, bodyText, customIssuer } = await customAuthProvider.postCustomOfflineTokenRequest({
    username,
    uuid,
    timeoutMs,
  });

  if (status !== 200) {
    const sn = snippet(bodyText, 800);
    throw new Error(`Custom game-session/offline failed (HTTP ${status})${sn ? `: ${sn}` : ""}`);
  }

  // Custom endpoint can return multiple variants.
  const customToken = extractOfflineTokenFromResponse(uuid, bodyText);
  const officialIssuerToken = extractOfflineTokenFromResponseField(
    uuid,
    bodyText,
    "offlineTokensOfficialIssuer",
  );

  if (customToken) storeOfflineTokenBestEffort(uuid, customIssuer, customToken);
  if (officialIssuerToken) storeOfflineTokenBestEffort(uuid, OFFICIAL_ISSUER, officialIssuerToken);

  const wantIssuer = String(opts.issuer ?? "").trim();
  if (wantIssuer === OFFICIAL_ISSUER) {
    if (officialIssuerToken) return officialIssuerToken;
    throw new Error("Custom game-session/offline missing official-issuer offline token");
  }

  // Default to custom issuer.
  if (customToken) return customToken;
  throw new Error("Custom game-session/offline returned missing offline token");
};

export const ensureOfflineToken = async (opts: {
  accountType: "premium" | "custom";
  username: string;
  uuid: string;
  issuer?: string | null;
  forceRefresh?: boolean;
}): Promise<string> => {
  const uuid = String(opts.uuid ?? "").trim().toLowerCase();
  if (!uuid) throw new Error("Missing uuid");

  if (!opts.forceRefresh) {
    const cached = readStoredOfflineTokenBestEffort(uuid, opts.issuer ?? null);
    if (cached) return cached;
  }

  return await refreshOfflineToken({
    accountType: opts.accountType,
    username: opts.username,
    uuid,
    issuer: opts.issuer ?? null,
  });
};

export const fetchCustomAuthTokens = async (username: string, uuid: string): Promise<AuthTokens> => {
  return await customAuthProvider.fetchCustomAuthTokens(username, uuid);
};

export const fetchAuthTokensPremium = async (
  _username: string,
  _uuid: string,
): Promise<AuthTokens> => {
  const r = await fetchPremiumLaunchAuth();
  return { identityToken: r.identityToken, sessionToken: r.sessionToken };
};
