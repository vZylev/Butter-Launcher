import React, { useMemo, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Checkbox,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";

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
      <Box as="ul" mt={2} pl={5} fontSize="sm" color="whiteAlpha.800" listStyleType="disc">
        {items.map((line, idx) => (
          <Box as="li" key={idx} mb={1}>{line}</Box>
        ))}
      </Box>
    );
  }

  const text = typeof changelog === "string" ? changelog.trim() : "";
  if (!text) return null;
  return <Text mt={2} fontSize="sm" color="whiteAlpha.800" whiteSpace="pre-wrap">{text}</Text>;
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
    if (info.currentVersion) parts.push(t("launcherUpdate.subtitleCurrent", { version: info.currentVersion }));
    if (info.latestVersion) parts.push(t("launcherUpdate.subtitleLatest", { version: info.latestVersion }));
    return parts.join(" • ");
  }, [i18n.language, info.currentVersion, info.latestVersion, t]);

  if (!open) return null;

  return (
    <Box
      className="glass-backdrop animate-fade-in"
      position="fixed"
      inset={0}
      zIndex={10050}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        className="animate-settings-in"
        position="relative"
        w="full"
        maxW="2xl"
        rounded="xl"
        shadow="2xl"
        bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
        border="1px solid"
        borderColor="whiteAlpha.100"
        p={6}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <HStack justify="space-between" align="flex-start">
          <VStack align="flex-start" gap={1}>
            <Text color="white" fontWeight="extrabold" fontSize="xl">{title}</Text>
            <Text fontSize="sm" color="whiteAlpha.700">{t("launcherUpdate.description")}</Text>
            {!!subtitle && <Text fontSize="xs" color="whiteAlpha.500">{subtitle}</Text>}
            {info.publishedAt && (
              <Text fontSize="xs" color="whiteAlpha.500">
                {t("launcherUpdate.released", { date: info.publishedAt })}
              </Text>
            )}
          </VStack>

          <IconButton
            aria-label={t("common.close")}
            size="sm"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            rounded="full"
            flexShrink={0}
            onClick={() => onClose(dontRemindAgain)}
          >
            <IconX size={18} />
          </IconButton>
        </HStack>

        <Box mt={5}>
          <Text color="white" fontWeight="bold">{t("launcherUpdate.whatsNew")}</Text>
          {renderChangelog(info.changelog) ?? (
            <Text mt={2} fontSize="sm" color="whiteAlpha.800">
              {t("launcherUpdate.noChangelog")}
            </Text>
          )}
        </Box>

        <HStack mt={5} gap={2} align="center">
          <Checkbox.Root
            checked={dontRemindAgain}
            onCheckedChange={(d) => setDontRemindAgain(!!d.checked)}
            colorPalette="blue"
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label fontSize="sm" color="whiteAlpha.800">
              {t("launcherUpdate.dontRemindAgain")}
            </Checkbox.Label>
          </Checkbox.Root>
        </HStack>

        <HStack mt={6} justify="flex-end" gap={3}>
          <Button
            variant="outline"
            size="sm"
            borderColor="whiteAlpha.200"
            color="whiteAlpha.700"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            onClick={() => onClose(dontRemindAgain)}
          >
            {t("launcherUpdate.notNow")}
          </Button>
          <Button
            size="sm"
            color="white"
            fontWeight="bold"
            style={{ background: "linear-gradient(90deg,#0268D4,#02D4D4)" }}
            _hover={{ opacity: 0.9 }}
            onClick={() => onUpdate(dontRemindAgain)}
          >
            {t("launcherUpdate.update")}
          </Button>
        </HStack>
      </Box>
    </Box>
  );
};

export default LauncherUpdateModal;
