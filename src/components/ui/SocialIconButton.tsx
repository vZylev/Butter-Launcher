import React from "react";
import { IconButton } from "@chakra-ui/react";

/**
 * Consistent social / circle icon button used in the sidebar.
 * Replaces raw <button> elements with inline styles.
 */
const SocialIconButton: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, onClick, children }) => (
  <IconButton
    aria-label={title}
    title={title}
    variant="ghost"
    size="sm"
    w="34px"
    h="34px"
    minW="34px"
    borderRadius="full"
    bg="rgba(255,255,255,0.05)"
    color="white"
    _hover={{ bg: "rgba(255,255,255,0.12)" }}
    onClick={onClick}
  >
    {children}
  </IconButton>
);

export default SocialIconButton;
