import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { formatBytes } from "../utils/formatNum";
import { useTranslation } from "react-i18next";

interface Props {
  progress: InstallProgress;
}

const PHASE_I18N_KEYS: Record<string, string> = {
  "pwr-download":  "progress.phases.pwrDownload",
  patching:        "progress.phases.patching",
  "online-patch":  "progress.phases.onlinePatch",
  "fix-download":  "progress.phases.fixDownload",
  "fix-extract":   "progress.phases.fixExtract",
  "jre-download":  "progress.phases.jreDownload",
  "jre-extract":   "progress.phases.jreExtract",
};

export default function ProgressBar({ progress }: Props) {
  const { t } = useTranslation();

  const stepIndex =
    typeof progress.stepIndex === "number" && Number.isFinite(progress.stepIndex)
      ? progress.stepIndex : null;
  const stepTotal =
    typeof progress.stepTotal === "number" && Number.isFinite(progress.stepTotal)
      ? progress.stepTotal : null;
  const showSteps = stepIndex != null && stepTotal != null && stepTotal > 1 && stepIndex >= 1;

  const isIndeterminate = progress.percent === -1;

  const renderBytes = () => {
    if (progress.current === undefined) return null;
    const isDownload = progress.phase.includes("download") || progress.phase === "online-patch";
    if (progress.total !== undefined) {
      return isDownload
        ? `${formatBytes(progress.current)} / ${formatBytes(progress.total)}`
        : `${progress.current} / ${progress.total}`;
    }
    return isDownload ? formatBytes(progress.current) : null;
  };

  const bytesLabel = renderBytes();

  return (
    <VStack gap={1} w="full" align="stretch">
      <HStack justify="space-between">
        <Text fontSize="xs" fontWeight="semibold" color="white" lineClamp={1}>
          {t(PHASE_I18N_KEYS[progress.phase] ?? "common.working")}
          {showSteps ? ` ${stepIndex}/${stepTotal}` : ""}
        </Text>
        <HStack gap={3} flexShrink={0}>
          {!isIndeterminate && (
            <Text fontSize="10px" color="whiteAlpha.700">{progress.percent}%</Text>
          )}
          {bytesLabel && (
            <Text fontSize="10px" color="whiteAlpha.700">{bytesLabel}</Text>
          )}
        </HStack>
      </HStack>

      <Box position="relative" h="4px" borderRadius="full" overflow="hidden">
        <Box position="absolute" inset={0} bg="whiteAlpha.200" borderRadius="full" />
        {isIndeterminate ? (
          <Box
            position="absolute"
            inset={0}
            borderRadius="full"
            style={{
              background: "linear-gradient(90deg, #0268D4, #02D4D4)",
              animation: "loadingHoriz 1.3s ease-in-out infinite",
            }}
          />
        ) : (
          <Box
            position="absolute"
            top={0}
            left={0}
            h="full"
            borderRadius="full"
            style={{
              width: `${progress.percent}%`,
              background: "linear-gradient(90deg, #0268D4, #02D4D4)",
              transition: "width 0.3s ease",
            }}
          />
        )}
      </Box>
    </VStack>
  );
}
