/**
 * useAvatarSync — deduplicated avatar synchronisation hook.
 *
 * Replaces the identical logic that was copied in:
 *   - Launcher.tsx (~130 LOC)
 *   - FriendsMenu.tsx (~130 LOC)
 *
 * Runs sync on mount and every 10 minutes (hash-gated).
 */

import { useEffect, useRef, useState } from "react";
import { AvatarService } from "../../services/AvatarService";

type UseAvatarSyncParams = {
  /** Whether the sync should be active. */
  enabled: boolean;
  username: string | null;
  gameDir: string | null;
  token: string | null;
};

export function useAvatarSync(params: UseAvatarSyncParams) {
  const { enabled, username, gameDir, token } = params;
  const [syncing, setSyncing] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !username || !gameDir || !token) return;
    stoppedRef.current = false;

    const sync = async () => {
      if (stoppedRef.current) return;
      setSyncing(true);
      try {
        const result = await AvatarService.sync({
          gameDir,
          username,
          token,
        });
        if (!stoppedRef.current && result.ok && result.hash) {
          setLastHash(result.hash);
        }
      } finally {
        if (!stoppedRef.current) setSyncing(false);
      }
    };

    void sync();
    const timer = window.setInterval(sync, 10 * 60_000);

    return () => {
      stoppedRef.current = true;
      window.clearInterval(timer);
    };
  }, [enabled, username, gameDir, token]);

  return { syncing, lastHash };
}
