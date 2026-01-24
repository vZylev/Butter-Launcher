import React, { useEffect, useMemo, useState } from "react";
import { IconFolderOpen } from "@tabler/icons-react";
import { useGameContext } from "../hooks/gameContext";
import cn from "../utils/cn";

const SettingsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onLogout?: () => void;
}> = ({ open, onClose, onLogout }) => {
  const { gameDir, checkForUpdates, checkingUpdates } = useGameContext();
  const [customUUID, setCustomUUID] = useState<string>("");
  const [enableRPC, setEnableRPC] = useState<boolean>(false);

  const [closing, setClosing] = useState(false);

  const normalizedUUID = useMemo(() => {
    const raw = customUUID.trim();
    if (!raw) return "";

    const compact = raw.replace(/-/g, "");
    if (/^[0-9a-fA-F]{32}$/.test(compact)) {
      const lower = compact.toLowerCase();
      return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
    }

    if (
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        raw,
      )
    ) {
      return raw.toLowerCase();
    }

    return "__invalid__";
  }, [customUUID]);

  const handleOpenGameDir = async () => {
    try {
      const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
      await window.config.openFolder(dir);
    } catch (e) {
      console.error("Failed to open game directory", e);
      alert("Failed to open game directory");
    }
  };

  const handleOpenModDir = async () => {
    try {
      const dir = gameDir ?? (await window.config.getDefaultGameDirectory());
      await window.config.openFolder(`${dir}/UserData/Mods`);
    } catch (e) {
      console.error("Failed to open mods directory", e);
      alert("Failed to open mods directory");
    }
  };

  useEffect(() => {
    if (!open) return;
    const storedUUID = localStorage.getItem("customUUID") || "";
    setCustomUUID(storedUUID);
    const storedRPC = localStorage.getItem("enableRPC") || "false";
    setEnableRPC(storedRPC === "true");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raw = customUUID.trim();
    if (!raw) {
      localStorage.removeItem("customUUID");
      return;
    }

    if (normalizedUUID && normalizedUUID !== "__invalid__") {
      localStorage.setItem("customUUID", normalizedUUID);
    }
  }, [customUUID, normalizedUUID, open]);

  useEffect(() => {
    if (enableRPC) {
      localStorage.setItem("enableRPC", "true");
      window.ipcRenderer.send("rpc:enable", true);
    } else {
      localStorage.removeItem("enableRPC");
      window.ipcRenderer.send("rpc:enable", false);
    }
  }, [enableRPC]);

  if (!open && !closing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in">
      <div
        className={cn(
          `
          relative w-full max-w-4xl h-[450px] mx-auto
          rounded-xl
          bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95
          border border-[#2a3146]
          shadow-2xl
          px-10 py-6
          flex flex-col animate-settings-in`,
          closing && "animate-settings-out",
        )}
      >
        <button
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
          onClick={() => {
            setClosing(true);
            setTimeout(() => {
              setClosing(false);
              onClose();
            }, 160);
          }}
          title="Cerrar"
        >
          ×
        </button>

        <h2 className="text-lg font-semibold text-white tracking-wide mb-4">
          SYSTEM SETTINGS
        </h2>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-6">
            {/* <div>
              <label className="text-gray-200 text-sm font-semibold mb-1 block">
                Patchline
              </label>
              <select className="w-full mt-1 p-2 rounded bg-[#23293a] text-white border border-[#3b82f6] focus:outline-none">
                <option>release</option>
                <option>snapshot</option>
              </select>
            </div> */}

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                Game Directory
              </label>
              <button
                className="w-full flex items-center justify-between bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg px-4 py-2 text-white transition"
                onClick={handleOpenGameDir}
              >
                <span className="text-sm">Open Folder</span>
                <IconFolderOpen size={18} />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                Mods Directory
              </label>
              <button
                className="w-full flex items-center justify-between bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg px-4 py-2 text-white transition"
                onClick={handleOpenModDir}
              >
                <span className="text-sm">Open Folder</span>
                <IconFolderOpen size={18} />
              </button>
            </div>

            <div className="col-span-2 space-y-2">
              <label className="text-xs uppercase tracking-widest text-gray-400">
                Custom UUID
              </label>
              <input
                value={customUUID}
                onChange={(e) => setCustomUUID(e.target.value)}
                placeholder="Auto generated if empty"
                className="w-full px-3 py-2 rounded-lg bg-[#1f2538] text-white border border-[#2a3146] focus:outline-none focus:border-blue-500 transition"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="text"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {customUUID.trim().length === 0
                    ? "Uses automatic UUID generation"
                    : normalizedUUID === "__invalid__"
                      ? "Invalid UUID format"
                      : `Saved: ${normalizedUUID}`}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-red-400 hover:text-red-300 transition"
                  onClick={() => {
                    setCustomUUID("");
                    localStorage.removeItem("customUUID");
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            <label className="w-fit flex gap-2 items-center text-xs uppercase tracking-widest text-gray-400">
              <p>Discord RPC:</p>
              <input
                type="checkbox"
                checked={enableRPC}
                onChange={(e) => setEnableRPC(e.target.checked)}
                className="hidden sr-only"
              />
              <div className="px-4 py-2 flex items-center justify-between bg-[#1f2538] hover:bg-[#262d44] border border-[#2a3146] rounded-lg text-white transition">
                {enableRPC ? "Enabled" : "Disabled"}
              </div>
            </label>

            {/* <div>
              <label className="text-gray-200 text-sm font-semibold mb-1 block">
                Previous Version{" "}
                <span className="text-xs text-gray-400 font-normal">
                  (Not available)
                </span>
              </label>
              <button className="w-full bg-[#23293a] text-gray-400 px-4 py-2 rounded mt-1 cursor-not-allowed" disabled>
                LAUNCH
              </button>
            </div> */}
          </div>
        </div>

        {/* FOOTER */}
        <div className="pt-4 mt-4 border-t border-[#2a3146] flex items-center justify-between gap-4">
          <div className="text-left">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Credits
            </span>
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-gray-400">
                Online Fix: <span className="text-blue-400">vZyle</span>
              </p>
              <p className="text-xs text-gray-400">
                System Launcher: <span className="text-blue-400">Fitzxel</span>
              </p>
              <p className="text-xs text-gray-400">
                Design Launcher:{" "}
                <span className="text-blue-400">primeisonline</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-[11px] font-mono text-gray-400">
              {`${window.config.BUILD_DATE} V${window.config.VERSION}`}
            </div>
            <button
              className="px-4 py-2 rounded-lg font-semibold border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition disabled:opacity-50"
              disabled={checkingUpdates}
              onClick={() => checkForUpdates("manual")}
            >
              {checkingUpdates ? "CHECKING..." : "CHECK FOR UPDATES"}
            </button>

            {onLogout && (
              <button
                className="px-5 py-2 rounded-lg font-bold text-white bg-linear-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 transition shadow-lg"
                onClick={onLogout}
              >
                LOGOUT
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
