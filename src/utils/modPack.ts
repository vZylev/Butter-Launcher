export const MODPACK_PREFIX = "BLMP:";

export type ModPackV1 = {
  v: 1;
  profile: {
    name: string;
    gameVersion?: {
      type?: string;
      buildIndex?: number;
      label?: string;
    };
    createdAt?: string;
  };
  mods: Array<{
    source: "curseforge" | "local" | "unknown";
    name?: string;
    modId?: number;
    fileId?: number;
    fileName?: string;
    sha256?: string;
    requiredManual?: boolean;
  }>;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const maybeGzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  try {
    if (typeof CompressionStream === "undefined") return bytes;
    const cs = new CompressionStream("gzip");
    const ab = Uint8Array.from(bytes).buffer;
    const stream = new Blob([ab]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return bytes;
  }
};

const tryGunzip = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  try {
    if (typeof DecompressionStream === "undefined") return null;
    const ds = new DecompressionStream("gzip");
    const ab = Uint8Array.from(bytes).buffer;
    const stream = new Blob([ab]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
};

export const encodeModPack = async (pack: ModPackV1): Promise<string> => {
  const json = JSON.stringify(pack);
  const raw = new TextEncoder().encode(json);
  const gz = await maybeGzip(raw);
  return `${MODPACK_PREFIX}${bytesToBase64(gz)}`;
};

export const decodeModPack = async (text: string): Promise<ModPackV1> => {
  const raw = (text || "").trim();
  if (!raw.startsWith(MODPACK_PREFIX)) {
    throw new Error("invalid_prefix");
  }

  const data = raw.slice(MODPACK_PREFIX.length).trim();
  if (!data) throw new Error("empty_payload");

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(data);
  } catch {
    throw new Error("invalid_base64");
  }

  const gunzipped = await tryGunzip(bytes);
  const decoded = new TextDecoder().decode(gunzipped ?? bytes);

  let parsed: any;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("invalid_json");
  }

  // Minimal structural validation
  if (!parsed || typeof parsed !== "object") throw new Error("invalid_object");
  if (parsed.v !== 1) throw new Error("unsupported_version");
  if (!parsed.profile || typeof parsed.profile !== "object") throw new Error("invalid_profile");
  if (typeof parsed.profile.name !== "string" || !parsed.profile.name.trim()) throw new Error("invalid_profile_name");
  if (!Array.isArray(parsed.mods)) throw new Error("invalid_mods");

  return parsed as ModPackV1;
};
