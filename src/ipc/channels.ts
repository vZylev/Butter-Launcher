/**
 * Typed IPC channel definitions.
 *
 * Single source of truth for every channel name used between
 * the Electron main process and the renderer. Import these
 * constants instead of sprinkling raw strings across the codebase.
 */

// ── Fire-and-forget (ipcRenderer.send) ──────────────────────────

export const IPC_READY = "ready" as const;
export const IPC_MINIMIZE_WINDOW = "minimize-window" as const;
export const IPC_TOGGLE_MAXIMIZE_WINDOW = "toggle-maximize-window" as const;
export const IPC_REQUEST_CLOSE = "app:request-close" as const;
export const IPC_CLOSE_DOWNLOAD_CANCEL = "app:close-download:cancel" as const;
export const IPC_CANCEL_DOWNLOADS_AND_QUIT = "app:cancel-downloads-and-quit" as const;

export const IPC_INSTALL_GAME = "install-game" as const;
export const IPC_INSTALL_GAME_SMART = "install-game-smart" as const;
export const IPC_CANCEL_BUILD_DOWNLOAD = "cancel-build-download" as const;
export const IPC_LAUNCH_GAME = "launch-game" as const;
export const IPC_INSTALL_BUILD1_MANUAL = "install-build1-manual" as const;

export const IPC_ONLINE_PATCH_ENABLE = "online-patch:enable" as const;
export const IPC_ONLINE_PATCH_DISABLE = "online-patch:disable" as const;
export const IPC_ONLINE_PATCH_FIX_CLIENT = "online-patch:fix-client" as const;
export const IPC_ONLINE_PATCH_REMOVE = "online-patch:remove" as const;

export const IPC_RPC_ENABLE = "rpc:enable" as const;

// ── Request / Response (ipcRenderer.invoke) ─────────────────────

export const IPC_FETCH_HEAD = "fetch:head" as const;
export const IPC_FETCH_JSON = "fetch:json" as const;
export const IPC_LIST_INSTALLED_VERSIONS = "list-installed-versions" as const;
export const IPC_DELETE_INSTALLED_VERSION = "delete-installed-version" as const;
export const IPC_ONLINE_PATCH_HEALTH = "online-patch:health" as const;
export const IPC_ONLINE_PATCH_STATE = "online-patch:state" as const;
export const IPC_HOST_SERVER_OPEN_FOLDER = "host-server:open-current-folder" as const;

// ── Events (ipcRenderer.on) ────────────────────────────────────

export const IPC_PREMIUM_FORCE_LOGOUT = "premium:force-logout" as const;
export const IPC_CONFIRM_CLOSE_DOWNLOAD = "app:confirm-close-download" as const;

export const IPC_INSTALL_PROGRESS = "install-progress" as const;
export const IPC_INSTALL_STARTED = "install-started" as const;
export const IPC_INSTALL_FINISHED = "install-finished" as const;
export const IPC_INSTALL_ERROR = "install-error" as const;
export const IPC_INSTALL_CANCELLED = "install-cancelled" as const;
export const IPC_INSTALL_CANCEL_NOT_POSSIBLE = "install-cancel-not-possible" as const;

export const IPC_ONLINE_PATCH_PROGRESS = "online-patch-progress" as const;
export const IPC_ONLINE_PATCH_FINISHED = "online-patch-finished" as const;
export const IPC_ONLINE_PATCH_ERROR = "online-patch-error" as const;
export const IPC_ONLINE_UNPATCH_PROGRESS = "online-unpatch-progress" as const;
export const IPC_ONLINE_UNPATCH_FINISHED = "online-unpatch-finished" as const;
export const IPC_ONLINE_UNPATCH_ERROR = "online-unpatch-error" as const;

export const IPC_HOST_SERVER_LOG = "host-server:log" as const;
export const IPC_HOST_SERVER_STARTED = "host-server:started" as const;
export const IPC_HOST_SERVER_EXITED = "host-server:exited" as const;
export const IPC_HOST_SERVER_ERROR = "host-server:error" as const;

export const IPC_MODS_DOWNLOAD_PROGRESS = "mods:download-progress" as const;
export const IPC_MODS_DOWNLOAD_FINISHED = "mods:download-finished" as const;
export const IPC_MODS_DOWNLOAD_ERROR = "mods:download-error" as const;

// ── Once events ────────────────────────────────────────────────

export const IPC_LAUNCHED = "launched" as const;
export const IPC_LAUNCH_FINISHED = "launch-finished" as const;
export const IPC_LAUNCH_ERROR = "launch-error" as const;

// ── window.config.* method names (for reference) ──────────────

export const CONFIG_PREMIUM_STATUS = "premium:status" as const;
export const CONFIG_PREMIUM_OAUTH_START = "premium:oauth:start" as const;
export const CONFIG_PREMIUM_OAUTH_CANCEL = "premium:oauth:cancel" as const;
export const CONFIG_PREMIUM_LOGOUT = "premium:logout" as const;
export const CONFIG_OFFLINE_TOKEN_REFRESH = "offline-token:refresh" as const;
export const CONFIG_CUSTOM_JWKS_REFRESH = "custom-jwks:refresh" as const;
export const CONFIG_OFFICIAL_JWKS_REFRESH = "official-jwks:refresh" as const;
export const CONFIG_GET_DEFAULT_GAME_DIR = "get-default-game-directory" as const;
export const CONFIG_DOWNLOAD_DIR_GET = "download-directory:get" as const;
export const CONFIG_DOWNLOAD_DIR_SELECT = "download-directory:select" as const;
export const CONFIG_OPEN_FOLDER = "open-folder" as const;
export const CONFIG_OPEN_EXTERNAL = "open-external" as const;
export const CONFIG_PICK_FOLDER = "dialog:pick-folder" as const;
export const CONFIG_PICK_FILE = "dialog:pick-file" as const;
export const CONFIG_STARTUP_SOUND_GET = "launcher-settings:startup-sound:get" as const;
export const CONFIG_STARTUP_SOUND_SET = "launcher-settings:startup-sound:set" as const;
export const CONFIG_STARTUP_SOUND_FIRST_RUN = "launcher-settings:startup-sound:first-run-played" as const;
export const CONFIG_STEAMDECK_MODE_GET = "steamdeck-mode:get" as const;
export const CONFIG_STEAMDECK_MODE_SET = "steamdeck-mode:set" as const;
export const CONFIG_CLEAR_INSTALL_CACHE = "launcher-cache:clear-install-stagings" as const;
export const CONFIG_SUPPORT_TICKET_COLLECT = "support-ticket:collect" as const;
export const CONFIG_MATCHA_AVATAR_SYNC = "matcha:avatar:sync" as const;
export const CONFIG_MATCHA_AVATAR_UPLOAD = "matcha:avatar:uploadCustom" as const;
export const CONFIG_HOST_SERVER_START = "host-server:start" as const;
export const CONFIG_HOST_SERVER_STOP = "host-server:stop" as const;
export const CONFIG_HOST_SERVER_COMMAND = "host-server:command" as const;
export const CONFIG_HOST_SERVER_SYNC_FOLDER = "host-server:sync-folder" as const;
export const CONFIG_MODS_BROWSE = "mods:browse" as const;
export const CONFIG_MODS_DETAILS = "mods:details" as const;
export const CONFIG_MODS_DESCRIPTION = "mods:description" as const;
export const CONFIG_MODS_SEARCH = "mods:search" as const;
export const CONFIG_MODS_INSTALL = "mods:install" as const;
export const CONFIG_MODS_INSTALL_FILE = "mods:install-file" as const;
export const CONFIG_MODS_ATTACH_MANUAL = "mods:attach-manual" as const;
export const CONFIG_MODS_CHECK_UPDATE_ONE = "mods:check-update-one" as const;
export const CONFIG_MODS_CHECK_UPDATES_ALL = "mods:check-updates-all" as const;
export const CONFIG_MODS_UPDATE_ONE = "mods:update-one" as const;
export const CONFIG_MODS_UPDATE_ALL = "mods:update-all" as const;
export const CONFIG_MODS_REGISTRY = "mods:registry" as const;
export const CONFIG_MODS_INSTALLED_LIST = "mods:installed:list" as const;
export const CONFIG_MODS_INSTALLED_TOGGLE = "mods:installed:toggle" as const;
export const CONFIG_MODS_INSTALLED_DELETE = "mods:installed:delete" as const;
export const CONFIG_MODS_FILE_HASH = "mods:file-hash" as const;
export const CONFIG_MODS_INSTALLED_SET_ALL = "mods:installed:set-all" as const;
export const CONFIG_MODS_PROFILES_LIST = "mods:profiles:list" as const;
export const CONFIG_MODS_PROFILES_SAVE = "mods:profiles:save" as const;
export const CONFIG_MODS_PROFILES_DELETE = "mods:profiles:delete" as const;
export const CONFIG_MODS_PROFILES_APPLY = "mods:profiles:apply" as const;

// ── Matcha WebSocket ──────────────────────────────────────────

export const MATCHA_API_BASE = "https://butter.lat" as const;
export const MATCHA_WS_BASE = MATCHA_API_BASE.replace(/^http/, "ws") as string;
export const MATCHA_WS_URL = `${MATCHA_WS_BASE}/api/matcha/ws` as const;
