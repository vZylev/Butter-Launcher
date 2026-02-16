import { logger } from "../logger";
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { META_DIRECTORY } from "../const";

export type AuthTokens = {
  identityToken: string;
  sessionToken: string;
};

const DEFAULT_AUTH_URL = "https://butter.lat/auth/login";
const DEFAULT_TIMEOUT_MS = 5_000;
// Because obviously the internet always responds instantly.

const OFFICIAL_ACCOUNT_DATA_BASE = "https://account-data.hytale.com";
const OFFICIAL_SESSIONS_BASE = "https://sessions.hytale.com";
const DEFAULT_HYTALE_CLIENT_UA = "HytaleClient/2026.02.06-aa1b071c2";
const DEFAULT_HYTALE_LAUNCHER_UA = "hytale-launcher/2026.02.12-54e579b";

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

const readPremiumRefreshTokenBestEffort = (): string | null => {
  const tok = readPremiumTokenObjectBestEffort();
  const refresh = typeof tok?.refresh_token === "string" ? tok.refresh_token.trim() : "";
  return refresh ? refresh : null;
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

const officialHeaders = (accessToken?: string): Record<string, string> => {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent":
      String(process.env.HYTALE_CLIENT_USER_AGENT ?? "").trim() || DEFAULT_HYTALE_CLIENT_UA,
  };

  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  return h;
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

const readEnvBool = (raw: unknown): boolean | null => {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return null;
};

const postJson = async (
  url: string,
  payload: unknown,
  timeoutMs: number,
  insecure: boolean,
): Promise<{ status: number; bodyText: string }> => {
  const u = new URL(url);
  const body = JSON.stringify(payload);
  // Turning objects into strings: the timeless art of pretending everything is fine.

  const isHttps = u.protocol === "https:";
  const transport = isHttps ? https : http;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body).toString(),
    Accept: "application/json",
  };

  const agent =
    isHttps && insecure
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
  // Yes, this can disable TLS verification. No, this isn't a good idea. But devs gonna dev.

  return await new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : undefined,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, bodyText });
        });
      },
    );

    req.on("error", reject);

    // Socket/request timeout.
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    // If it hangs longer than this, it probably wasn't meant to be.

    req.write(body);
    req.end();
  });
};

export const fetchAuthTokens = async (
  username: string,
  uuid: string,
): Promise<AuthTokens> => {
  const authUrl = (process.env.VITE_AUTH_URL || process.env.AUTH_URL || "").trim() ||
    DEFAULT_AUTH_URL;
  // One URL to rule them all (and occasionally return HTML by mistake).

  const timeoutMsRaw =
    (process.env.VITE_AUTH_TIMEOUT_MS || process.env.AUTH_TIMEOUT_MS || "").trim();
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : DEFAULT_TIMEOUT_MS;

  const insecure =
    readEnvBool(process.env.VITE_AUTH_INSECURE) ??
    readEnvBool(process.env.AUTH_INSECURE) ??
    false;

  const effectiveTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  if (insecure) {
    logger.warn(
      "VITE_AUTH_INSECURE enabled: TLS certificate verification is disabled for auth requests.",
    );
  }
  // If you're reading this in prod: please stop.

  try {
    const { status, bodyText } = await postJson(
      authUrl,
      { username, uuid },
      effectiveTimeout,
      insecure,
    );

    if (status !== 200) {
      const snippet = (bodyText || "").slice(0, 400);
      throw new Error(
        `Auth server error (${status}).` +
          (snippet ? ` Response: ${snippet}` : ""),
      );
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      const snippet = (bodyText || "").slice(0, 400);
      throw new Error(
        "Auth server did not return valid JSON." +
          (snippet ? ` Response: ${snippet}` : ""),
      );
    }
    // JSON: where all strings are valid until proven otherwise.

    const identityToken =
      typeof data?.identityToken === "string" ? data.identityToken : null;
    const sessionToken =
      typeof data?.sessionToken === "string" ? data.sessionToken : null;

    if (!identityToken || !sessionToken) {
      throw new Error("Auth server JSON missing identityToken/sessionToken.");
    }
    // Great, we got tokens. Now let's hope the game agrees.

    return { identityToken, sessionToken };
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      throw new Error(`Auth request timed out after ${effectiveTimeout}ms.`);
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
};

export const fetchAuthTokensPremium = async (
  _username: string,
  _uuid: string,
): Promise<AuthTokens> => {
  const r = await fetchPremiumLaunchAuth();
  return { identityToken: r.identityToken, sessionToken: r.sessionToken };
};
