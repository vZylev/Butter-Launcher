export type CustomAlternativeLoginProvider = {
  isAvailable: boolean;
  allowAlternative: boolean;
  alternativeLabel?: string;
};

const stubProvider: CustomAlternativeLoginProvider = {
  isAvailable: false,
  allowAlternative: false,
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customAlternativeLoginProvider`.
const customAlternativeLoginProviderGlob = import.meta.glob<{
  customAlternativeLoginProvider?: Partial<CustomAlternativeLoginProvider>;
}>("../../../dynamic_modules/renderer/customAlternativeLoginProvider.{ts,js,mjs}", {
  eager: true,
});

const resolveCustomAlternativeLoginProvider = (): CustomAlternativeLoginProvider => {
  try {
    const mods = Object.values(customAlternativeLoginProviderGlob);
    const maybe =
      mods && mods.length
        ? (mods[0] as any)?.customAlternativeLoginProvider
        : null;
    if (maybe && typeof maybe === "object") {
      const allowAlternative = (maybe as any).allowAlternative;
      if (typeof allowAlternative === "boolean") {
        const alternativeLabelRaw = (maybe as any).alternativeLabel;
        const alternativeLabel =
          typeof alternativeLabelRaw === "string" && alternativeLabelRaw.trim()
            ? alternativeLabelRaw.trim()
            : undefined;
        return {
          isAvailable: true,
          allowAlternative,
          alternativeLabel,
        } satisfies CustomAlternativeLoginProvider;
      }
    }
  } catch {
    // ignore
  }

  return stubProvider;
};

export const customAlternativeLoginProvider: CustomAlternativeLoginProvider =
  resolveCustomAlternativeLoginProvider();
