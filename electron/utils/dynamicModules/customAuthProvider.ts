export type AuthTokens = {
  identityToken: string;
  sessionToken: string;
};

export type Jwks = { keys: any[] };

export type CustomOfflineTokenHttpResponse = {
  status: number;
  bodyText: string;
  customIssuer: string;
};

export type CustomAuthProvider = {
  isAvailable: boolean;
  getDefaultIssuerPreference: (officialIssuer: string) => string[];
  ensureCustomJwks: (opts?: { forceRefresh?: boolean }) => Promise<Jwks | null>;
  fetchCustomAuthTokens: (username: string, uuid: string) => Promise<AuthTokens>;
  postCustomOfflineTokenRequest: (opts: {
    username: string;
    uuid: string;
    timeoutMs: number;
  }) => Promise<CustomOfflineTokenHttpResponse>;
};

const stubProvider: CustomAuthProvider = {
  isAvailable: false,
  getDefaultIssuerPreference: (officialIssuer: string) => [officialIssuer],
  ensureCustomJwks: async () => null,
  fetchCustomAuthTokens: async () => {
    throw new Error("CustomAuthProvider not installed (dynamic_modules missing)");
  },
  postCustomOfflineTokenRequest: async () => {
    throw new Error("CustomAuthProvider not installed (dynamic_modules missing)");
  },
};

// Optional dynamic module hook.
// - If `dynamic_modules` doesn't exist, this glob resolves to an empty object.
// - If it exists, we expect it to export `customAuthProvider`.
const customAuthProviderGlob = import.meta.glob<{
  customAuthProvider?: CustomAuthProvider;
}>(
  "../../../dynamic_modules/electron/customAuthProvider.{ts,js,mjs}",
  { eager: true },
);

const resolveCustomAuthProvider = (): CustomAuthProvider => {
  try {
    const mods = Object.values(customAuthProviderGlob);
    const maybe = mods && mods.length ? (mods[0] as any)?.customAuthProvider : null;
    if (maybe && typeof maybe === "object" && typeof maybe.ensureCustomJwks === "function") {
      return maybe as CustomAuthProvider;
    }
  } catch {
    // ignore
  }
  return stubProvider;
};

export const customAuthProvider: CustomAuthProvider = resolveCustomAuthProvider();
