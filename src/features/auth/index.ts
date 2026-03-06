/**
 * Auth feature barrel.
 */

export { useEasterEggDetector, ALL_EASTER_KEYS, EASTER_ASSETS } from "./easterEggs";
export type {
  ConfettiPiece,
  MatrixDrop,
  IkyTile,
  CryptSparkle,
  LunarBreakpoint,
} from "./easterEggs";
export * from "./easterEggs";

export { useLauncherUpdate } from "./launcherUpdate";
export type { LauncherUpdateInfo } from "./launcherUpdate";

export { useOfflineTokenRefresh, useJwksRefresh, useForceLogout } from "./authHooks";

export { useSupportTicket, genSupportTicketCode } from "./supportTicket";
export type { SupportTicketPhase } from "./supportTicket";
