/// <reference types="vite/client" />

// Ambient types: the magical scroll that makes TypeScript stop screaming.

declare module "*.ogg" {
  const src: string;
  export default src;
}

declare module "*.mp3" {
  const src: string;
  export default src;
}

declare module "*.wav" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_NEWS_URL?: string;
}

type VersionType = "release" | "pre-release";

type GameVersion = {
  url: string;
  type: VersionType;
  build_index: number;
  build_name: string;
  isLatest?: boolean;
  patch_url?: string;
  patch_hash?: string;
  original_url?: string;
  patch_note?: string;
  /**
   * When the online patch is enabled:
   * - proper_patch === true  => launch stays offline
   * - proper_patch === false => launch uses authenticated mode + tokens
   * If missing, launcher falls back to legacy behavior (Linux/macOS authenticated).
   */
  proper_patch?: boolean;
  installed?: boolean;
  server_url?: string;
  unserver_url?: string;
};

type VersionDetails = {
  name: string;
  url?: string;
  hash?: string;
  patch_note?: string;
  original?: string;
  proper_patch?: boolean;
};

type VersionManifest = {
  server_url?: string;
  unserver_url?: string;
  server?: string;
  unserver?: string;
  windows: VersionDetails;
  linux: VersionDetails;
  darwin: VersionDetails;
};

type VersionsManifestRoot = {
  last_updated: string;
  latest_release_id: number;
  latest_prerelease_id: number;
  emergency_mode?: boolean;
  versions: Record<string, VersionManifest>;
  pre_releases: Record<string, VersionManifest>;
};

type InstallProgress = {
  phase: string;
  percent: number;
  total?: number;
  current?: number;
  stepIndex?: number;
  stepTotal?: number;
};

// Electron renderer: allow using <webview> in TSX.
declare namespace JSX {
  interface IntrinsicElements {
    webview: any;
  }
}
