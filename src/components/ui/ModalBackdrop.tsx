import React from "react";
import { Box } from "@chakra-ui/react";

/**
 * Standard modal/dialog backdrop — the frosted glass overlay.
 * Centres child content and handles backdrop-click to dismiss.
 */
const ModalBackdrop: React.FC<{
  children: React.ReactNode;
  onClose?: () => void;
  zIndex?: number;
}> = ({ children, onClose, zIndex = 1000 }) => {
  const mouseDownOnBackdrop = React.useRef(false);

  return (
    <Box
      className="glass-backdrop animate-fadeIn"
      position="fixed"
      inset={0}
      zIndex={zIndex}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onMouseDown={(e: React.MouseEvent) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={() => {
        mouseDownOnBackdrop.current = false;
      }}
      onMouseLeave={() => {
        mouseDownOnBackdrop.current = false;
      }}
      onClick={(e: React.MouseEvent) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
          onClose?.();
        }
        mouseDownOnBackdrop.current = false;
      }}
    >
      {children}
    </Box>
  );
};

export default ModalBackdrop;
