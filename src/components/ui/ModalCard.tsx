import React from "react";
import { Box } from "@chakra-ui/react";

/**
 * Standard modal card wrapper — glass-style rounded panel.
 * Used inside ModalBackdrop for consistent dialog styling.
 */
const ModalCard: React.FC<{
  children: React.ReactNode;
  maxW?: string;
  w?: string;
}> = ({ children, maxW = "md", w = "full" }) => (
  <Box
    className="animate-settings-in"
    position="relative"
    w={w}
    maxW={maxW}
    rounded="xl"
    shadow="2xl"
    bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
    border="1px solid"
    borderColor="whiteAlpha.100"
    p={6}
    onClick={(e: React.MouseEvent) => e.stopPropagation()}
  >
    {children}
  </Box>
);

export default ModalCard;
