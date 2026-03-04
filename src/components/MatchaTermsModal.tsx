import React from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Box, IconButton, Text } from "@chakra-ui/react";

const MatchaTermsModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <Box
      className="glass-backdrop animate-fade-in"
      position="fixed"
      inset={0}
      zIndex={50}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Box
        className="animate-settings-in"
        position="relative"
        w="92vw"
        maxW="1000px"
        h="88vh"
        mx="auto"
        rounded="xl"
        bg="linear-gradient(to bottom, rgba(27,32,48,0.72), rgba(20,24,36,0.72))"
        border="1px solid"
        borderColor="whiteAlpha.100"
        shadow="2xl"
        px={4}
        py={4}
        display="flex"
        flexDir="column"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <IconButton
          aria-label={t("common.close")}
          position="absolute"
          top={3}
          right={3}
          size="sm"
          variant="ghost"
          color="whiteAlpha.600"
          _hover={{ color: "white", bg: "whiteAlpha.100" }}
          rounded="full"
          onClick={onClose}
        >
          <IconX size={18} />
        </IconButton>

        <Box display="flex" alignItems="center" justifyContent="space-between" gap={3} mb={1} pr={12}>
          <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide">
            {t("friendsMenu.terms.title")}
          </Text>
        </Box>
        <Text fontSize="xs" color="whiteAlpha.500">{t("friendsMenu.terms.lastUpdated")}</Text>

        <Box
          mt={3}
          flex={1}
          minH={0}
          rounded="lg"
          overflow="auto"
          border="1px solid"
          borderColor="whiteAlpha.100"
          bg="blackAlpha.400"
          className="dark-scrollbar"
          p={3}
          fontSize="sm"
          color="whiteAlpha.700"
          whiteSpace="pre-wrap"
          lineHeight="relaxed"
        >
          {t("friendsMenu.terms.body")}
        </Box>
      </Box>
    </Box>,
    document.body,
  );
};

export default MatchaTermsModal;
