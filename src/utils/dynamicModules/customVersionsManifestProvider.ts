export type CustomVersionsManifestProvider = {
  isAvailable: boolean;
  /**
   * Returns an alternate manifest that may contain download links.
   * The implementation is expected to live in `dynamic_modules/renderer/`.
   */
  fetchNpManifest: () => Promise<VersionsManifestRoot | null>;
};

const stubProvider: CustomVersionsManifestProvider = {
  isAvailable: false,
  fetchNpManifest: async () => null,
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customVersionsManifestProvider`.
const customVersionsManifestProviderGlob = import.meta.glob<{
  customVersionsManifestProvider?: CustomVersionsManifestProvider;
}>(
  "../../../dynamic_modules/renderer/customVersionsManifestProvider.{ts,js,mjs}",
  { eager: true },
);

const resolveCustomVersionsManifestProvider = (): CustomVersionsManifestProvider => {
  try {
    const mods = Object.values(customVersionsManifestProviderGlob);
    const maybe =
      mods && mods.length ? (mods[0] as any)?.customVersionsManifestProvider : null;
    if (
      maybe &&
      typeof maybe === "object" &&
      typeof maybe.fetchNpManifest === "function"
    ) {
      return maybe as CustomVersionsManifestProvider;
    }
  } catch {
    // ignore
  }
  return stubProvider;
};

export const customVersionsManifestProvider: CustomVersionsManifestProvider =
  resolveCustomVersionsManifestProvider();
