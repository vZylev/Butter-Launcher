import React from "react";
import { Box } from "@chakra-ui/react";

/**
 * Standard panel container matching the Settings panel style.
 * Provides consistent padding, scroll, and layout for view panels.
 */
const PanelContainer: React.FC<{
  children: React.ReactNode;
  dir?: "ltr" | "rtl";
}> = ({ children, dir }) => (
  <Box
    position="relative"
    w="full"
    h="full"
    bg="transparent"
    px={8}
    py={6}
    display="flex"
    flexDir="column"
    overflow="hidden"
    dir={dir}
  >
    {children}
  </Box>
);

export default PanelContainer;
