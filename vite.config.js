import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import fs from "node:fs";
import electron from "vite-plugin-electron/simple";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var computeDynamicAliases = function () {
    var asPosixPath = function (p) { return p.replace(/\\/g, "/"); };
    var dynamicRoot = path.join(__dirname, "dynamic_modules");
    var hasDynamicRoot = (function () {
        try {
            return fs.existsSync(dynamicRoot) && fs.statSync(dynamicRoot).isDirectory();
        }
        catch (_a) {
            return false;
        }
    })();
    var dynamicElectron = hasDynamicRoot
        ? path.join(dynamicRoot, "electron")
        : path.join(__dirname, "electron", "dynamic_modules_stub");
    var dynamicRenderer = hasDynamicRoot
        ? path.join(dynamicRoot, "renderer")
        : path.join(__dirname, "src", "dynamic_modules_stub");
    return [
        { find: "@dynamic-electron", replacement: asPosixPath(dynamicElectron) },
        { find: "@dynamic-renderer", replacement: asPosixPath(dynamicRenderer) },
    ];
};
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var _b, _c;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var launcherSecretKey = (_c = (_b = env.LAUNCHER_SECRET_KEY) !== null && _b !== void 0 ? _b : process.env.LAUNCHER_SECRET_KEY) !== null && _c !== void 0 ? _c : "";
    return {
        resolve: {
            alias: computeDynamicAliases(),
        },
        plugins: [
            tailwindcss(),
            react(),
            electron({
                main: {
                    // Shortcut of `build.lib.entry`.
                    entry: "electron/main.ts",
                    vite: {
                        define: {
                            __filename: "import.meta.url",
                            // Build-time injection for releases (CI sets LAUNCHER_SECRET_KEY as an env var).
                            // NOTE: This value becomes part of the bundled JS and is not truly secret in distributed binaries.
                            __LAUNCHER_SECRET_KEY__: JSON.stringify(launcherSecretKey),
                        },
                        resolve: {
                            alias: computeDynamicAliases(),
                        },
                    },
                },
                preload: {
                    // Shortcut of `build.rollupOptions.input`.
                    // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
                    input: path.join(__dirname, "electron/preload.ts"),
                    vite: {
                        resolve: {
                            alias: computeDynamicAliases(),
                        },
                    },
                },
                // Ployfill the Electron and Node.js API for Renderer process.
                // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
                // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
                renderer: process.env.NODE_ENV === "test"
                    ? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
                        undefined
                    : {},
            }),
        ],
    };
});
