import React from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button, HStack, IconButton, Text, Box } from "@chakra-ui/react";
import { ModalBackdrop, ModalCard, GradientButton } from "./ui";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
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

  if (!open) return null;
  if (typeof document === "undefined" || !document.body) return null;

  return createPortal(
    <ModalBackdrop onClose={onCancel}>
      <ModalCard maxW="md">
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
          <GradientButton size="sm" onClick={onConfirm}>
            {resolvedConfirmText}
          </GradientButton>
        </HStack>
      </ModalCard>
    </ModalBackdrop>,
    document.body,
  );
};

export default ConfirmModal;
