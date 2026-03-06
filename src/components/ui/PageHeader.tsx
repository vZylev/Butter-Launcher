import React from "react";
import { Box, HStack, IconButton, Text } from "@chakra-ui/react";
import { IconChevronLeft } from "@tabler/icons-react";

/** Reusable page header with optional back button and breadcrumb support.
 *  Follows the Settings panel design language. */
const PageHeader: React.FC<{
  title: string;
  onBack?: () => void;
  /** Optional breadcrumb (child page label shown after ›) */
  breadcrumb?: string | null;
  /** Called when the breadcrumb parent title is clicked */
  onBreadcrumbBack?: () => void;
  backLabel?: string;
}> = ({ title, onBack, breadcrumb, onBreadcrumbBack, backLabel = "Back" }) => (
  <HStack mb={6} gap={3} align="center">
    {(onBack || breadcrumb) && (
      <IconButton
        aria-label={backLabel}
        variant="ghost"
        size="sm"
        w="36px"
        h="36px"
        minW="36px"
        borderRadius="full"
        bg="rgba(255,255,255,0.08)"
        color="white"
        _hover={{ bg: "rgba(255,255,255,0.14)" }}
        flexShrink={0}
        onClick={breadcrumb ? onBreadcrumbBack : onBack}
      >
        <IconChevronLeft size={20} />
      </IconButton>
    )}

    <Box display="flex" alignItems="baseline" gap="6px" overflow="hidden">
      <Text
        fontSize="28px"
        fontWeight="700"
        letterSpacing="-0.02em"
        color={breadcrumb ? "rgba(255,255,255,0.35)" : "white"}
        style={{
          fontFamily: "'Montserrat', 'Inter', sans-serif",
          transition: "color 0.2s ease",
          cursor: breadcrumb ? "pointer" : "default",
          flexShrink: 0,
        }}
        onClick={breadcrumb ? onBreadcrumbBack : undefined}
        _hover={breadcrumb ? { color: "rgba(255,255,255,0.6)" } : {}}
      >
        {title}
      </Text>

      {breadcrumb && (
        <Box
          display="inline-flex"
          alignItems="baseline"
          gap="6px"
          style={{
            opacity: 1,
            transition: "opacity 0.22s ease, transform 0.22s ease",
            pointerEvents: "none",
          }}
        >
          <Text as="span" fontSize="26px" fontWeight="300" color="rgba(255,255,255,0.25)" lineHeight={1}>
            ›
          </Text>
          <Text
            as="span"
            fontSize="28px"
            fontWeight="700"
            letterSpacing="-0.02em"
            color="white"
            style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}
          >
            {breadcrumb}
          </Text>
        </Box>
      )}
    </Box>
  </HStack>
);

export default PageHeader;
