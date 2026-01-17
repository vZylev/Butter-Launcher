import React, { useState } from "react";
import { useGameContext } from "../hooks/gameContext";
import { useUserContext } from "../hooks/userContext";
import butterBg from "../assets/butter-bg.png";
import butterLogo from "../assets/butter-logo.png";
import SettingsModal from "./SettingsModal";
import settingsIcon from "../assets/settings.svg";
import DragBar from "./DragBar";
import ProgressBar from "./ProgressBar";

const Launcher: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const {
    availableVersions,
    selectedVersion,
    installing,
    installProgress,
    installGame,
    launchGame,
    launching,
    gameLaunched,
  } = useGameContext();
  const { username } = useUserContext();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLaunch = () => {
    if (!selectedVersion || !availableVersions[selectedVersion]) return;
    if (!username) return;

    if (availableVersions[selectedVersion].installed) {
      launchGame(availableVersions[selectedVersion], username);
      return;
    }

    installGame(availableVersions[selectedVersion]);
  };

  return (
    <div
      className="w-full h-full min-h-screen flex flex-col justify-between relative"
      style={{
        backgroundImage: `url(${butterBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <DragBar />
      <button
        className="absolute top-10 right-3 z-30 bg-[#23293a]/80 hover:bg-[#3b82f6] transition p-2 rounded-full shadow-lg flex items-center justify-center"
        title="Settings"
        onClick={() => setSettingsOpen(true)}
        style={{ width: 40, height: 40 }}
      >
        <img
          src={settingsIcon}
          alt="Settings"
          width={22}
          height={22}
          style={{ filter: "invert(1)" }}
        />
      </button>
      <div className="flex items-start justify-between p-6">
        <img
          src={butterLogo}
          alt="butter Logo"
          className="w-auto h-full max-h-96 drop-shadow-lg select-none"
          draggable={false}
        />
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={onLogout}
      />
      <div className="w-full bg-black/60 backdrop-blur-md p-6 flex flex-row items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          {installing ? (
            <div className="w-52 h-16 p-4 bg-white/10 rounded-lg shadow-inner flex items-center">
              <ProgressBar progress={installProgress} />
            </div>
          ) : (
            <button
              className="min-w-52 bg-linear-to-r from-[#3b82f6] to-[#60a5fa] text-white text-xl font-bold px-12 py-3 rounded-lg shadow-lg hover:scale-105 transition disabled:opacity-50"
              onClick={handleLaunch}
              disabled={launching || gameLaunched}
            >
              {availableVersions[selectedVersion]?.installed
                ? gameLaunched
                  ? "Running Game"
                  : "Play"
                : "Install"}
            </button>
          )}
          <div className="text-xs text-gray-200 font-mono opacity-80 flex flex-col">
            <span>
              Latest Version:{" "}
              {availableVersions[availableVersions.length - 1]?.build_name}
            </span>
            {availableVersions[selectedVersion]?.installed && (
              <span>
                Installed: {availableVersions[selectedVersion]?.build_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-row gap-4">
          <div className="w-40 h-20 bg-white/10 rounded-lg shadow-inner flex flex-col justify-end p-2">
            <div className="text-xs text-white">Butter Launcher 1.0.0</div>
            <div className="text-[10px] text-gray-300">
              The launcher is in Alpha phase, so it may have bugs; we are
              improving its functionality.
            </div>
          </div>
          <div className="w-40 h-20 bg-white/10 rounded-lg shadow-inner flex flex-col justify-end p-2">
            <div className="text-xs text-white">CONNECT AND CREATE</div>
            <div className="text-[10px] text-gray-300">
              Join the largest non-premium Hytale community. Forge your own
              destiny.
            </div>
          </div>
          <div className="w-40 h-20 bg-white/10 rounded-lg shadow-inner flex flex-col justify-end p-2">
            <div className="text-xs text-white">FREE HYTALE ACCESS</div>
            <div className="text-[10px] text-gray-300">
              Optimized performance and full access to the technical beta. No
              restrictions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Launcher;
