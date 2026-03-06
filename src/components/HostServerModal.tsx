import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, Text } from "@chakra-ui/react";
import { ModalBackdrop, ModalCard, GradientButton } from "./ui";

const HostServerModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [closing, setClosing] = useState(false);
  const [localHostNoteOpen, setLocalHostNoteOpen] = useState(false);

  if (!open && !closing) return null;

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setLocalHostNoteOpen(false);
      setClosing(false);
      onClose();
    }, 160);
  };

  return (
    <ModalBackdrop onClose={close}>
      <ModalCard maxW="1400px" w="92vw">
        <Box h="88vh" display="flex" flexDir="column" px={4}>
          <Button
            position="absolute"
            top={3}
            right={3}
            size="sm"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            rounded="full"
            minW={8}
            h={8}
            p={0}
            onClick={close}
            aria-label={t("common.close")}
          >
            ×
          </Button>

          <Text fontSize="lg" fontWeight="semibold" color="white" letterSpacing="wide" mb={4}>
            {t("hostServerModal.title")}
          </Text>

          <Box flex={1} minH={0} overflowY="auto" pr={2}>
            <Box display="flex" flexDir="column" gap={4}>
              <Box rounded="lg" border="1px solid" borderColor="whiteAlpha.100" bg="rgba(31,37,56,0.7)" p={4}>
                <Box display="flex" justifyContent="center">
                  <Button
                    variant="outline"
                    borderColor="whiteAlpha.200"
                    color="whiteAlpha.800"
                    _hover={{ bg: "whiteAlpha.50" }}
                    onClick={() => setLocalHostNoteOpen(true)}
                  >
                    {t("hostServerModal.localHost.button")}
                  </Button>
                </Box>
                {localHostNoteOpen ? (
                  <Box mt={3} rounded="lg" border="1px solid" borderColor="rgba(253,230,138,0.2)" bg="blackAlpha.500" px={3} py={2}>
                    <Text fontSize="11px" color="yellow.200" lineHeight="relaxed">
                      {t("hostServerModal.localHost.note")}
                    </Text>
                  </Box>
                ) : null}
              </Box>

              <Box rounded="lg" border="1px solid" borderColor="whiteAlpha.100" bg="rgba(31,37,56,0.7)" p={4}>
                <Text
                  fontSize="sm"
                  fontWeight="extrabold"
                  letterSpacing="wider"
                  textTransform="uppercase"
                  style={{
                    background: "linear-gradient(90deg,#3b82f6,#22d3ee,#3b82f6)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {t("hostServerModal.proHosting.section")}
                </Text>

                <Box display="flex" justifyContent="center" mt={3}>
                  <GradientButton
                    shadow="lg"
                    onClick={() => {
                      void window.config.openExternal(
                        "https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher",
                      );
                    }}
                  >
                    {t("hostServerModal.proHosting.button")}
                  </GradientButton>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </ModalCard>
    </ModalBackdrop>
  );
};

export default HostServerModal;
