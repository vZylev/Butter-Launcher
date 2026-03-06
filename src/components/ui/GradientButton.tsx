import React from "react";
import { Button } from "@chakra-ui/react";

/**
 * Brand gradient button used across the app (login, update, confirm actions).
 * Provides the consistent blue → cyan gradient.
 */
const GradientButton: React.FC<
  React.ComponentProps<typeof Button> & {
    children: React.ReactNode;
  }
> = ({ children, ...props }) => (
  <Button
    color="white"
    fontWeight="bold"
    style={{ background: "linear-gradient(90deg, #0268D4, #02D4D4)" }}
    _hover={{ opacity: 0.9 }}
    {...props}
  >
    {children}
  </Button>
);

export default GradientButton;
