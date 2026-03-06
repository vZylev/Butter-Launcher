import React from "react";
import { Button } from "@chakra-ui/react";

/**
 * Sidebar navigation button — flat style: gray inactive, white active,
 * green when running/unread. Follows the Launcher sidebar design.
 */
const NavButton: React.FC<
  React.ComponentProps<typeof Button> & {
    running?: boolean;
    unread?: boolean;
    active?: boolean;
  }
> = ({ running, unread, active, children, className, ...props }) => (
  <Button
    variant="ghost"
    px={3}
    gap={2.5}
    h="38px"
    bg="transparent"
    borderRadius="lg"
    color={
      running || unread
        ? "#86efac"
        : active
          ? "#ffffff"
          : "#686868"
    }
    fontWeight={active ? "600" : "400"}
    fontSize="sm"
    letterSpacing="0"
    boxShadow="none"
    transition="color 0.15s"
    className={
      (running || unread ? "animate-nav-pulse " : "") + (className ?? "")
    }
    _hover={{
      bg: "transparent",
      color:
        running || unread
          ? "#86efac"
          : active
            ? "#ffffff"
            : "#b0b0b0",
    }}
    _active={{ bg: "rgba(255,255,255,0.05)" }}
    {...props}
  >
    {children}
  </Button>
);

export default NavButton;
