/**
 * AvatarService — deduplicated avatar sync / upload logic.
 *
 * Previously copied across Launcher.tsx and FriendsMenu.tsx (~400 LOC
 * of duplication). Now lives here, once, with a clear API.
 */

import { StorageService } from "./StorageService";

// ── Types ──────────────────────────────────────────────────────

export type AvatarSyncParams = {
  gameDir: string;
  username: string;
  token: string;
  force?: boolean;
};

export type AvatarSyncResult = {
  ok: boolean;
  uuid?: string;
  hash?: string;
  error?: string;
};

export type AvatarUploadParams = {
  token: string;
  filePath: string;
  bgColor?: string | null;
};

export type AvatarUploadResult = {
  ok: boolean;
  hash?: string;
  error?: string;
};

// ── Helpers ────────────────────────────────────────────────────

function resolveAccountType(): string {
  return StorageService.getAccountType() || "unknown";
}

// ── Service ────────────────────────────────────────────────────

export const AvatarService = {
  /**
   * Synchronise the player's Hytale avatar to Matcha.
   *
   * Reads all necessary state from StorageService (avatar mode, disabled
   * flag, last hash, etc.) — callers only need to supply the volatile
   * runtime values that can't be inferred.
   *
   * Returns `{ ok, uuid, hash }` on success.
   */
  async sync(params: AvatarSyncParams): Promise<AvatarSyncResult> {
    const { gameDir, username, token, force = false } = params;
    const accountType = resolveAccountType();

    // Skip sync when the user explicitly chose a custom avatar.
    const mode = StorageService.getAvatarMode(accountType, username);
    if (mode.toLowerCase() === "custom") {
      return { ok: false, error: "custom mode" };
    }

    // Skip if avatar is explicitly disabled.
    if (StorageService.isAvatarDisabled(accountType, username)) {
      return { ok: false, error: "avatar disabled" };
    }

    const lastUuid = StorageService.getAvatarLastUuid(accountType, username);
    const lastHash = lastUuid
      ? StorageService.getAvatarLastHash(lastUuid)
      : "";

    const customUUID = StorageService.getString("customUUID") || null;
    const bgColor =
      StorageService.getAvatarBgColor(accountType, username) || null;

    try {
      const res = await window.config.matchaAvatarSync({
        gameDir,
        username,
        token,
        accountType,
        customUUID,
        bgColor,
        lastHash,
        force,
      });

      if (res && res.ok) {
        StorageService.setAvatarLastUuid(accountType, username, res.uuid);
        StorageService.setAvatarLastHash(res.uuid, res.hash);
        StorageService.setAvatarDisabled(accountType, username, false);
        return { ok: true, uuid: res.uuid, hash: res.hash };
      }

      const err =
        typeof (res as any)?.error === "string" ? (res as any).error : "";
      if (err.trim().toLowerCase() === "avatar disabled") {
        StorageService.setAvatarDisabled(accountType, username, true);
      }

      return { ok: false, error: err || "unknown" };
    } catch {
      return { ok: false, error: "exception" };
    }
  },

  /**
   * Upload a custom avatar image.
   */
  async uploadCustom(params: AvatarUploadParams): Promise<AvatarUploadResult> {
    try {
      const res = await window.config.matchaAvatarUploadCustom({
        token: params.token,
        filePath: params.filePath,
      });
      if (res && res.ok) {
        return { ok: true, hash: res.hash };
      }
      return {
        ok: false,
        error:
          typeof (res as any)?.error === "string"
            ? (res as any).error
            : "unknown",
      };
    } catch {
      return { ok: false, error: "exception" };
    }
  },

  /**
   * Set the user's avatar mode and persist it.
   */
  setMode(
    username: string,
    mode: "hytale" | "custom" | "disabled",
  ): void {
    const accountType = resolveAccountType();
    StorageService.setAvatarMode(accountType, username, mode);
    if (mode === "disabled") {
      StorageService.setAvatarDisabled(accountType, username, true);
    } else {
      StorageService.setAvatarDisabled(accountType, username, false);
    }
  },

  /**
   * Get current avatar mode for the user.
   */
  getMode(username: string): string {
    const accountType = resolveAccountType();
    return StorageService.getAvatarMode(accountType, username);
  },

  /**
   * Get/set the avatar background colour.
   */
  getBgColor(username: string): string {
    const accountType = resolveAccountType();
    return StorageService.getAvatarBgColor(accountType, username);
  },

  setBgColor(username: string, color: string): void {
    const accountType = resolveAccountType();
    StorageService.setAvatarBgColor(accountType, username, color);
  },
};
