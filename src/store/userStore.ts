/**
 * User store — replaces UserContext with Zustand.
 */

import { create } from "zustand";
import { StorageService } from "../services/StorageService";

interface UserState {
  ready: boolean;
  username: string | null;
}

interface UserActions {
  setReady: (ready: boolean) => void;
  setUsername: (username: string | null) => void;
}

export const useUserStore = create<UserState & UserActions>()((set) => ({
  ready: false,
  username: null,

  setReady: (ready) => set({ ready }),

  setUsername: (username) => {
    set({ username });
    if (username) {
      StorageService.set("username", username);
    } else {
      StorageService.remove("username");
    }
  },
}));

// ── Initialisation (call once from main.tsx) ───────────────────

let userStoreInitialized = false;

export function initUserStore(): void {
  if (userStoreInitialized) return;
  userStoreInitialized = true;

  const stored = StorageService.get("username");
  if (stored) {
    useUserStore.setState({ username: stored });
  }

  // Mark ready after 3 seconds (matches original behaviour).
  setTimeout(() => {
    useUserStore.setState({ ready: true });
  }, 3000);
}
