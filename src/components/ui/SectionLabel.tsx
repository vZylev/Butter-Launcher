import React from "react";
import { Text } from "@chakra-ui/react";

/**
 * Section label used for grouping items — small, uppercase, muted.
 * Follows the Settings/Credits pattern for section headings.
 */
const SectionLabel: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => (
  <Text
    fontSize="11px"
    color="rgba(255,255,255,0.3)"
    fontWeight="bold"
    textTransform="uppercase"
    letterSpacing="0.06em"
  >
    {children}
  </Text>
);

export default SectionLabel;
