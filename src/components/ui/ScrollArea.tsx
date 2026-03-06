import React from "react";
import { Box } from "@chakra-ui/react";

/**
 * Scrollable content area for panels. Always fills remaining flex space.
 * Matches the Settings panel scroll area style.
 */
const ScrollArea: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <Box
    flex={1}
    minH={0}
    overflowY="auto"
    pr={1}
    className={className ?? "dark-scrollbar"}
  >
    {children}
  </Box>
);

export default ScrollArea;
