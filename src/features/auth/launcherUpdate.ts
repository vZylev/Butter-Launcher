/**
 * Launcher update checking logic.
 *
 * Extracted from App.tsx so the main component doesn't mix update
 * polling with rendering.
 */

import { useEffect, useState, useRef } from "react";
import { compareSemver } from "../../utils/semver";
import { AuthService } from "../../services/AuthService";
import { StorageService } from "../../services/StorageService";

export type LauncherUpdateInfo = {
  version: string;
  publishedAt?: string;
  url?: string;
  changelog?: string | string[];
};

const SUPPRESS_KEY = "suppressLauncherUpdateVersion";

/**
 * Hook that checks for launcher updates once the app is ready.
 *
 * Returns `{ updateInfo, isOpen, dismiss, suppress }`.
 */
export function useLauncherUpdate(ready: boolean, showLoader: boolean) {
  const [updateInfo, setUpdateInfo] = useState<LauncherUpdateInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!ready || showLoader) return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const data = await AuthService.fetchLauncherVersion();
        if (cancelled || !data) return;

        const currentVersion = (window.config?.VERSION ?? "").trim();
        if (!currentVersion || !data.version) return;

        const cmp = compareSemver(currentVersion, data.version);
        if (cmp >= 0) return; // Already up-to-date or newer.

        const suppressed = StorageService.getString("suppressLauncherUpdateVersion" as any);
        if (suppressed === data.version) return;

        setUpdateInfo(data);
        setIsOpen(true);
      } catch {
        // Best-effort: don't break the app if the internet is sleeping.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, showLoader]);

  const dismiss = () => setIsOpen(false);

  const suppress = (version: string) => {
    StorageService.setDynamic(SUPPRESS_KEY, version);
    setIsOpen(false);
  };

  return { updateInfo, isOpen, dismiss, suppress, setIsOpen };
}
