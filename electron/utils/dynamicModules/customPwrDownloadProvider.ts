export type CustomPwrDownloadResolved = {
  url: string;
  headUrl?: string;
  headers?: Record<string, string>;
  // If provided, use this URL for logs/error metadata instead of the real URL.
  safeLogUrl?: string;
};

export type CustomPwrDownloadProvider = {
  isAvailable: boolean;
  resolvePwrDownload: (opts: {
    url: string;
    headUrl?: string;
    branch: VersionType;
    buildIndex: number;
    fromBuildIndex?: number;
    toBuildIndex?: number;
  }) => Promise<CustomPwrDownloadResolved | null>;
};

const stubProvider: CustomPwrDownloadProvider = {
  isAvailable: false,
  resolvePwrDownload: async () => null,
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customPwrDownloadProvider`.
const customPwrDownloadProviderGlob = import.meta.glob<{
  customPwrDownloadProvider?: CustomPwrDownloadProvider;
}>("../../../dynamic_modules/electron/customPwrDownloadProvider.{ts,js,mjs}", {
  eager: true,
});

const resolveCustomPwrDownloadProvider = (): CustomPwrDownloadProvider => {
  try {
    const mods = Object.values(customPwrDownloadProviderGlob);
    const maybe = mods && mods.length ? (mods[0] as any)?.customPwrDownloadProvider : null;
    if (maybe && typeof maybe === "object" && typeof maybe.resolvePwrDownload === "function") {
      return maybe as CustomPwrDownloadProvider;
    }
  } catch {
    // ignore
  }
  return stubProvider;
};

export const customPwrDownloadProvider: CustomPwrDownloadProvider =
  resolveCustomPwrDownloadProvider();
