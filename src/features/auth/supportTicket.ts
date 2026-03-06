/**
 * Support ticket feature logic.
 *
 * Extracted from App.tsx.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { AuthService } from "../../services/AuthService";
import { StorageService } from "../../services/StorageService";
import { IPC_FETCH_JSON } from "../../ipc/channels";

// ── Constants ──────────────────────────────────────────────────

const SUPPORT_TICKET_POLL_MS = 2500;
const SUPPORT_TICKET_API_BASE =
  (import.meta as any).env?.VITE_SUPPORT_TICKET_API_BASE || "https://butter.lat";

const SUPPORT_TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const genSupportTicketCode = (): string => {
  const out: string[] = [];
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  for (let i = 0; i < 12; i++) {
    const b = bytes[i % bytes.length] ?? 0;
    out.push(SUPPORT_TICKET_ALPHABET[b % SUPPORT_TICKET_ALPHABET.length]);
  }

  const a = out.slice(0, 4).join("");
  const b = out.slice(4, 8).join("");
  const c = out.slice(8, 12).join("");
  return `BL:${a}-${b}-${c}`;
};

// ── Types ──────────────────────────────────────────────────────

export type SupportTicketPhase = "idle" | "waiting" | "uploading" | "done" | "error";

// ── Hook ───────────────────────────────────────────────────────

export function useSupportTicket(username: string | null) {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<SupportTicketPhase>("idle");
  const [statusText, setStatusText] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadStartedRef = useRef(false);

  const open = useCallback(() => {
    const c = genSupportTicketCode();
    setCode(c);
    setPhase("idle");
    setStatusText("");
    uploadStartedRef.current = false;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startUpload = useCallback(async () => {
    if (!username || !code) return;
    setPhase("waiting");
    setStatusText("");
    uploadStartedRef.current = false;

    try {
      const customUUID = StorageService.getString("customUUID") || undefined;
      await AuthService.collectSupportTicket(username, customUUID);
      uploadStartedRef.current = true;
      setPhase("uploading");
    } catch {
      setPhase("error");
      setStatusText("Failed to start upload");
    }
  }, [username, code]);

  // Polling effect
  useEffect(() => {
    if (!isOpen || phase === "idle" || phase === "done" || phase === "error") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const data = await window.ipcRenderer.invoke(
          IPC_FETCH_JSON,
          `${SUPPORT_TICKET_API_BASE}/api/support-ticket/status/${code}`,
          {},
        );
        if (data?.status === "done") {
          setPhase("done");
          setStatusText(data.message ?? "Complete");
        } else if (data?.status === "error") {
          setPhase("error");
          setStatusText(data.message ?? "Error");
        }
      } catch {
        // Polling failures are expected — silently retry.
      }
    }, SUPPORT_TICKET_POLL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isOpen, phase, code]);

  return {
    isOpen,
    code,
    phase,
    statusText,
    open,
    close,
    startUpload,
  };
}
