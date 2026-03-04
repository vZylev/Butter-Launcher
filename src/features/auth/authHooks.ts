/**
 * Auth-related hooks for App.tsx.
 *
 * Token refresh, JWKS caching, force-logout IPC listener.
 */

import { useEffect } from "react";
import { AuthService } from "../../services/AuthService";
import { StorageService } from "../../services/StorageService";
import { IPC_PREMIUM_FORCE_LOGOUT } from "../../ipc/channels";

/**
 * Refresh offline token on mount when a valid account is present.
 */
export function useOfflineTokenRefresh(
  username: string | null,
  hasValidAccountType: boolean,
) {
  useEffect(() => {
    if (!username || !hasValidAccountType) return;

    void (async () => {
      try {
        const accountType = StorageService.getAccountType();
        if (accountType !== "premium" && accountType !== "custom") return;
        const customUUID = StorageService.getString("customUUID") || null;
        await AuthService.refreshOfflineToken({
          username,
          accountType,
          customUUID,
        });
      } catch {
        // Best-effort
      }
    })();
  }, [username, hasValidAccountType]);
}

/**
 * Keep JWKS cached for offline token validation.
 */
export function useJwksRefresh(hasValidAccountType: boolean) {
  useEffect(() => {
    if (!hasValidAccountType) return;

    const accountType = StorageService.getAccountType();

    // Custom JWKS
    if (accountType === "custom") {
      void (async () => {
        try { await AuthService.refreshCustomJwks(); } catch { /* ignore */ }
      })();
    }

    // Official JWKS (for both accounts)
    if (accountType === "premium" || accountType === "custom") {
      void (async () => {
        try { await AuthService.refreshOfficialJwks(); } catch { /* ignore */ }
      })();
    }
  }, [hasValidAccountType]);
}

/**
 * Listen for force-logout IPC events.
 */
export function useForceLogout(setUsername: (u: string | null) => void) {
  useEffect(() => {
    if (!window.ipcRenderer) return;

    const onForceLogout = () => {
      AuthService.performForceLogout(setUsername);
    };

    window.ipcRenderer.on(IPC_PREMIUM_FORCE_LOGOUT, onForceLogout);
    return () => {
      try {
        window.ipcRenderer.off(IPC_PREMIUM_FORCE_LOGOUT, onForceLogout);
      } catch { /* ignore */ }
    };
  }, [setUsername]);
}
