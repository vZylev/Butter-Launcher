export const parseSemver = (v: string): [number, number, number] | null => {
  const raw = (v ?? "").trim();
  if (!raw) return null;

  // Accept: 1.2.3, v1.2.3, 1.2, 1
  const cleaned = raw.startsWith("v") ? raw.slice(1) : raw;
  const parts = cleaned.split(".").map((x) => x.trim());
  if (!parts.length) return null;

  const major = Number(parts[0] ?? "");
  const minor = Number(parts[1] ?? "0");
  const patch = Number(parts[2] ?? "0");
  if (![major, minor, patch].every((n) => Number.isFinite(n) && n >= 0)) return null;

  return [major, minor, patch];
};

export const compareSemver = (a: string, b: string): number => {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  // If we can't parse, fall back to string compare to avoid crashes.
  if (!pa || !pb) return String(a).localeCompare(String(b));

  for (let i = 0; i < 3; i++) {
    const diff = pa[i] - pb[i];
    if (diff !== 0) return diff;
  }

  return 0;
};
