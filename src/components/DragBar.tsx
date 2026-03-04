import React from "react";
import { useTranslation } from "react-i18next";
import { Box, HStack, IconButton } from "@chakra-ui/react";
import { IconBrandInstagram, IconBrandX, IconMessageCircle } from "@tabler/icons-react";
import { StorageService } from "../services/StorageService";

const DragBar: React.FC<{
  left?: React.ReactNode;
  onLogout?: () => void;
  onOpenMatchaGlobalChat?: () => void;
}> = ({ left, onOpenMatchaGlobalChat }) => {
  const { t } = useTranslation();

  const handleMinimize = () => window.ipcRenderer.send("minimize-window");
  const handleToggleMaximize = () => window.ipcRenderer.send("toggle-maximize-window");
  const handleClose = () => window.ipcRenderer.send("app:request-close");

  return (
    <Box
      id="frame"
      as="header"
      position="relative"
      zIndex={5000}
      w="full"
      h="40px"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      px={3}
      style={{ appRegion: "drag" } as React.CSSProperties}
    >
      <HStack gap={2} fontSize="sm" color="whiteAlpha.800" style={{ appRegion: "no-drag" } as React.CSSProperties}>
        {left}
      </HStack>

      <HStack
        gap={0}
        px={2}
        py={1}
        bg="rgba(11,18,32,0.80)"
        backdropFilter="blur(14px)"
        borderWidth="1px"
        borderColor="whiteAlpha.100"
        borderRadius="0 0 0 10px"
        boxShadow="lg"
        style={{ appRegion: "no-drag" } as React.CSSProperties}
      >
        <IconButton
          aria-label="Global Chat"
          title={t("launcher.globalChat", { defaultValue: "Global Chat" })}
          variant="ghost"
          size="sm"
          w={8} h={8}
          minW={8}
          borderRadius="md"
          color="white"
          _hover={{ bg: "whiteAlpha.100" }}
          onClick={() => {
            try {
              const hasToken = !!StorageService.getMatchaToken();
              if (!hasToken) return;
            } catch { return; }
            onOpenMatchaGlobalChat?.();
          }}
        >
          <IconMessageCircle size={17} />
        </IconButton>

        <IconButton
          aria-label="Instagram"
          title="Instagram"
          variant="ghost"
          size="sm"
          w={8} h={8}
          minW={8}
          borderRadius="md"
          color="white"
          _hover={{ bg: "#E1306C" }}
          onClick={() => window.config.openExternal("https://www.instagram.com/butterlauncher_official")}
        >
          <IconBrandInstagram size={17} />
        </IconButton>

        <IconButton
          aria-label="X (Twitter)"
          title="X (Twitter)"
          variant="ghost"
          size="sm"
          w={8} h={8}
          minW={8}
          borderRadius="md"
          color="white"
          _hover={{ bg: "rgba(0,0,0,0.60)" }}
          onClick={() => window.config.openExternal("https://x.com/Butter_Launcher/")}
        >
          <IconBrandX size={17} />
        </IconButton>

        <Box w="1px" h={5} bg="whiteAlpha.100" mx={2} />

        <IconButton
          aria-label={t("common.minimize")}
          title={t("common.minimize")}
          variant="ghost"
          size="sm"
          w={8} h={8}
          minW={8}
          borderRadius="md"
          color="gray.300"
          _hover={{ bg: "whiteAlpha.100" }}
          onClick={handleMinimize}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect y="7.5" width="16" height="1" rx="0.5" fill="currentColor" />
          </svg>
        </IconButton>

        <IconButton
          aria-label={t("common.maximize")}
          title={t("common.maximize")}
          variant="ghost"
          size="sm"
          w={8} h={8}
          minW={8}
          borderRadius="md"
          color="gray.300"
          _hover={{ bg: "whiteAlpha.100" }}
          onClick={handleToggleMaximize}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </IconButton>

        <IconButton
          aria-label={t("common.close")}
          title={t("common.close")}
          variant="ghost"
          size="sm"
          w={8} h={8}
          minW={8}
          borderRadius="md"
          color="gray.300"
          _hover={{ bg: "red.600", color: "white" }}
          onClick={handleClose}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <line x1="4.35" y1="4.35" x2="11.65" y2="11.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11.65" y1="4.35" x2="4.35" y2="11.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
      </HStack>
    </Box>
  );
};

export default DragBar;
