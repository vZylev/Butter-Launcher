import React from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import cn from "../utils/cn";

const MatchaTermsModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center glass-backdrop animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("friendsMenu.terms.title")}
    >
      <div
        className={cn(
          `
          relative w-full max-w-3xl max-h-[85vh] mx-auto
          rounded-xl
          bg-linear-to-b from-[#1b2030]/70 to-[#141824]/70
          border border-white/10
          shadow-2xl
          px-4 py-4
          flex flex-col animate-settings-in`,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
          onClick={onClose}
          title={t("common.close")}
        >
          <IconX size={18} />
        </button>

        <div className="flex items-center justify-between gap-3 mb-1 pr-12">
          <h2 className="text-lg font-semibold text-white tracking-wide">{t("friendsMenu.terms.title")}</h2>
        </div>
        <div className="text-xs text-white/60">{t("friendsMenu.terms.lastUpdated")}</div>

        <div className="mt-3 flex-1 min-h-0 rounded-lg overflow-auto border border-white/10 bg-black/20 dark-scrollbar p-3 text-sm text-white/75 whitespace-pre-wrap leading-relaxed">
          {t("friendsMenu.terms.body")}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MatchaTermsModal;
