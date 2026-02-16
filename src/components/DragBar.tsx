import React from "react";
import { useTranslation } from "react-i18next";

import { IconBrandInstagram, IconBrandX, IconMessageCircle } from "@tabler/icons-react";

const DragBar: React.FC<{
  left?: React.ReactNode;
  onLogout?: () => void;
  onOpenMatchaGlobalChat?: () => void;
}> = ({ left, onOpenMatchaGlobalChat }) => {
  const { t } = useTranslation();

  const handleMinimize = () => {
    window.ipcRenderer.send("minimize-window");
  };

  const handleToggleMaximize = () => {
    window.ipcRenderer.send("toggle-maximize-window");
  };

  const handleClose = () => {
    window.ipcRenderer.send("close-window");
  };

  const squareBtn =
    "no-drag w-8 h-8 flex items-center justify-center rounded-md transition";

  return (
    <>
      <div
        id="frame"
        className="
          w-full h-10 flex items-center justify-between
          px-3 select-none
          bg-transparent
          ml-3
        "
      >
        <div className="flex items-center gap-2 text-sm text-gray-300">
          {left}
        </div>

        <div
          className="
            flex items-center gap-1
            px-2 py-1
            bg-gradient-to-r from-[#0b1220]/80 to-[#0f172a]/80
            backdrop-blur-md
            border border-white/10
            rounded-bl-lg
            shadow-lg
          "
        >
          <div className="flex items-center gap-1">
            {/* Socials */}
            <button
              className={`${squareBtn} hover:bg-white/10`}
              title="Global Chat"
              onClick={() => {
                try {
                  const hasToken = !!(localStorage.getItem("matcha:token") || "").trim();
                  if (!hasToken) return;
                } catch {
                  return;
                }

                // Delegate to Launcher so it can open the FriendsMenu popover.
                onOpenMatchaGlobalChat?.();
              }}
            >
              <IconMessageCircle size={18} className="text-white" />
            </button>

            <button
              className={`${squareBtn} hover:bg-[#E1306C]`}
              title="Instagram"
              onClick={() =>
                window.config.openExternal(
                  "https://www.instagram.com/butterlauncher_official"
                )
              }
            >
              <IconBrandInstagram size={18} className="text-white" />
            </button>

            <button
              className={`${squareBtn} hover:bg-black`}
              title="X (Twitter)"
              onClick={() =>
                window.config.openExternal("https://x.com/Butter_Launcher/")
              }
            >
              <IconBrandX size={18} className="text-white" />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-white/10 mx-2" />


            {/* Minimize */}
            <button
              className={`${squareBtn} text-gray-300 hover:bg-white/10`}
              onClick={handleMinimize}
              title={t("common.minimize")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  y="7.5"
                  width="16"
                  height="1"
                  rx="0.5"
                  fill="currentColor"
                />
              </svg>
            </button>

            {/* Maximize / Restore */}
            <button
              className={`${squareBtn} text-gray-300 hover:bg-white/10`}
              onClick={handleToggleMaximize}
              title={t("common.maximize")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="3.25"
                  y="3.25"
                  width="9.5"
                  height="9.5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>

            {/* Close */}
            <button
              className={`${squareBtn} text-gray-300 hover:bg-red-600 hover:text-white`}
              onClick={handleClose}
              title={t("common.close")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <line
                  x1="4.35355"
                  y1="4.35355"
                  x2="11.6464"
                  y2="11.6464"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="11.6464"
                  y1="4.35355"
                  x2="4.35355"
                  y2="11.6464"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

      </div>
    </>
  );
};

export default DragBar;