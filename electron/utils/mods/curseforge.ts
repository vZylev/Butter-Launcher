import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { getModsConfig } from "./config";

// CurseForge API client: turning HTTP into "it works on my machine".

export type CurseForgeMod = {
  id: number;
  name: string;
  summary: string;
  author: string;
  dateCreated?: string;
  dateModified?: string;
  downloadCount?: number;
  logoThumbnailUrl?: string;
  latestVersionName?: string;
  latestFileId?: number;
};

const assertSafeDownloadedFileName = (name: unknown): string => {
  if (typeof name !== "string") throw new Error("Invalid download file name");
  const s = name.trim();
  if (!s) throw new Error("Invalid download file name");
  if (s.includes("..") || s.includes("/") || s.includes("\\") || s.includes(":") || s.includes("\u0000")) {
    throw new Error("Invalid download file name");
  }
  return s;
};

type CfApiResponse<T> = { data: T };

type CfPagination = {
  index: number;
  pageSize: number;
  resultCount?: number;
  totalCount?: number;
};

type CfSearchResponse<T> = {
  data: T;
  pagination?: CfPagination;
};

const getHeaders = async (): Promise<Record<string, string>> => {
  const cfg = await getModsConfig();
  const apiKey = cfg.curseforge.apiKey;
  if (!apiKey) {
    throw new Error("Mods are unavailable right now. Please check your internet connection and try again.");
  }

  return {
    Accept: "application/json",
    "x-api-key": apiKey,
  };
};

const readErrorBody = async (res: Response): Promise<string> => {
  try {
    const text = await res.clone().text();
    return text ? text.slice(0, 300) : "";
  } catch {
    return "";
  }
};

const cfUrl = async (pathname: string, params?: Record<string, string>) => {
  const cfg = await getModsConfig();
  const base = cfg.curseforge.baseUrl.replace(/\/$/, "");
  const url = new URL(base + pathname);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
};

const unwrapMod = (raw: any): any => {
  // Some endpoints (notably /mods/featured) can return items wrapped like:
  // { mod: { ... }, file: { ... } }
  if (raw && typeof raw === "object" && raw.mod && typeof raw.mod === "object") return raw.mod;
  return raw;
};

const mapMod = (raw: any): CurseForgeMod => {
  const mod = unwrapMod(raw);
  const authors = Array.isArray(mod?.authors) ? mod.authors : [];
  const firstAuthor = authors?.[0]?.name;

  const logoThumb =
    typeof mod?.logo?.thumbnailUrl === "string"
      ? mod.logo.thumbnailUrl
      : typeof mod?.logo?.url === "string"
        ? mod.logo.url
        : undefined;

  const latestFiles = Array.isArray(mod?.latestFiles) ? mod.latestFiles : [];
  const latestStable = latestFiles.find(
    (f: any) => typeof f?.releaseType === "number" && Number(f.releaseType) === 1,
  );
  const chosen = latestStable ?? latestFiles?.[0];

  const latestDisplayName =
    typeof chosen?.displayName === "string" ? chosen.displayName : undefined;
  const latestFileId =
    typeof chosen?.id === "number" && Number.isFinite(chosen.id)
      ? Number(chosen.id)
      : undefined;

  return {
    id: Number(mod?.id),
    name: String(mod?.name ?? ""),
    summary: String(mod?.summary ?? ""),
    author: typeof firstAuthor === "string" && firstAuthor ? firstAuthor : "Unknown",
    dateCreated:
      typeof mod?.dateCreated === "string" ? mod.dateCreated : undefined,
    dateModified:
      typeof mod?.dateModified === "string" ? mod.dateModified : undefined,
    downloadCount:
      typeof mod?.downloadCount === "number" && Number.isFinite(mod.downloadCount)
        ? mod.downloadCount
        : undefined,
    logoThumbnailUrl: logoThumb,
    latestVersionName: latestDisplayName,
    latestFileId,
  };
};

export type BrowseSort =
  | "relevance"
  | "popularity"
  | "latestUpdate"
  | "creationDate"
  | "totalDownloads"
  | "az";

const mapSortToField = (sort: BrowseSort, hasQuery: boolean): string | null => {
  // Verified working values: 2,3,4,6,11 via curl against the live API.
  // "relevance" is best handled by omitting sortField when a query exists.
  if (sort === "relevance") return hasQuery ? null : "3"; // default list when no query: latest update
  if (sort === "popularity") return "2";
  if (sort === "latestUpdate") return "3";
  if (sort === "creationDate") return "11";
  if (sort === "totalDownloads") return "6";
  if (sort === "az") return "4";
  return null;
};

export const browseMods = async (opts: {
  query?: string;
  sort?: BrowseSort;
  index?: number;
  pageSize?: number;
}): Promise<{ mods: CurseForgeMod[]; pagination: CfPagination }> => {
  const cfg = await getModsConfig();
  const q = typeof opts?.query === "string" ? opts.query.trim() : "";
  const sort: BrowseSort = (opts?.sort as BrowseSort) || "latestUpdate";
  const index = Number.isFinite(opts?.index as number) ? Number(opts.index) : 0;
  const pageSize = Number.isFinite(opts?.pageSize as number) ? Number(opts.pageSize) : 24;

  const params: Record<string, string> = {
    gameId: String(cfg.curseforge.gameId),
    pageSize: String(Math.max(1, Math.min(50, pageSize))),
    index: String(Math.max(0, index)),
    sortOrder: "desc",
  };
  if (q) params.searchFilter = q;

  const sortField = mapSortToField(sort, !!q);
  if (sortField) params.sortField = sortField;
  // If relevance+query, omit sortField/sortOrder for API relevance.
  if (sort === "relevance" && q) {
    delete params.sortOrder;
  }

  const url = await cfUrl("/mods/search", params);
  const res = await fetch(url, { headers: await getHeaders() });
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(
      `CurseForge search failed: ${res.status}${body ? ` - ${body}` : ""}`,
    );
  }
  const json = (await res.json()) as CfSearchResponse<any[]>;
  const list = Array.isArray(json?.data) ? json.data : [];
  const pagination = json?.pagination ?? {
    index: Math.max(0, index),
    pageSize: Math.max(1, pageSize),
  };
  return {
    mods: list.map(mapMod).filter((m) => m.id && m.name),
    pagination,
  };
};

export const searchMods = async (query: string): Promise<CurseForgeMod[]> => {
  const { mods } = await browseMods({ query, sort: query?.trim() ? "relevance" : "latestUpdate", index: 0, pageSize: 20 });
  return mods;
};

export const getFeaturedMods = async (): Promise<CurseForgeMod[]> => {
  const cfg = await getModsConfig();
  const url = await cfUrl("/mods/featured");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(await getHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      gameId: cfg.curseforge.gameId,
      excludedModIds: [],
      gameVersionTypeId: 0,
    }),
  });

  if (!res.ok) throw new Error(`CurseForge featured failed: ${res.status}`);
  const json = (await res.json()) as CfApiResponse<{
    featured: any[];
    popular: any[];
    recentlyUpdated: any[];
  }>;

  const featured = Array.isArray(json?.data?.featured) ? json.data.featured : [];
  const popular = Array.isArray(json?.data?.popular) ? json.data.popular : [];

  const merged = [...featured, ...popular];
  const byId = new Map<number, CurseForgeMod>();
  for (const raw of merged) {
    const mod = mapMod(raw);
    if (mod.id) byId.set(mod.id, mod);
  }
  return Array.from(byId.values());
};

export const getModDescriptionHtml = async (modId: number): Promise<string> => {
  const url = await cfUrl(`/mods/${modId}/description`);
  const res = await fetch(url, { headers: await getHeaders() });
  if (!res.ok) throw new Error(`CurseForge description failed: ${res.status}`);
  const json = (await res.json()) as CfApiResponse<string>;
  return typeof json?.data === "string" ? json.data : "";
};

export type CurseForgeModDetails = {
  id: number;
  name: string;
  summary: string;
  slug?: string;
  author?: string;
  dateCreated?: string;
  dateModified?: string;
  downloadCount?: number;
  logoUrl?: string;
  screenshots?: Array<{ title?: string; url?: string; thumbnailUrl?: string }>;
  latestFiles?: Array<{ displayName?: string; fileName?: string }>; // light info
};

export const getModDetails = async (modId: number): Promise<CurseForgeModDetails> => {
  const url = await cfUrl(`/mods/${modId}`);
  const res = await fetch(url, { headers: await getHeaders() });
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(
      `CurseForge mod details failed: ${res.status}${body ? ` - ${body}` : ""}`,
    );
  }
  const json = (await res.json()) as CfApiResponse<any>;
  const mod = json?.data ?? {};

  const authors = Array.isArray(mod?.authors) ? mod.authors : [];
  const firstAuthor = authors?.[0]?.name;

  const logoUrl =
    typeof mod?.logo?.url === "string"
      ? mod.logo.url
      : typeof mod?.logo?.thumbnailUrl === "string"
        ? mod.logo.thumbnailUrl
        : undefined;

  const screenshotsRaw = Array.isArray(mod?.screenshots) ? mod.screenshots : [];
  const screenshots = screenshotsRaw
    .map((s: any) => ({
      title: typeof s?.title === "string" ? s.title : undefined,
      url: typeof s?.url === "string" ? s.url : undefined,
      thumbnailUrl: typeof s?.thumbnailUrl === "string" ? s.thumbnailUrl : undefined,
    }))
    .filter((s: any) => s.url || s.thumbnailUrl);

  const latestFiles = Array.isArray(mod?.latestFiles) ? mod.latestFiles : [];
  const latestFilesLite = latestFiles.slice(0, 5).map((f: any) => ({
    displayName: typeof f?.displayName === "string" ? f.displayName : undefined,
    fileName: typeof f?.fileName === "string" ? f.fileName : undefined,
  }));

  return {
    id: Number(mod?.id),
    name: String(mod?.name ?? ""),
    summary: String(mod?.summary ?? ""),
    slug: typeof mod?.slug === "string" ? mod.slug : undefined,
    author: typeof firstAuthor === "string" && firstAuthor ? firstAuthor : undefined,
    dateCreated: typeof mod?.dateCreated === "string" ? mod.dateCreated : undefined,
    dateModified: typeof mod?.dateModified === "string" ? mod.dateModified : undefined,
    downloadCount:
      typeof mod?.downloadCount === "number" && Number.isFinite(mod.downloadCount)
        ? mod.downloadCount
        : undefined,
    logoUrl,
    screenshots,
    latestFiles: latestFilesLite,
  };
};

export type CurseForgeFileInfo = {
  id: number;
  displayName?: string;
  fileName?: string;
  fileDate?: string;
  releaseType?: number;
  downloadCount?: number;
  gameVersions?: string[];
};

export const getModFiles = async (modId: number, pageSize = 20): Promise<CurseForgeFileInfo[]> => {
  const url = await cfUrl(`/mods/${modId}/files`, { pageSize: String(Math.max(1, Math.min(50, pageSize))) });
  const res = await fetch(url, { headers: await getHeaders() });
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(
      `CurseForge files failed: ${res.status}${body ? ` - ${body}` : ""}`,
    );
  }
  const json = (await res.json()) as CfApiResponse<any[]>;
  const list = Array.isArray(json?.data) ? json.data : [];
  return list.map((f: any) => ({
    id: Number(f?.id),
    displayName: typeof f?.displayName === "string" ? f.displayName : undefined,
    fileName: typeof f?.fileName === "string" ? f.fileName : undefined,
    fileDate: typeof f?.fileDate === "string" ? f.fileDate : undefined,
    releaseType: typeof f?.releaseType === "number" ? f.releaseType : undefined,
    downloadCount:
      typeof f?.downloadCount === "number" && Number.isFinite(f.downloadCount)
        ? f.downloadCount
        : undefined,
    gameVersions: Array.isArray(f?.gameVersions) ? f.gameVersions.filter((x: any) => typeof x === "string") : undefined,
  })).filter((x: any) => x.id);
};

type CfFile = {
  id: number;
  fileName: string;
  downloadUrl: string;
  releaseType?: number;
};

const getLatestStableFile = async (modId: number): Promise<CfFile> => {
  // Fetch a small batch and pick the newest stable (releaseType=1) that has a direct downloadUrl.
  const url = await cfUrl(`/mods/${modId}/files`, { pageSize: "25" });
  const res = await fetch(url, { headers: await getHeaders() });
  if (!res.ok) throw new Error(`CurseForge files failed: ${res.status}`);
  const json = (await res.json()) as CfApiResponse<any[]>;
  const files = Array.isArray(json?.data) ? json.data : [];

  const stable = files.find(
    (f: any) =>
      typeof f?.releaseType === "number" &&
      Number(f.releaseType) === 1 &&
      typeof f?.downloadUrl === "string" &&
      !!f.downloadUrl,
  );

  const chosen = stable ?? files.find((f: any) => typeof f?.downloadUrl === "string" && !!f.downloadUrl);
  if (!chosen) throw new Error("CurseForge returned no downloadable files");

  const fileNameRaw = typeof chosen?.fileName === "string" ? chosen.fileName : "";
  const fileName = assertSafeDownloadedFileName(fileNameRaw);
  const downloadUrl = typeof chosen?.downloadUrl === "string" ? chosen.downloadUrl : null;
  if (!downloadUrl) {
    throw new Error(
      "This mod does not provide a direct downloadUrl (external download).",
    );
  }

  return {
    id: Number(chosen?.id),
    fileName,
    downloadUrl,
    releaseType: typeof chosen?.releaseType === "number" ? Number(chosen.releaseType) : undefined,
  };
};

export const getModFile = async (modId: number, fileId: number): Promise<CfFile> => {
  const url = await cfUrl(`/mods/${modId}/files/${fileId}`);
  const res = await fetch(url, { headers: await getHeaders() });
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(
      `CurseForge file failed: ${res.status}${body ? ` - ${body}` : ""}`,
    );
  }
  const json = (await res.json()) as CfApiResponse<any>;
  const f = json?.data ?? {};
  const fileNameRaw = typeof f?.fileName === "string" ? f.fileName : "";
  const fileName = assertSafeDownloadedFileName(fileNameRaw);
  const downloadUrl = typeof f?.downloadUrl === "string" ? f.downloadUrl : null;
  if (!downloadUrl) {
    throw new Error(
      "This file does not provide a direct downloadUrl (external download).",
    );
  }
  return {
    id: Number(f?.id),
    fileName,
    downloadUrl,
    releaseType: typeof f?.releaseType === "number" ? Number(f.releaseType) : undefined,
  };
};

export const downloadLatestModFile = async (
  modId: number,
  targetDir: string,
  onProgress?: (received: number, total?: number) => void,
): Promise<{ fileId: number; fileName: string; filePath: string } > => {
  const file = await getLatestStableFile(modId);

  await fs.promises.mkdir(targetDir, { recursive: true });

  const destPath = path.join(targetDir, file.fileName);

  const res = await fetch(file.downloadUrl, {
    headers: {
      Accept: "application/octet-stream,*/*",
    },
  });

  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status}`);
  }

  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;

  let received = 0;

  const nodeStream = Readable.fromWeb(res.body as any).on("data", (chunk) => {
    received += (chunk as Buffer).length;
    onProgress?.(received, total);
  });

  const out = fs.createWriteStream(destPath);
  await pipeline(nodeStream, out);

  return { fileId: file.id, fileName: file.fileName, filePath: destPath };
};

export const downloadModFile = async (
  modId: number,
  fileId: number,
  targetDir: string,
  onProgress?: (received: number, total?: number) => void,
): Promise<{ fileId: number; fileName: string; filePath: string } > => {
  const file = await getModFile(modId, fileId);

  await fs.promises.mkdir(targetDir, { recursive: true });

  const destPath = path.join(targetDir, file.fileName);

  const res = await fetch(file.downloadUrl, {
    headers: {
      Accept: "application/octet-stream,*/*",
    },
  });

  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status}`);
  }

  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;

  let received = 0;

  const nodeStream = Readable.fromWeb(res.body as any).on("data", (chunk) => {
    received += (chunk as Buffer).length;
    onProgress?.(received, total);
  });

  const out = fs.createWriteStream(destPath);
  await pipeline(nodeStream, out);

  return { fileId: file.id, fileName: file.fileName, filePath: destPath };
};
