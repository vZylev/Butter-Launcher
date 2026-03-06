/**
 * AuthService — authentication IPC + token refresh logic.
 *
 * Extracted from App.tsx which previously mixed login, JWKS refresh,
 * and offline token refresh directly in React effects.
 */

import { IPC_FETCH_JSON } from "../ipc/channels";
import { StorageService } from "./StorageService";

// ── Types ──────────────────────────────────────────────────────

export type PremiumStatus = {
  ok: boolean;
  loggedIn: boolean;
  profile: { displayName: string; sub?: string } | null;
  error: string | null;
};

export type OfflineTokenRefreshParams = {
  username: string;
  accountType: "premium" | "custom";
  customUUID: string | null;
};

export type RemoteLauncherVersion = {
  version: string;
  publishedAt?: string;
  url?: string;
  changelog?: string | string[];
};

// ── Constants ──────────────────────────────────────────────────

const LAUNCHER_VERSION_URL =
  (import.meta as any).env?.VITE_LAUNCHER_VERSION_URL ||
  "https://updates.butterlauncher.tech/version.json";

// ── Service ────────────────────────────────────────────────────

export const AuthService = {
  // -- Premium account --

  async premiumStatus(): Promise<PremiumStatus> {
    return await window.config.premiumStatus();
  },

  async premiumOauthStart(): Promise<any> {
    return await window.config.premiumOauthStart();
  },

  async premiumOauthCancel(): Promise<void> {
    await window.config.premiumOauthCancel();
  },

  async premiumLogout(): Promise<void> {
    await window.config.premiumLogout?.();
  },

  // -- Offline token refresh --

  async refreshOfflineToken(params: OfflineTokenRefreshParams): Promise<any> {
    if (!window.config?.offlineTokenRefresh) return null;
    return await window.config.offlineTokenRefresh(params);
  },

  // -- JWKS cache warming --

  async refreshCustomJwks(): Promise<any> {
    if (!window.config?.customJwksRefresh) return null;
    return await window.config.customJwksRefresh();
  },

  async refreshOfficialJwks(): Promise<any> {
    if (!window.config?.officialJwksRefresh) return null;
    return await window.config.officialJwksRefresh();
  },

  // -- Launcher version check --

  async fetchLauncherVersion(): Promise<RemoteLauncherVersion | null> {
    try {
      const data = await window.ipcRenderer.invoke(
        IPC_FETCH_JSON,
        LAUNCHER_VERSION_URL,
        {},
      );
      if (!data || typeof data.version !== "string") return null;
      return data as RemoteLauncherVersion;
    } catch {
      return null;
    }
  },

  // -- Force-logout handler helpers --

  performForceLogout(setUsername: (u: string | null) => void): void {
    try { setUsername(null); } catch { /* ignore */ }
    try { void window.config.premiumLogout?.(); } catch { /* ignore */ }
    try { StorageService.remove("accountType"); } catch { /* ignore */ }
    try {
      window.dispatchEvent(new Event("accountType:changed"));
    } catch { /* ignore */ }
  },

  // -- Account type helpers --

  hasValidAccountType(): boolean {
    const raw = StorageService.getAccountType();
    return raw === "premium" || raw === "custom";
  },

  getAccountType(): "premium" | "custom" | "" {
    return StorageService.getAccountType();
  },

  // -- Support ticket --

  async collectSupportTicket(
    username: string,
    uuid?: string,
  ): Promise<any> {
    return await window.config.supportTicketCollect(username, uuid);
  },
};
