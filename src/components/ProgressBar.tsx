import { formatBytes } from "../utils/formatNum";
import { twMerge } from "tailwind-merge";

interface Props {
  progress: InstallProgress;
  className?: string;
}

const PHASES: Record<string, string> = {
  "pwr-download": "Downloading...",
  patching: "Patching...",
  "fix-download": "Downloading Fix...",
  "fix-extract": "Patching Fix...",
  "jre-download": "Downloading JRE...",
  "jre-extract": "Extracting JRE...",
};

export default function ProgressBar({ progress, className }: Props) {
  return (
    <div className={twMerge("w-full flex flex-col", className)}>
      <div className="text-xs text-white font-semibold">
        {PHASES[progress.phase]}
      </div>
      <div className="flex items-center justify-between mt-1">
        {progress.percent > -1 && (
          <div className="text-[10px] text-gray-300">{progress.percent}%</div>
        )}
        {progress.current !== undefined && progress.total !== undefined && (
          <div className="text-[10px] text-gray-300">
            {progress.phase.split("-")[1] === "download" ? (
              <>
                {formatBytes(progress.current)} / {formatBytes(progress.total)}
              </>
            ) : (
              <>
                {progress.current} / {progress.total}
              </>
            )}
          </div>
        )}
      </div>
      <div className="relative mt-1 overflow-hidden">
        <div className="absolute inset-0 bg-white/20 rounded-full"></div>
        <div
          className={twMerge(
            "h-1 bg-linear-to-r from-[#3b82f6] to-[#60a5fa] rounded-full",
            progress.percent === -1 && "animate-loading-horiz"
          )}
          style={{
            width: progress.percent === -1 ? "100%" : `${progress.percent}%`,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
