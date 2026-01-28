import { formatBytes } from "../utils/formatNum";
import cn from "../utils/cn";
import { useEffect, useState } from "react";

interface Props {
  progress: InstallProgress;
  className?: string;
  onResumeDownload?: () => void;
  downloadError?: boolean;
}

const PHASES: Record<string, string> = {
  "pwr-download": "Downloading...",
  patching: "Extracting...",
  "online-patch": "Patching Online System",
  "fix-download": "Downloading Fix...",
  "fix-extract": "Patching Fix...",
  "jre-download": "Downloading JRE...",
  "jre-extract": "Extracting JRE...",
};

export default function ProgressBar({
  progress,
  className,
  onResumeDownload,
  downloadError,
}: Props) {
  const [lastProgress, setLastProgress] = useState(0);
  const [isStalled, setIsStalled] = useState(false);
  const [stallCheckEnabled, setStallCheckEnabled] = useState(true);

  // Track progress changes
  useEffect(() => {
    if (progress.current !== undefined && progress.current !== lastProgress) {
      setLastProgress(progress.current);
      setIsStalled(false); // Reset stall flag when progress updates
    }
  }, [progress.current, lastProgress]);

  // Detect stalled downloads (no progress for 15 seconds)
  useEffect(() => {
    const isDownloadPhase =
      progress.phase.split("-")[1] === "download" ||
      progress.phase === "online-patch";

    if (!isDownloadPhase || progress.percent >= 100 || !stallCheckEnabled) {
      setIsStalled(false);
      return;
    }

    const timer = setTimeout(() => {
      if (progress.current === lastProgress && progress.current > 0) {
        setIsStalled(true);
      }
    }, 15000); // 15 seconds - more lenient than before

    return () => clearTimeout(timer);
  }, [progress.current, lastProgress, progress.phase, progress.percent, stallCheckEnabled]);

  const showResumeButton = (downloadError || isStalled) && onResumeDownload;

  // When user clicks resume, give the download some time before checking for stalls again
  const handleResume = () => {
    if (onResumeDownload) {
      setIsStalled(false);
      setStallCheckEnabled(false);
      onResumeDownload();
      
      // Re-enable stall checking after 30 seconds
      setTimeout(() => {
        setStallCheckEnabled(true);
      }, 30000);
    }
  };

  return (
    <div className={cn("w-full flex flex-col", className)}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-white font-semibold flex items-center gap-2">
          {showResumeButton ? (
            <>
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
              Download Paused
            </>
          ) : (
            PHASES[progress.phase]
          )}
        </div>
        {showResumeButton && (
          <button
            onClick={handleResume}
            className="text-[10px] bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded transition-colors font-semibold shadow-md"
          >
            Resume Download
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        {progress.percent > -1 && (
          <div className="text-[10px] text-gray-300">{progress.percent}%</div>
        )}
        {progress.current !== undefined && (
          <div className="text-[10px] text-gray-300">
            {progress.total !== undefined ? (
              progress.phase.split("-")[1] === "download" ||
              progress.phase === "online-patch" ? (
                <>
                  {formatBytes(progress.current)} /{" "}
                  {formatBytes(progress.total)}
                </>
              ) : (
                <>
                  {progress.current} / {progress.total}
                </>
              )
            ) : progress.phase.split("-")[1] === "download" ||
              progress.phase === "online-patch" ? (
              <>{formatBytes(progress.current)}</>
            ) : null}
          </div>
        )}
      </div>
      <div className="relative mt-1 overflow-hidden">
        <div className="absolute inset-0 bg-white/20 rounded-full"></div>
        <div
          className={cn(
            "h-1 rounded-full transition-all duration-300",
            progress.percent === -1 && "animate-loading-horiz",
            showResumeButton
              ? "bg-linear-to-r from-yellow-400 to-orange-400 opacity-80"
              : "bg-linear-to-r from-[#3b82f6] to-[#60a5fa]"
          )}
          style={{
            width: progress.percent === -1 ? "100%" : `${progress.percent}%`,
          }}
        />
      </div>
      {showResumeButton && (
        <div className="text-[10px] text-yellow-300 mt-1 flex items-center gap-1">
          <svg
            className="w-3 h-3"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {downloadError
            ? "Connection lost. Your progress is saved."
            : "Download stalled. Your progress is saved."}{" "}
          Click Resume to continue from {formatBytes(progress.current || 0)}.
        </div>
      )}
    </div>
  );
}
