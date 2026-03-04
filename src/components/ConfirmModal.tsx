import React from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Box, Button, HStack, IconButton, Text } from "@chakra-ui/react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t("common.confirm");
  const resolvedCancelText = cancelText ?? t("common.cancel");
  const mouseDownOnBackdrop = React.useRef(false);

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <Box
      className="glass-backdrop animate-fadeIn"
      position="fixed"
      inset={0}
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onMouseDown={(e: React.MouseEvent) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={() => { mouseDownOnBackdrop.current = false; }}
      onMouseLeave={() => { mouseDownOnBackdrop.current = false; }}
      onClick={(e: React.MouseEvent) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onCancel();
        mouseDownOnBackdrop.current = false;
      }}
    >
      <Box
        className="animate-settings-in"
        position="relative"
        w="full"
        maxW="md"
        rounded="xl"
        shadow="2xl"
        bg="linear-gradient(to bottom, rgba(27,32,48,0.97), rgba(20,24,36,0.97))"
        border="1px solid"
        borderColor="whiteAlpha.100"
        p={6}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <HStack justify="space-between" align="flex-start">
          <Text color="white" fontWeight="extrabold" fontSize="lg">{title}</Text>
          <IconButton
            aria-label={t("common.close")}
            size="sm"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            rounded="full"
            onClick={onCancel}
          >
            <IconX size={18} />
          </IconButton>
        </HStack>

        {/* Message */}
        <Box mt={4} fontSize="sm" color="whiteAlpha.800" whiteSpace="pre-wrap">
          {message}
        </Box>

        {/* Buttons */}
        <HStack mt={6} justify="flex-end" gap={3}>
          <Button
            variant="outline"
            size="sm"
            borderColor="whiteAlpha.200"
            color="whiteAlpha.700"
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            onClick={onCancel}
          >
            {resolvedCancelText}
          </Button>
          <Button
            size="sm"
            color="white"
            fontWeight="bold"
            style={{ background: "linear-gradient(90deg,#0268D4,#02D4D4)" }}
            _hover={{ opacity: 0.9 }}
            onClick={onConfirm}
          >
            {resolvedConfirmText}
          </Button>
        </HStack>
      </Box>
    </Box>,
    document.body,
  );
};

export default ConfirmDialog;
