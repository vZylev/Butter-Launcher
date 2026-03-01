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

export const customAuthProvider: CustomAuthProvider = {
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
