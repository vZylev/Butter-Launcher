import React, { useMemo, useState } from "react";
import { IconX } from "@tabler/icons-react";
import cn from "../utils/cn";

export type LauncherUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  publishedAt?: string;
  url?: string;
  changelog?: string | string[];
};

const renderChangelog = (changelog?: string | string[]) => {
  if (!changelog) return null;

  if (Array.isArray(changelog)) {
    const items = changelog
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);

    if (!items.length) return null;

    return (
      <ul className="mt-2 list-disc pl-5 text-sm text-gray-200 space-y-1">
        {items.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    );
  }

  const text = typeof changelog === "string" ? changelog.trim() : "";
  if (!text) return null;

  return (
    <div className="mt-2 text-sm text-gray-200 whitespace-pre-wrap">{text}</div>
  );
};

const LauncherUpdateModal: React.FC<{
  open: boolean;
  info: LauncherUpdateInfo;
  onUpdate: (dontRemindAgain: boolean) => void;
  onClose: (dontRemindAgain: boolean) => void;
}> = ({ open, info, onUpdate, onClose }) => {
  const [dontRemindAgain, setDontRemindAgain] = useState(false);

  const title = "Update available";
  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (info.currentVersion) parts.push(`Current: v${info.currentVersion}`);
    if (info.latestVersion) parts.push(`Latest: v${info.latestVersion}`);
    return parts.join(" • ");
  }, [info.currentVersion, info.latestVersion]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className={cn(
          "relative w-full max-w-2xl rounded-xl shadow-2xl bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95 border border-[#2a3146] p-6 animate-settings-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-white font-extrabold text-xl">{title}</div>
            <div className="mt-1 text-sm text-gray-300">
              A new version of Butter Launcher is available.
            </div>
            {!!subtitle && (
              <div className="mt-2 text-xs text-gray-400">{subtitle}</div>
            )}
            {info.publishedAt && (
              <div className="mt-1 text-xs text-gray-400">
                Released: {info.publishedAt}
              </div>
            )}
          </div>

          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
            onClick={() => onClose(dontRemindAgain)}
            title="Close"
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="mt-5">
          <div className="text-white font-bold">What’s new</div>
          {renderChangelog(info.changelog) ?? (
            <div className="mt-2 text-sm text-gray-200">
              No changelog provided.
            </div>
          )}
        </div>

        <label className="mt-5 flex items-center gap-2 select-none text-sm text-gray-200">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={dontRemindAgain}
            onChange={(e) => setDontRemindAgain(e.target.checked)}
          />
          Don’t remind me again
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-[#2a3146] text-gray-300 hover:text-white hover:bg-[#2f3650] transition"
            onClick={() => onClose(dontRemindAgain)}
          >
            Not now
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-linear-to-r from-[#2563eb] to-[#60a5fa] text-white font-bold hover:scale-[1.02] transition"
            onClick={() => onUpdate(dontRemindAgain)}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
};

export default LauncherUpdateModal;
