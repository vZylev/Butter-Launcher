import { formatBytes } from "../utils/formatNum";
import cn from "../utils/cn";
import { useTranslation } from "react-i18next";

interface Props {
  progress: InstallProgress;
  className?: string;
}

const PHASE_I18N_KEYS: Record<string, string> = {
  "pwr-download": "progress.phases.pwrDownload",
  patching: "progress.phases.patching",
  "online-patch": "progress.phases.onlinePatch",
  "fix-download": "progress.phases.fixDownload",
  "fix-extract": "progress.phases.fixExtract",
  "jre-download": "progress.phases.jreDownload",
  "jre-extract": "progress.phases.jreExtract",
};

export default function ProgressBar({ progress, className }: Props) {
  const { t } = useTranslation();

  const stepIndex =
    typeof progress.stepIndex === "number" && Number.isFinite(progress.stepIndex)
      ? progress.stepIndex
      : null;
  const stepTotal =
    typeof progress.stepTotal === "number" && Number.isFinite(progress.stepTotal)
      ? progress.stepTotal
      : null;
  const showSteps =
    stepIndex != null && stepTotal != null && stepTotal > 1 && stepIndex >= 1;

  return (
    <div className={cn("w-full flex flex-col", className)}>
      <div className="text-xs text-white font-semibold">
        {t(PHASE_I18N_KEYS[progress.phase] ?? "common.working")}
        {showSteps ? ` ${stepIndex}/${stepTotal}` : ""}
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
            "h-1 bg-linear-to-r from-[#0268D4] to-[#02D4D4] rounded-full",
            progress.percent === -1 && "animate-loading-horiz",
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
