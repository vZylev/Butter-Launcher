import React from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t("common.confirm");
  const resolvedCancelText = cancelText ?? t("common.cancel");
  const mouseDownOnBackdrop = React.useRef(false);

  if (!open) return null;

  // Portal to <body> so this modal reliably overlays even when opened
  // from within another modal that uses transforms/filters.
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center glass-backdrop animate-fadeIn"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={() => {
        mouseDownOnBackdrop.current = false;
      }}
      onMouseLeave={() => {
        mouseDownOnBackdrop.current = false;
      }}
      onClick={(e) => {
        // Only close when the click started on the backdrop itself.
        // This prevents "click-drag-release outside" from closing the modal.
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
          onCancel();
        }
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div
        className="relative w-full max-w-md rounded-xl shadow-2xl bg-linear-to-b from-[#1b2030]/95 to-[#141824]/95 border border-[#2a3146] p-6 animate-settings-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="text-white font-extrabold text-lg">{title}</div>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#23293a] text-gray-400 hover:text-white hover:bg-[#2f3650] transition flex items-center justify-center"
            onClick={onCancel}
            title={t("common.close")}
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Message */}
        <div className="mt-4 text-sm text-gray-200 whitespace-pre-wrap">
          {message}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-[#2a3146] text-gray-300 hover:text-white hover:bg-[#2f3650] transition"
            onClick={onCancel}
          >
            {resolvedCancelText}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-linear-to-r from-[#0268D4] to-[#02D4D4] text-white font-bold hover:scale-[1.02] transition"
            onClick={onConfirm}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;
