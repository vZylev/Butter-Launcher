import React, { useState } from "react";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

const HostServerModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [localHostNoteOpen, setLocalHostNoteOpen] = useState(false);

  if (!open && !closing) return null;

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setLocalHostNoteOpen(false);
      setClosing(false);
      onClose();
    }, 160);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in">
      <div
        className={cn(
          `
          relative w-[92vw] max-w-[1400px] h-[88vh] mx-auto
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
          onClick={close}
          title={t("common.close")}
        >
          ×
        </button>

        <h2 className="text-lg font-semibold text-white tracking-wide mb-4">
          {t("hostServerModal.title")}
        </h2>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="space-y-4">
            <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-4">
              <div className="flex justify-center">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg font-semibold border border-[#2a3146] text-gray-200 hover:bg-white/5 transition"
                  onClick={() => setLocalHostNoteOpen(true)}
                >
                  {t("hostServerModal.localHost.button")}
                </button>
              </div>

              {localHostNoteOpen ? (
                <div className="mt-3 rounded-lg border border-amber-200/20 bg-black/30 px-3 py-2">
                  <div className="text-[11px] text-amber-200 leading-relaxed">
                    {t("hostServerModal.localHost.note")}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-[#2a3146] bg-[#1f2538]/70 p-4">
              <div
                className={cn(
                  "text-sm font-extrabold tracking-wider uppercase",
                  "bg-linear-to-r from-blue-500 via-cyan-400 to-blue-500 bg-clip-text text-transparent",
                  "bg-chroma-animated animate-chroma-shift",
                )}
              >
                {t("hostServerModal.proHosting.section")}
              </div>

              <button
                type="button"
                className="mt-3 mx-auto block px-5 py-2 rounded-lg font-bold text-white bg-linear-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 transition shadow-lg"
                onClick={() => {
                  void window.config.openExternal(
                    "https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher",
                  );
                }}
              >
                {t("hostServerModal.proHosting.button")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostServerModal;
