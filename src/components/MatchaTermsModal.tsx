import React from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Box, IconButton, Text } from "@chakra-ui/react";
import { ModalBackdrop, ModalCard } from "./ui";

const MatchaTermsModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <ModalBackdrop onClose={onClose}>
      <ModalCard maxW="1000px" w="92vw">
        <Box h="88vh" display="flex" flexDir="column">
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
      </ModalCard>
    </ModalBackdrop>,
    document.body,
  );
};

export default MatchaTermsModal;
