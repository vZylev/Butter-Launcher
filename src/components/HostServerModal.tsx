import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, Text } from "@chakra-ui/react";

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
    <Box
      className="glass-backdrop animate-fade-in"
      position="fixed"
      inset={0}
      zIndex={50}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        className={closing ? "animate-settings-out" : "animate-settings-in"}
        position="relative"
        w="92vw"
        maxW="1400px"
        h="88vh"
        mx="auto"
        rounded="xl"
        bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
        border="1px solid"
        borderColor="whiteAlpha.100"
        shadow="2xl"
        px={10}
        py={6}
        display="flex"
        flexDir="column"
      >
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
                <Button
                  color="white"
                  fontWeight="bold"
                  shadow="lg"
                  style={{ background: "linear-gradient(90deg,#3b82f6,#22d3ee)" }}
                  _hover={{ opacity: 0.9 }}
                  onClick={() => {
                    void window.config.openExternal(
                      "https://www.hycloudhosting.com/gameservers/hytale?ref=butterlauncher",
                    );
                  }}
                >
                  {t("hostServerModal.proHosting.button")}
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default HostServerModal;
