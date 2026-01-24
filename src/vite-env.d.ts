/// <reference types="vite/client" />

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
};

type VersionManifest = {
  server_url?: string;
  unserver_url?: string;
  windows: VersionDetails;
  linux: VersionDetails;
  darwin: VersionDetails;
};

type VersionsManifestRoot = {
  last_updated: string;
  latest_release_id: number;
  latest_prerelease_id: number;
  versions: Record<string, VersionManifest>;
  pre_releases: Record<string, VersionManifest>;
};

type InstallProgress = {
  phase: string;
  percent: number;
  total?: number;
  current?: number;
};
