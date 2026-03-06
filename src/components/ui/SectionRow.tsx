import React from "react";
import { Box, HStack, Text } from "@chakra-ui/react";

/**
 * Reusable flat list row — follows the Settings panel "SettingRow" pattern.
 * Use for any list of actions/toggles/settings throughout the app.
 */
const SectionRow: React.FC<{
  label: string;
  hint?: string;
  onClick?: () => void;
  right?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  noBorder?: boolean;
}> = ({ label, hint, onClick, right, disabled, danger, noBorder }) => (
  <HStack
    py={4}
    px={3}
    justify="space-between"
    align="center"
    borderBottom={noBorder ? "none" : "1px solid"}
    borderColor="rgba(255,255,255,0.06)"
    cursor={onClick && !disabled ? "pointer" : "default"}
    opacity={disabled ? 0.4 : 1}
    transition="background 0.12s"
    borderRadius="md"
    _hover={onClick && !disabled ? { bg: "rgba(255,255,255,0.04)" } : {}}
    onClick={onClick && !disabled ? onClick : undefined}
  >
    <Box flex={1} minW={0}>
      <Text
        fontSize="15px"
        fontWeight="500"
        lineHeight="1.4"
        color={danger ? "#f87171" : "rgba(255,255,255,0.92)"}
      >
        {label}
      </Text>
      {hint && (
        <Text
          fontSize="12px"
          lineHeight="1.5"
          color="rgba(255,255,255,0.38)"
          mt={1}
          wordBreak="break-all"
        >
          {hint}
        </Text>
      )}
    </Box>
    {right !== undefined && (
      <Box flexShrink={0} ml={4}>
        {right}
      </Box>
    )}
  </HStack>
);

export default SectionRow;
