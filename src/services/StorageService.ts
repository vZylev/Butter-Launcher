/**
 * A typed, validated localStorage wrapper.
 *
 * Every key is defined once with its type.  No more `JSON.parse`
 * scattered across the codebase, no more silent runtime errors
 * when somebody misses a field.
 */

// ── Key schema ─────────────────────────────────────────────────

export type StorageSchema = {
  // Auth
  accountType: "premium" | "custom" | "";
  username: string;
  customUUID: string;

  // Discord RPC
  enableRPC: "true" | "false";

  // Language
  "butter:language": string;

  // Matcha
  "matcha:token": string;

  // Version selection
  "selectedVersion:release": string;
  "selectedVersion:pre-release": string;

  // Version cache
  installedVersions: string; // JSON
  "versionDetailsCache:v1": string; // JSON
  "versionDetailsMeta:v1": string; // JSON

  // Suppress launcher update
  suppressLauncherUpdateVersion: string;
};

// Dynamic keys (parameterised patterns).
export type DynamicKeyPrefix =
  | "matcha:unread:"
  | "matcha:dnd:"
  | "matcha:lastInteraction:"
  | "matcha:avatar:mode:"
  | "matcha:avatar:disabled:"
  | "matcha:avatar:lastUuid:"
  | "matcha:avatar:lastHash:"
  | "matcha:avatar:bgColor:"
  | "butter-chat-";

// ── Safe getters / setters ─────────────────────────────────────

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── Public API ─────────────────────────────────────────────────

export const StorageService = {
  // -- Static keys --

  get<K extends keyof StorageSchema>(key: K): StorageSchema[K] | null {
    const raw = safeGet(key);
    return raw as StorageSchema[K] | null;
  },

  getString<K extends keyof StorageSchema>(key: K, fallback = ""): string {
    return (safeGet(key) ?? "").trim() || fallback;
  },

  set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): void {
    safeSet(key, value);
  },

  remove<K extends keyof StorageSchema>(key: K): void {
    safeRemove(key);
  },

  // -- Dynamic (parameterised) keys --

  getDynamic(key: string): string | null {
    return safeGet(key);
  },

  setDynamic(key: string, value: string): void {
    safeSet(key, value);
  },

  removeDynamic(key: string): void {
    safeRemove(key);
  },

  // -- JSON helpers --

  getJson<T = unknown>(key: string, fallback?: T): T | null {
    const raw = safeGet(key);
    if (raw == null) return fallback ?? null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback ?? null;
    }
  },

  setJson(key: string, value: unknown): void {
    safeSet(key, JSON.stringify(value));
  },

  // -- Convenience: Account --

  getAccountType(): "premium" | "custom" | "" {
    const raw = (safeGet("accountType") ?? "").trim();
    if (raw === "premium") return "premium";
    if (raw === "custom") return "custom";
    // Normalize legacy values.
    if (raw) {
      safeSet("accountType", "custom");
      return "custom";
    }
    return "";
  },

  setAccountType(value: "premium" | "custom" | ""): void {
    safeSet("accountType", value);
    try {
      window.dispatchEvent(new Event("accountType:changed"));
    } catch {
      // ignore
    }
  },

  // -- Convenience: Matcha token --

  getMatchaToken(): string | null {
    const t = (safeGet("matcha:token") ?? "").trim();
    return t || null;
  },

  setMatchaToken(token: string): void {
    safeSet("matcha:token", token);
  },

  removeMatchaToken(): void {
    safeRemove("matcha:token");
  },

  // -- Convenience: Unread map --

  getUnreadMap(meId: string): Record<string, number> {
    const key = `matcha:unread:${(meId || "").trim()}`;
    const parsed = StorageService.getJson<Record<string, unknown>>(key, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = String(k || "").trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!id || !Number.isFinite(n) || n <= 0) continue;
      out[id] = Math.min(99, Math.floor(n));
    }
    return out;
  },

  setUnreadMap(meId: string, map: Record<string, number>): void {
    const key = `matcha:unread:${(meId || "").trim()}`;
    if (!key) return;
    StorageService.setJson(key, map ?? {});
  },

  emitUnreadChanged(meId: string, map: Record<string, number>): void {
    try {
      const total = Object.values(map ?? {}).reduce(
        (acc, v) => acc + (typeof v === "number" && Number.isFinite(v) ? v : 0),
        0,
      );
      window.dispatchEvent(
        new CustomEvent("matcha:unread-changed", { detail: { meId, total } }),
      );
    } catch {
      // ignore
    }
  },

  // -- Convenience: DND --

  getDnd(meId: string): boolean {
    const key = `matcha:dnd:${(meId || "").trim()}`;
    const raw = (safeGet(key) ?? "").trim();
    return raw === "1" || raw.toLowerCase() === "true";
  },

  setDnd(meId: string, enabled: boolean): void {
    const key = `matcha:dnd:${(meId || "").trim()}`;
    safeSet(key, enabled ? "1" : "0");
  },

  // -- Convenience: Last interaction map --

  getLastInteractionMap(meId: string): Record<string, number> {
    const key = `matcha:lastInteraction:${(meId || "").trim()}`;
    const parsed = StorageService.getJson<Record<string, unknown>>(key, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = String(k || "").trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!id || !Number.isFinite(n) || n <= 0) continue;
      out[id] = Math.floor(n);
    }
    // Avoid unbounded growth.
    const entries = Object.entries(out);
    if (entries.length <= 500) return out;
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const trimmed: Record<string, number> = {};
    for (const [id, ms] of entries.slice(0, 500)) trimmed[id] = ms;
    return trimmed;
  },

  setLastInteractionMap(meId: string, map: Record<string, number>): void {
    const key = `matcha:lastInteraction:${(meId || "").trim()}`;
    safeSet(key, JSON.stringify(map));
  },

  // -- Convenience: Avatar keys --

  avatarKey(suffix: string, accountType: string, username: string): string {
    return `matcha:avatar:${suffix}:${accountType || "unknown"}:${username}`;
  },

  getAvatarMode(accountType: string, username: string): string {
    return (safeGet(StorageService.avatarKey("mode", accountType, username)) ?? "").trim();
  },

  setAvatarMode(accountType: string, username: string, mode: string): void {
    safeSet(StorageService.avatarKey("mode", accountType, username), mode);
  },

  isAvatarDisabled(accountType: string, username: string): boolean {
    return (safeGet(StorageService.avatarKey("disabled", accountType, username)) ?? "").trim() === "1";
  },

  setAvatarDisabled(accountType: string, username: string, disabled: boolean): void {
    if (disabled) {
      safeSet(StorageService.avatarKey("disabled", accountType, username), "1");
    } else {
      safeRemove(StorageService.avatarKey("disabled", accountType, username));
    }
  },

  getAvatarLastUuid(accountType: string, username: string): string {
    return (safeGet(StorageService.avatarKey("lastUuid", accountType, username)) ?? "").trim();
  },

  setAvatarLastUuid(accountType: string, username: string, uuid: string): void {
    safeSet(StorageService.avatarKey("lastUuid", accountType, username), uuid);
  },

  getAvatarLastHash(uuid: string): string {
    return (safeGet(`matcha:avatar:lastHash:${uuid}`) ?? "").trim();
  },

  setAvatarLastHash(uuid: string, hash: string): void {
    safeSet(`matcha:avatar:lastHash:${uuid}`, hash);
  },

  getAvatarBgColor(accountType: string, username: string): string {
    return (safeGet(StorageService.avatarKey("bgColor", accountType, username)) ?? "").trim();
  },

  setAvatarBgColor(accountType: string, username: string, color: string): void {
    safeSet(StorageService.avatarKey("bgColor", accountType, username), color);
  },

  // -- Convenience: RPC --

  isRPCEnabled(): boolean {
    const raw = safeGet("enableRPC");
    // Default: enabled unless explicitly opted out.
    return raw === null ? true : raw.trim().toLowerCase() === "true";
  },

  setRPCEnabled(enabled: boolean): void {
    safeSet("enableRPC", enabled ? "true" : "false");
  },

  // -- Utility: has unread messages for any user --

  hasAnyUnread(): boolean {
    try {
      const prefix = "matcha:unread:";
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        for (const v of Object.values(parsed as Record<string, unknown>)) {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n) && n > 0) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  },

  // -- Utility: has valid account type --

  hasValidAccountType(): boolean {
    try {
      const raw = (safeGet("accountType") ?? "").trim();
      // Normalize legacy values.
      if (raw && raw !== "premium" && raw !== "custom") {
        safeSet("accountType", "custom");
        return true;
      }
      return raw === "premium" || raw === "custom";
    } catch {
      return false;
    }
  },
};
