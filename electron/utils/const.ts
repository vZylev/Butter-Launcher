import { app } from "electron";
import path from "node:path";

export const META_DIRECTORY = path.join(app.getPath("userData"), "meta");
export const LOGS_DIRECTORY = path.join(app.getPath("userData"), "logs");
export const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DO NOT CHANGE THIS
