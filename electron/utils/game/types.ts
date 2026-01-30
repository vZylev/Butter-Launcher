/**
 * Shared type definitions for game utilities
 */

export type GameVersion = {
  type: "release" | "pre-release";
  build_index: number;
  build_name?: string;
  isLatest?: boolean;
};

export type PatchResult = {
  success: boolean;
  patchCount: number;
  alreadyPatched?: boolean;
  error?: string;
};

export type PatchProgress = (message: string, percent: number | null) => void;

export type PatchState = {
  supported: boolean;
  clientPatched: boolean;
  serverPatched: boolean;
  clientHasBackup: boolean;
  serverHasBackup: boolean;
};

export type OnlinePatchState = {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  downloaded: boolean;
};

export type OnlinePatchHealth = {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  clientIsPatched: boolean;
  serverIsPatched: boolean;
  needsFixClient: boolean;
  needsFixServer: boolean;
  needsFix: boolean;
  patchOutdated: boolean;
};
