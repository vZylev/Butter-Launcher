import React, { useMemo, useState } from "react";
import { IconX } from "@tabler/icons-react";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

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
  const { t, i18n } = useTranslation();
  const [dontRemindAgain, setDontRemindAgain] = useState(false);

  const title = t("launcherUpdate.title");
  const subtitle = useMemo(() => {
    const parts: string[] = [];
    if (info.currentVersion) {
      parts.push(
        t("launcherUpdate.subtitleCurrent", { version: info.currentVersion }),
      );
    }
    if (info.latestVersion) {
      parts.push(
        t("launcherUpdate.subtitleLatest", { version: info.latestVersion }),
      );
    }
    return parts.join(" • ");
  }, [i18n.language, info.currentVersion, info.latestVersion, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center glass-backdrop animate-fade-in">
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
              {t("launcherUpdate.description")}
            </div>
            {!!subtitle && (
              <div className="mt-2 text-xs text-gray-400">{subtitle}</div>
            )}
            {info.publishedAt && (
              <div className="mt-1 text-xs text-gray-400">
                {t("launcherUpdate.released", { date: info.publishedAt })}
              </div>
            )}
          </div>

          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
            onClick={() => onClose(dontRemindAgain)}
            title={t("common.close")}
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="mt-5">
          <div className="text-white font-bold">{t("launcherUpdate.whatsNew")}</div>
          {renderChangelog(info.changelog) ?? (
            <div className="mt-2 text-sm text-gray-200">
              {t("launcherUpdate.noChangelog")}
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
            {t("launcherUpdate.dontRemindAgain")}
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-[#2a3146] text-gray-300 hover:text-white hover:bg-[#2f3650] transition"
            onClick={() => onClose(dontRemindAgain)}
          >
            {t("launcherUpdate.notNow")}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white font-bold hover:scale-[1.02] transition"
            onClick={() => onUpdate(dontRemindAgain)}
          >
            {t("launcherUpdate.update")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LauncherUpdateModal;
