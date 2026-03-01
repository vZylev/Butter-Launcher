export type PatchStep = {
  from: number;
  to: number;
  pwr: string;
  pwrHead?: string;
  sig?: string;
};

export type CustomPatchPlanProvider = {
  isAvailable: boolean;
  fetchCustomPatchPlan: (opts: {
    branch: VersionType;
    currentVersion: number;
    targetVersion?: number;
  }) => Promise<PatchStep[]>;
};

const stubProvider: CustomPatchPlanProvider = {
  isAvailable: false,
  fetchCustomPatchPlan: async () => {
    throw new Error(
      "CustomPatchPlanProvider not installed (dynamic_modules missing)",
    );
  },
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customPatchPlanProvider`.
const customPatchPlanProviderGlob = import.meta.glob<{
  customPatchPlanProvider?: CustomPatchPlanProvider;
}>("../../../dynamic_modules/electron/customPatchPlanProvider.{ts,js,mjs}", {
  eager: true,
});

const resolveCustomPatchPlanProvider = (): CustomPatchPlanProvider => {
  try {
    const mods = Object.values(customPatchPlanProviderGlob);
    const maybe = mods && mods.length ? (mods[0] as any)?.customPatchPlanProvider : null;
    if (
      maybe &&
      typeof maybe === "object" &&
      typeof maybe.fetchCustomPatchPlan === "function"
    ) {
      return maybe as CustomPatchPlanProvider;
    }
  } catch {
    // ignore
  }
  return stubProvider;
};

export const customPatchPlanProvider: CustomPatchPlanProvider =
  resolveCustomPatchPlanProvider();
