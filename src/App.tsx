import { useUserContext } from "./hooks/userContext";
import Launcher from "./components/Launcher";
import Login from "./components/Login";
import Loader from "./components/Loader";
import { useEffect, useRef, useState } from "react";
import LauncherUpdateModal, {
  LauncherUpdateInfo,
} from "./components/LauncherUpdateModal";
import { compareSemver } from "./utils/semver";
import magdPng from "./assets/magd.png";
import magdOgg from "./assets/magd.ogg";
import simonPng from "./assets/simon.jpg";
import simonOgg from "./assets/simon.ogg";
import nexusPng from "./assets/nexus.png";
import nexusOgg from "./assets/nexus.ogg";
import zyleOgg from "./assets/zyle.ogg";
import fitzxelOgg from "./assets/fitzxel.ogg";
import primePng from "./assets/prime.png";
import kaizorakdevOgg from "./assets/kaizorakdev.ogg";
import ikymaxOgg from "./assets/ikymax.ogg";
import cryptkeeperPng from "./assets/cryptkeeper.png";
import nickJpg from "./assets/nick.jpg";

type RemoteLauncherVersion = {
  version: string;
  publishedAt?: string;
  url?: string;
  changelog?: string | string[];
};

const LAUNCHER_VERSION_URL =
  (import.meta as any).env?.VITE_LAUNCHER_VERSION_URL ||
  "https://updates.butterlauncher.tech/version.json";

const SUPPRESS_KEY = "suppressLauncherUpdateVersion";
const MAGD_EASTER_KEY = "magdmagdmydear";
const MAGD_EASTER_MS = 6000;
const SIMON_EASTER_KEY = "simon";
const SIMON_EASTER_MS = 16000;
const NEXUS_EASTER_KEY = "nexusatko";
const NEXUS_TOTAL_MS = 9000;
const NEXUS_DEPLOY_MS = 1600;
const NEXUS_PATCH_MS = Math.max(1000, NEXUS_TOTAL_MS - NEXUS_DEPLOY_MS);
const NEXUS_CONFETTI_COUNT = 90;
const ZYLE_EASTER_KEY = "zyle";
const ZYLE_MS = 6000;
const FITZXEL_EASTER_KEY = "fitzxel";
const FITZXEL_MS = 6000;
const PRIME_EASTER_KEY = "primeisonline";
const PRIME_MS = 15000;
const KAIZ_EASTER_KEY = "kaizorakdev";
const KAIZ_MS = 10000;
const IKY_EASTER_KEY = "ikymax";
const IKY_MS = 15000;
const IKY_GLITCH_MS = 1200;
const IKY_FREEZE_AT_MS = 12600;
const IKY_REBUILD_AT_MS = 13800;

const CRYPTKEEPER_EASTER_KEY = "cryptkeeper";
const NICK_EASTER_KEY = "nick";
const CRYPT_MS = 9000;
const CRYPT_WARM_AT_MS = 1700;
const CRYPT_HEART_AT_MS = 3000;

const SUPPORT_TICKET_EASTER_KEY = "supportticket";
const SUPPORT_TICKET_POLL_MS = 2500;
const SUPPORT_TICKET_API_BASE =
  (import.meta as any).env?.VITE_SUPPORT_TICKET_API_BASE || "https://butter.lat";

const SUPPORT_TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const genSupportTicketCode = (): string => {
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

const LUNARKATSU_EASTER_KEY = "lunarkatsu";
const PRIMESTO_EASTER_KEY = "primesto";
const LUNAR_MS = 10000;

type LunarBreakpoint = {
  name: string;
  widthPx: number;
  heightPx: number;
  media: string;
};

const LUNAR_BREAKPOINTS: LunarBreakpoint[] = [
  { name: "mobile", widthPx: 360, heightPx: 640, media: "(max-width: 640px)" },
  { name: "tablet", widthPx: 768, heightPx: 560, media: "(min-width: 768px)" },
  { name: "desktop", widthPx: 1100, heightPx: 600, media: "(min-width: 1024px)" },
];

type IkyTile = {
  id: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  delayMs: number;
};

type CryptSparkle = {
  id: number;
  leftPct: number;
  topPct: number;
  sizePx: number;
  delayMs: number;
  durationMs: number;
  opacity: number;
};

const FITZXEL_ASCII = String.raw`
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                    %%%@@@@@@@@@@@                                                  
                                 @%%##################***#%@                                        
                               @%##################**********#%@                                    
                             @%###########******#****************#%                                 
                           @%%############***######*****************###%                            
                          @%#########################********************@                          
                         %%#############################*****************%@                         
                        %################################*****************@                         
                       %#**********++*********************+++**++++********@                        
                       #**********===+********+***********+++++++++++******#@                       
                     @#**********======+******++**********++++++++++********@                       
                    @##*********+=======+*****-=+*********+++++++++********#@                       
                   ###*********+++=======+***+--=**+=*****+++++****+*******@@                       
                     %##******+++++=======+**=---=--==****+********++*****#@                        
                      %##*****++++++========+=-----::-=+*+:=**************%@                        
                       ##*****+++++++========-------::-=++:::+************@@                        
                       @##****++++++++=======--------::-=+::::=+**********@                         
                        %#*****++++++++=======--------:::-:::::-+********#@                         
                         ##*****+++++++========--------::::::::::=*******@@                         
                        @@#******+++++++============----:::::::::=*******@                          
                     %%%%%############***************+++++++**+++*******#@                          
                     %%%%%%#############**************++++++=----+**+--+@@                          
                      @%%%%%###########*..=************++++-....:+*-:::::#                          
                       @%%%%%#########*:..:+************+++:.:::-=:::::::=@                         
                        %%%%%%%#######-....:*************+-::::::::-##=:-@@                         
                         %%%%%%%#####=::....:+**********+-:::::::::-**=:=@                          
                          @%#%%%%##*=:::......:+*******=-::::::::::==---#@                          
                           %#####*=-----::::......::::::::::::::::::---+@                           
                           @#**+==---=++-=+=:....::::::::::::::::----=*@                            
                            *+======----.......::::::::::::::::--*@@@                               
                            %+++======-:::...:::::::::::::::::--+@                                  
                             *++++==+****##**+=:::::::::::-:-:-=@                                   
                             %*++++*#*+=====--::::::::::---::--#@                                   
                              #*+*#########*=:::::::::--------+@                                    
                               @#########*=:::::::::---------=@                                     
                                 @######=::::::::------------@@                                      
                                  @##*+::::::::-------------*@                                      
                                   @*+++++++*******+==-----=@                                       
                                   %***##########*+=======+%                                        
                                   #******####*+=========+@                                         
                                  %**********+==========*@                                          
                                   %#*#######+=========#@                                           
                                      @%######*=======%@                                            
                                        @@%####*====+@@                                             
                                           @@%##*==+@                                               
                                              @@#*+@                                                
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
`;

type ConfettiPiece = {
  id: number;
  leftPct: number;
  sizePx: number;
  tiltDeg: number;
  delayMs: number;
  durationMs: number;
  colorClass: string;
};

type MatrixDrop = {
  id: number;
  leftPct: number;
  delayMs: number;
  durationMs: number;
  fontSizePx: number;
  text: string;
};

type PrimeOriginalStyles = {
  filter: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  boxShadow: string;
};

export default function App() {
  const { ready, username, setUsername } = useUserContext();
  const [showLoader, setShowLoader] = useState(true);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (!window.ipcRenderer) return;
    const onForceLogout = () => {
      try {
        setUsername(null);
      } catch {
        // ignore
      }

      try {
        void window.config.premiumLogout?.();
      } catch {
        // ignore
      }

      try {
        localStorage.removeItem("accountType");
      } catch {
        // ignore
      }
    };

    window.ipcRenderer.on("premium:force-logout", onForceLogout);
    return () => {
      try {
        window.ipcRenderer.off("premium:force-logout", onForceLogout);
      } catch {
        // ignore
      }
    };
  }, [setUsername]);

  const appRootRef = useRef<HTMLDivElement | null>(null);

  const [magdOpen, setMagdOpen] = useState(false);
  const [magdRunId, setMagdRunId] = useState(0);
  const magdAudioRef = useRef<HTMLAudioElement | null>(null);
  const magdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [simonOpen, setSimonOpen] = useState(false);
  const [simonRunId, setSimonRunId] = useState(0);
  const [simonDirection, setSimonDirection] = useState<"up" | "down">("up");
  const simonNextDirectionRef = useRef<"up" | "down">("up");
  const simonAudioRef = useRef<HTMLAudioElement | null>(null);
  const simonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nexusOpen, setNexusOpen] = useState(false);
  const [nexusStage, setNexusStage] = useState<"patching" | "deployed">(
    "patching",
  );
  const [nexusProgress, setNexusProgress] = useState(0);
  const [nexusConfetti, setNexusConfetti] = useState<ConfettiPiece[]>([]);
  const nexusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nexusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nexusAudioRef = useRef<HTMLAudioElement | null>(null);

  const [zyleOpen, setZyleOpen] = useState(false);
  const [zyleRunId, setZyleRunId] = useState(0);
  const zyleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zyleAudioRef = useRef<HTMLAudioElement | null>(null);

  const [fitzOpen, setFitzOpen] = useState(false);
  const [fitzRunId, setFitzRunId] = useState(0);
  const [fitzDrops, setFitzDrops] = useState<MatrixDrop[]>([]);
  const fitzTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitzAudioRef = useRef<HTMLAudioElement | null>(null);

  const primeActiveRef = useRef(false);
  const primeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const primeStyledRef = useRef<Map<HTMLElement, PrimeOriginalStyles>>(new Map());
  const primeSprayCtxRef = useRef<AudioContext | null>(null);
  const primeLastSprayRef = useRef(0);

  const kaizActiveRef = useRef(false);
  const kaizTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kaizTickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kaizOriginalTextRef = useRef<Map<HTMLElement, string>>(new Map());
  const kaizAudioPoolRef = useRef<HTMLAudioElement[]>([]);

  const [ikyOpen, setIkyOpen] = useState(false);
  const [ikyRunId, setIkyRunId] = useState(0);
  const [ikyPhase, setIkyPhase] = useState<
    "glitch" | "hex" | "freeze" | "rebuild"
  >("glitch");
  const ikyActiveRef = useRef(false);
  const ikyPhaseRef = useRef<"glitch" | "hex" | "freeze" | "rebuild">("glitch");
  const ikyStartRef = useRef(0);
  const [ikyDrops, setIkyDrops] = useState<MatrixDrop[]>([]);
  const [ikyTiles, setIkyTiles] = useState<IkyTile[]>([]);
  const [ikyLiveLog, setIkyLiveLog] = useState<string[]>([]);
  const ikyAudioRef = useRef<HTMLAudioElement | null>(null);
  const ikyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ikyLogTickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ikyLogCounterRef = useRef(0);

  const [cryptOpen, setCryptOpen] = useState(false);
  const [cryptRunId, setCryptRunId] = useState(0);
  const [cryptPhase, setCryptPhase] = useState<"lock" | "warm" | "heart">(
    "lock",
  );
  const [cryptSource, setCryptSource] = useState<"cryptkeeper" | "nick">(
    "cryptkeeper",
  );
  const [cryptSparkles, setCryptSparkles] = useState<CryptSparkle[]>([]);
  const cryptTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cryptSfxCtxRef = useRef<AudioContext | null>(null);

  const [supportTicketOpen, setSupportTicketOpen] = useState(false);
  const [supportTicketCode, setSupportTicketCode] = useState<string>("");
  const [supportTicketPhase, setSupportTicketPhase] = useState<
    "idle" | "waiting" | "uploading" | "done" | "error"
  >("idle");
  const [supportTicketStatusText, setSupportTicketStatusText] = useState<string>("");
  const supportTicketPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supportTicketUploadStartedRef = useRef(false);

  const [lunarOpen, setLunarOpen] = useState(false);
  const [lunarRunId, setLunarRunId] = useState(0);
  const [lunarWho, setLunarWho] = useState<"lunarkatsu" | "primesto">(
    "lunarkatsu",
  );
  const [lunarBpIdx, setLunarBpIdx] = useState(0);
  const [lunarLogs, setLunarLogs] = useState<string[]>([]);
  const lunarActiveRef = useRef(false);
  const lunarStartRef = useRef(0);
  const lunarTickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lunarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lunarSfxCtxRef = useRef<AudioContext | null>(null);

  const [launcherUpdateOpen, setLauncherUpdateOpen] = useState(false);
  const [launcherUpdateInfo, setLauncherUpdateInfo] = useState<
    LauncherUpdateInfo | null
  >(null);
  useEffect(() => {
    const root = document.documentElement;
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const now = performance.now();

    root.style.setProperty("--liquid-phase", `${(now / 1000) % 60}s`);

    root.style.setProperty("--liquid-duration", `${rand(6.0, 8.2).toFixed(2)}s`);
    root.style.setProperty("--liquid-a1", `${rand(0, 360).toFixed(0)}deg`);
    root.style.setProperty("--liquid-a2", `${rand(-180, 180).toFixed(0)}deg`);
    root.style.setProperty("--liquid-sx", `${rand(200, 280).toFixed(0)}%`);
    root.style.setProperty("--liquid-sy", `${rand(200, 280).toFixed(0)}%`);
    root.style.setProperty("--liquid-blob1x", `${rand(12, 38).toFixed(0)}%`);
    root.style.setProperty("--liquid-blob1y", `${rand(18, 48).toFixed(0)}%`);
    root.style.setProperty("--liquid-blob2x", `${rand(62, 88).toFixed(0)}%`);
    root.style.setProperty("--liquid-blob2y", `${rand(56, 86).toFixed(0)}%`);

    const drift = (maxAbs: number) => `${rand(-maxAbs, maxAbs).toFixed(0)}%`;
    root.style.setProperty("--liquid-l1x1", drift(18));
    root.style.setProperty("--liquid-l1y1", drift(14));
    root.style.setProperty("--liquid-l1x2", drift(18));
    root.style.setProperty("--liquid-l1y2", drift(14));
    root.style.setProperty("--liquid-l1x3", drift(18));
    root.style.setProperty("--liquid-l1y3", drift(14));

    root.style.setProperty("--liquid-l2x1", drift(16));
    root.style.setProperty("--liquid-l2y1", drift(16));
    root.style.setProperty("--liquid-l2x2", drift(16));
    root.style.setProperty("--liquid-l2y2", drift(16));
    root.style.setProperty("--liquid-l2x3", drift(16));
    root.style.setProperty("--liquid-l2y3", drift(16));
  }, []);

  useEffect(() => {
    let enableRPC = false;
    try {
      enableRPC = !!window.localStorage.getItem("enableRPC");
    } catch {
      enableRPC = false;
    }
    window.ipcRenderer.send("ready", {
      enableRPC,
    });

    if (ready) {
      setFade(true);
      const timeout = setTimeout(() => setShowLoader(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (showLoader) return;

    let cancelled = false;

    const safeString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    const load = async () => {
      try {
        const currentVersion = safeString((window.config as any)?.VERSION);
        if (!currentVersion) return;

        const remote = (await window.ipcRenderer.invoke(
          "fetch:json",
          LAUNCHER_VERSION_URL,
        )) as RemoteLauncherVersion;

        const latestVersion = safeString(remote?.version);
        if (!latestVersion) return;

        try {
          const suppressed = safeString(localStorage.getItem(SUPPRESS_KEY));
          if (suppressed && suppressed === latestVersion) return;
        } catch {
        }

        if (compareSemver(currentVersion, latestVersion) >= 0) return;

        const info: LauncherUpdateInfo = {
          currentVersion,
          latestVersion,
          publishedAt: safeString(remote?.publishedAt) || undefined,
          url: safeString(remote?.url) || undefined,
          changelog:
            typeof remote?.changelog === "string" || Array.isArray(remote?.changelog)
              ? remote.changelog
              : undefined,
        };

        if (cancelled) return;
        setLauncherUpdateInfo(info);
        setLauncherUpdateOpen(true);
      } catch {
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [ready, showLoader]);

  useEffect(() => {
    let buffer = "";

    const clearKaizTimers = () => {
      if (kaizTimeoutRef.current) {
        clearTimeout(kaizTimeoutRef.current);
        kaizTimeoutRef.current = null;
      }
      if (kaizTickRef.current) {
        clearTimeout(kaizTickRef.current);
        kaizTickRef.current = null;
      }
    };

    const stopKaiz = () => {
      clearKaizTimers();
      kaizActiveRef.current = false;

      const original = kaizOriginalTextRef.current;
      original.forEach((text, el) => {
        try {
          el.textContent = text;
        } catch {
        }
      });
      original.clear();

      const pool = kaizAudioPoolRef.current;
      kaizAudioPoolRef.current = [];
      for (const a of pool) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
        }
      }
    };

    const findButtonLabelNode = (btn: HTMLElement): HTMLElement | null => {
      const directText = (btn.textContent || "").trim();
      if (!directText) return null;

      const walker = document.createTreeWalker(btn, NodeFilter.SHOW_ELEMENT);
      let current = walker.currentNode as Element;
      const isLeafWithText = (el: Element) => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.children.length !== 0) return false;
        const t = (el.textContent || "").trim();
        return t.length > 0;
      };

      if (isLeafWithText(current)) return current as HTMLElement;
      while (walker.nextNode()) {
        current = walker.currentNode as Element;
        if (isLeafWithText(current)) return current as HTMLElement;
      }

      return btn;
    };

    const playKaizLayer = (layers: number) => {
      const count = Math.max(1, Math.min(12, layers));
      for (let i = 0; i < count; i++) {
        try {
          const a = new Audio(kaizorakdevOgg);
          a.volume = 0.65;
          kaizAudioPoolRef.current.push(a);
          const p = a.play();
          if (p && typeof (p as any).catch === "function") {
            (p as any).catch(() => {
            });
          }
        } catch {
        }
      }
    };

    const kaizLabels = [
      "PLAY",
      "JUGAR",
      "JOUER",
      "SPIELEN",
      "GIOCA",
      "IGRAJ",
      "ИГРАТЬ",
      "再生",
      "플레이",
      "تشغيل",
      "שחק",
      "⟟⟊⟒",
      "◇◆◇",
      "⚙︎⚡︎⚙︎",
      "⧗⧗⧗",
      "▒▓█",
      "// compile",
      "<mods/>",
      "[install]",
      "{servers}",
      "friends++",
      "wiki?",
      "host()",
    ];

    const triggerKaiz = () => {
      stopKaiz();
      kaizActiveRef.current = true;

      const root = appRootRef.current;
      if (!root) return;

      const candidates = Array.from(
        root.querySelectorAll<HTMLElement>("button, [role='button']"),
      );
      const labelNodes: HTMLElement[] = [];
      for (const c of candidates) {
        const node = findButtonLabelNode(c);
        if (!node) continue;
        if (!node.isConnected) continue;
        const text = (node.textContent || "").trim();
        if (!text) continue;
        if (!kaizOriginalTextRef.current.has(node)) {
          kaizOriginalTextRef.current.set(node, node.textContent || "");
        }
        labelNodes.push(node);
      }

      if (labelNodes.length === 0) {
        kaizActiveRef.current = false;
        return;
      }

      const pick = () => kaizLabels[Math.floor(Math.random() * kaizLabels.length)];
      const start = performance.now();

      const tick = () => {
        if (!kaizActiveRef.current) return;
        const now = performance.now();
        const t = Math.min(1, (now - start) / KAIZ_MS);

        const interval = Math.max(55, Math.floor(360 - t * 305));

        for (const n of labelNodes) {
          if (!n.isConnected) continue;
          try {
            n.textContent = pick();
          } catch {
          }
        }

        const layers = 1 + Math.floor(t * 7);
        playKaizLayer(layers);

        kaizTickRef.current = setTimeout(tick, interval);
      };

      tick();
      kaizTimeoutRef.current = setTimeout(() => {
        stopKaiz();
        playDeployedDing();
      }, KAIZ_MS);
    };

    const clearIkyTimers = () => {
      const timers = ikyTimersRef.current;
      ikyTimersRef.current = [];
      for (const t of timers) {
        try {
          clearTimeout(t);
        } catch {
        }
      }
    };

    const stopIkyAudio = () => {
      const audio = ikyAudioRef.current;
      ikyAudioRef.current = null;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
      }
    };

    const stopIky = () => {
      clearIkyTimers();
      stopIkyAudio();
      ikyActiveRef.current = false;
      if (ikyLogTickRef.current) {
        try {
          clearTimeout(ikyLogTickRef.current);
        } catch {
        }
        ikyLogTickRef.current = null;
      }
      setIkyOpen(false);
      setIkyDrops([]);
      setIkyTiles([]);
      setIkyLiveLog([]);
    };

    const clearCryptTimers = () => {
      const timers = cryptTimersRef.current;
      cryptTimersRef.current = [];
      for (const t of timers) {
        try {
          clearTimeout(t);
        } catch {
        }
      }
    };

    const stopCryptSfx = () => {
      const ctx = cryptSfxCtxRef.current;
      cryptSfxCtxRef.current = null;
      if (!ctx) return;
      try {
        void ctx.close();
      } catch {
      }
    };

    const stopCrypt = () => {
      clearCryptTimers();
      stopCryptSfx();
      setCryptOpen(false);
      setCryptSparkles([]);
    };

    const clearLunarTimers = () => {
      if (lunarTickRef.current) {
        try {
          clearTimeout(lunarTickRef.current);
        } catch {
        }
        lunarTickRef.current = null;
      }
      if (lunarTimeoutRef.current) {
        try {
          clearTimeout(lunarTimeoutRef.current);
        } catch {
        }
        lunarTimeoutRef.current = null;
      }
    };

    const stopLunarSfx = () => {
      const ctx = lunarSfxCtxRef.current;
      lunarSfxCtxRef.current = null;
      if (!ctx) return;
      try {
        void ctx.close();
      } catch {
      }
    };

    const stopLunar = () => {
      clearLunarTimers();
      stopLunarSfx();
      lunarActiveRef.current = false;
      setLunarOpen(false);
      setLunarLogs([]);
    };

    const getLunarCtx = () => {
      if (lunarSfxCtxRef.current) return lunarSfxCtxRef.current;
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      lunarSfxCtxRef.current = ctx;
      return ctx;
    };

    const playUiClick = (accent = 0) => {
      try {
        const ctx = getLunarCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        g.connect(ctx.destination);

        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.setValueAtTime(760 + accent * 90, now);
        o.frequency.exponentialRampToValueAtTime(520 + accent * 70, now + 0.05);
        o.connect(g);
        o.start(now);
        o.stop(now + 0.08);
      } catch {
      }
    };

    const triggerLunar = (who: "lunarkatsu" | "primesto") => {
      stopLunar();
      setLunarRunId((v) => v + 1);
      setLunarWho(who);
      setLunarOpen(true);
      setLunarBpIdx(0);
      setLunarLogs([
        `// Designer Mode: ${who === "lunarkatsu" ? "LunarKatsu" : "PrimeSto"}`,
        "> Opening Inspector...",
        "> Checking responsive layout...",
      ]);

      lunarActiveRef.current = true;
      lunarStartRef.current = performance.now();

      let localBp = 0;
      let tickCount = 0;
      const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
      const cssTips = [
        "align-items: center;",
        "gap: 12px;",
        "border-radius: 14px;",
        "letter-spacing: 0.02em;",
        "line-height: 1.15;",
        "backdrop-filter: blur(10px);",
        "transition: 180ms ease;",
        "outline: 2px solid transparent;",
      ];
      const ops = ["TWEAK", "NUDGE", "POLISH", "FIX", "SHIP"];
      const props = ["spacing", "grid", "type", "contrast", "hover", "focus", "alignment"];

      const tick = () => {
        if (!lunarActiveRef.current) return;
        const now = performance.now();
        const t = Math.min(1, (now - lunarStartRef.current) / LUNAR_MS);

        // Speed up slightly as it goes.
        const interval = Math.max(150, Math.floor(420 - t * 260));

        tickCount++;
        localBp = (localBp + 1) % LUNAR_BREAKPOINTS.length;
        setLunarBpIdx(localBp);
        playUiClick(localBp);

        const bp = LUNAR_BREAKPOINTS[localBp];
        const line1 = `@media ${bp.media} { /* ${bp.name} */ }`;
        const line2 = `${pick(ops)} ${pick(props)} → ${pick(cssTips)}`;
        const line3 = `// export: ${who}.fig  ✓  (pixel-perfect)`;
        const add = tickCount % 3 === 0 ? [line1, line2, line3] : [line1, line2];

        setLunarLogs((prev) => {
          const next = prev.length > 22 ? prev.slice(prev.length - 18) : prev.slice();
          next.push(...add);
          return next;
        });

        lunarTickRef.current = setTimeout(tick, interval);
      };

      tick();
      lunarTimeoutRef.current = setTimeout(() => {
        stopLunar();
        playDeployedDing();
      }, LUNAR_MS);
    };

    const getCryptCtx = () => {
      if (cryptSfxCtxRef.current) return cryptSfxCtxRef.current;
      const AudioCtx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      cryptSfxCtxRef.current = ctx;
      return ctx;
    };

    const playMetalClank = () => {
      try {
        const ctx = getCryptCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        const out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, now);
        out.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        out.connect(ctx.destination);

        const thud = ctx.createOscillator();
        thud.type = "sine";
        thud.frequency.setValueAtTime(92, now);
        thud.frequency.exponentialRampToValueAtTime(58, now + 0.18);

        const thudGain = ctx.createGain();
        thudGain.gain.setValueAtTime(0.0001, now);
        thudGain.gain.exponentialRampToValueAtTime(0.45, now + 0.012);
        thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        thud.connect(thudGain);
        thudGain.connect(out);
        thud.start(now);
        thud.stop(now + 0.24);

        const ring1 = ctx.createOscillator();
        ring1.type = "square";
        ring1.frequency.setValueAtTime(640, now);
        ring1.frequency.exponentialRampToValueAtTime(440, now + 0.22);
        const ring2 = ctx.createOscillator();
        ring2.type = "square";
        ring2.frequency.setValueAtTime(980, now);
        ring2.frequency.exponentialRampToValueAtTime(680, now + 0.22);

        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0.0001, now);
        ringGain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
        ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(1800, now);
        lp.Q.setValueAtTime(0.7, now);

        ring1.connect(ringGain);
        ring2.connect(ringGain);
        ringGain.connect(lp);
        lp.connect(out);

        ring1.start(now);
        ring2.start(now);
        ring1.stop(now + 0.5);
        ring2.stop(now + 0.5);

        const dur = 0.12;
        const bufferSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.75;
        const src = ctx.createBufferSource();
        src.buffer = buffer;

        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(1650, now);
        bp.Q.setValueAtTime(1.2, now);

        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(bp);
        bp.connect(ng);
        ng.connect(out);
        src.start(now);
        src.stop(now + dur);
      } catch {
      }
    };

    const playWarmGlow = () => {
      try {
        const ctx = getCryptCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        const out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, now);
        out.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
        out.connect(ctx.destination);

        const freqs = [392, 523.25, 659.25];
        for (const f of freqs) {
          const o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.setValueAtTime(f, now);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
          o.connect(g);
          g.connect(out);
          o.start(now);
          o.stop(now + 0.8);
        }

        const dur = 0.18;
        const bufferSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(800, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.1, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(lp);
        lp.connect(g);
        g.connect(out);
        src.start(now);
        src.stop(now + dur);
      } catch {
      }
    };

    const playSoftConfirm = () => {
      try {
        const ctx = getCryptCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, now);
        out.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        out.connect(ctx.destination);

        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(880, now);
        o.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
        o.connect(out);
        o.start(now);
        o.stop(now + 0.32);
      } catch {
      }
    };

    const triggerCrypt = (source: "cryptkeeper" | "nick") => {
      stopCrypt();
      setCryptRunId((v) => v + 1);
      setCryptPhase("lock");
      setCryptSource(source);
      setCryptOpen(true);

       const rand = (min: number, max: number) => min + Math.random() * (max - min);
       const seed = Math.floor(performance.now());
       const sparkles: CryptSparkle[] = Array.from({ length: 28 }, (_, idx) => {
         const ring = idx % 2 === 0 ? rand(8, 22) : rand(22, 38);
         const a = rand(0, Math.PI * 2);
         const dx = Math.cos(a) * ring;
         const dy = Math.sin(a) * ring;
         return {
           id: seed * 1000 + idx,
           leftPct: 50 + dx,
           topPct: 45 + dy,
           sizePx: rand(2, 5),
           delayMs: rand(0, 900),
           durationMs: rand(900, 1500),
           opacity: rand(0.25, 0.75),
         };
       });
       setCryptSparkles(sparkles);

      const timers: ReturnType<typeof setTimeout>[] = [];
      timers.push(
        setTimeout(() => playMetalClank(), 520),
        setTimeout(() => {
          setCryptPhase("warm");
          playWarmGlow();
        }, CRYPT_WARM_AT_MS),
        setTimeout(() => {
          setCryptPhase("heart");
          playSoftConfirm();
        }, CRYPT_HEART_AT_MS),
        setTimeout(() => {
          stopCrypt();
        }, CRYPT_MS),
      );
      cryptTimersRef.current = timers;
    };

    const makeIkyDrops = (seed: number) => {
      const rand = (min: number, max: number) => min + Math.random() * (max - min);
      const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

      const hexByte = () => Math.floor(rand(0, 256)).toString(16).padStart(2, "0").toUpperCase();
      const hexRow = () => {
        const addr = Math.floor(rand(0, 0xffff)).toString(16).padStart(4, "0").toUpperCase();
        const bytes = Array.from({ length: 16 }, () => hexByte());
        const ascii = bytes
          .map((b) => {
            const v = parseInt(b, 16);
            if (v >= 32 && v <= 126) return String.fromCharCode(v);
            return ".";
          })
          .join("");
        return `${addr}: ${bytes.join(" ")}  |${ascii}|`;
      };

      const mnemonics = [
        "mov",
        "xor",
        "cmp",
        "test",
        "lea",
        "push",
        "pop",
        "call",
        "jmp",
        "jne",
        "je",
        "add",
        "sub",
        "and",
        "or",
        "shl",
        "shr",
        "nop",
      ];
      const regs = ["eax", "ebx", "ecx", "edx", "esi", "edi", "rbx", "rcx", "rdx", "r8", "r9"];
      const asmLine = () => {
        const op = pick(mnemonics);
        const r1 = pick(regs);
        const r2 = pick(regs);
        const imm = `0x${Math.floor(rand(0, 0xffffff)).toString(16).toUpperCase()}`;
        const addr = `0x${Math.floor(rand(0x401000, 0x40ffff)).toString(16).toUpperCase()}`;
        const forms = [
          `${addr}  ${op} ${r1}, ${r2}`,
          `${addr}  ${op} ${r1}, ${imm}`,
          `${addr}  ${op} [${r1}+0x${Math.floor(rand(0, 256)).toString(16).toUpperCase()}], ${r2}`,
          `${addr}  ${op} ${imm}`,
        ];
        return pick(forms);
      };

      const drops: MatrixDrop[] = Array.from({ length: 140 }, (_, idx) => {
        const isHex = (seed + idx) % 3 !== 0;
        return {
          id: seed * 1000 + idx,
          leftPct: rand(1, 99),
          delayMs: rand(0, 1200),
          durationMs: rand(2200, 5200),
          fontSizePx: rand(9, 13),
          text: isHex ? hexRow() : asmLine(),
        };
      });

      setIkyDrops(drops);
    };

    const makeIkyTiles = (seed: number) => {
      const cols = 14;
      const rows = 8;
      const rand = (min: number, max: number) => min + Math.random() * (max - min);
      const w = 100 / cols;
      const h = 100 / rows;
      const duration = Math.max(200, IKY_MS - IKY_REBUILD_AT_MS);

      const tiles: IkyTile[] = [];
      let id = seed * 10000;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          tiles.push({
            id: id++,
            leftPct: c * w,
            topPct: r * h,
            widthPct: w,
            heightPct: h,
            delayMs: rand(0, Math.max(0, duration - 280)),
          });
        }
      }

      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(rand(0, i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }

      setIkyTiles(tiles);
    };

    const triggerIky = () => {
      stopIky();
      setIkyRunId((v) => v + 1);
      setIkyPhase("glitch");
      ikyPhaseRef.current = "glitch";
      setIkyOpen(true);
      ikyActiveRef.current = true;
      ikyStartRef.current = performance.now();
      ikyLogCounterRef.current = 0;
      setIkyLiveLog([
        "> Attaching debugger to renderer...",
        "> Dumping UI skin buffers...",
      ]);

      const seed = Math.floor(performance.now());
      makeIkyDrops(seed);
      makeIkyTiles(seed);

      try {
        const audio = new Audio(ikymaxOgg);
        audio.loop = true;
        audio.volume = 0.7;
        ikyAudioRef.current = audio;
        const p = audio.play();
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
          });
        }
      } catch {
      }

      const timers: ReturnType<typeof setTimeout>[] = [];
      timers.push(
        setTimeout(() => {
          setIkyPhase("hex");
          ikyPhaseRef.current = "hex";
        }, IKY_GLITCH_MS),
        setTimeout(() => {
          setIkyPhase("freeze");
          ikyPhaseRef.current = "freeze";
        }, IKY_FREEZE_AT_MS),
        setTimeout(() => {
          setIkyPhase("rebuild");
          ikyPhaseRef.current = "rebuild";
        }, IKY_REBUILD_AT_MS),
        setTimeout(() => {
          stopIky();
        }, IKY_MS),
      );
      ikyTimersRef.current = timers;

      const rand = (min: number, max: number) => min + Math.random() * (max - min);
      const hex = (n: number, width: number) => n.toString(16).toUpperCase().padStart(width, "0");
      const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
      const templates = [
        (i: number) => `> TRACE hook@0x${hex(0x400000 + Math.floor(rand(0, 0x1ffff)), 6)}  step=${hex(i, 4)}`,
        () => `> READ  mem[0x${hex(Math.floor(rand(0, 0xfffff)), 5)}]  len=0x${hex(Math.floor(rand(8, 128)), 2)}`,
        () => `> XOR   key=${hex(Math.floor(rand(0, 0xffffff)), 6)}  block=${hex(Math.floor(rand(0, 0xffff)), 4)}`,
        () => `> MAP   vdom@0x${hex(0x200000 + Math.floor(rand(0, 0x1ffff)), 6)}  nodes=${Math.floor(rand(42, 280))}`,
        () => `> PATCH fn#${Math.floor(rand(1, 32))}  opcode=${pick(["JNE", "JE", "CALL", "XOR", "MOV", "NOP"])}  ok`,
        (i: number) => `> DECODE pkt=0x${hex(1 + (i % 7), 2)}  nonce=0x${hex(Math.floor(rand(0, 0xffff)), 4)}`,
        () => `> HEAP  scan ${Math.floor(rand(1, 9))}/${Math.floor(rand(9, 13))}  fragments=${Math.floor(rand(2, 18))}`,
        () => `> ASSERT state.${pick(["ready", "session", "mods", "jre", "paths", "rpc"])} === true`,
      ];

      const tick = () => {
        if (!ikyActiveRef.current) return;
        const phaseNow = ikyPhaseRef.current;
        if (phaseNow !== "hex") {
          ikyLogTickRef.current = setTimeout(tick, 80);
          return;
        }

        const now = performance.now();
        const elapsed = now - ikyStartRef.current;
        const hexStart = IKY_GLITCH_MS;
        const hexEnd = IKY_FREEZE_AT_MS;
        const t = Math.max(0, Math.min(1, (elapsed - hexStart) / Math.max(1, hexEnd - hexStart)));
        const interval = Math.max(60, Math.floor(210 - t * 150));

        const i = (ikyLogCounterRef.current += 1);
        const line = templates[Math.floor(rand(0, templates.length))](i);
        setIkyLiveLog((prev) => {
          const next = prev.length > 20 ? prev.slice(prev.length - 18) : prev.slice();
          next.push(line);
          return next;
        });

        ikyLogTickRef.current = setTimeout(tick, interval);
      };

      ikyLogTickRef.current = setTimeout(tick, IKY_GLITCH_MS + 120);
    };

    const clearPrimeTimeout = () => {
      if (primeTimeoutRef.current) {
        clearTimeout(primeTimeoutRef.current);
        primeTimeoutRef.current = null;
      }
    };

    const stopPrime = () => {
      clearPrimeTimeout();
      primeActiveRef.current = false;

      try {
        document.body.classList.remove("primeisonline");
      } catch {
      }

      const handler = primeMoveHandlerRef.current;
      if (handler) {
        primeMoveHandlerRef.current = null;
        try {
          window.removeEventListener("mousemove", handler, true);
        } catch {
        }
      }

      const styled = primeStyledRef.current;
      styled.forEach((orig, el) => {
        try {
          el.style.filter = orig.filter;
          el.style.color = orig.color;
          el.style.backgroundColor = orig.backgroundColor;
          el.style.borderColor = orig.borderColor;
          el.style.boxShadow = orig.boxShadow;
        } catch {
        }
      });
      styled.clear();

      const ctx = primeSprayCtxRef.current;
      primeSprayCtxRef.current = null;
      if (ctx) {
        try {
          void ctx.close();
        } catch {
        }
      }
    };

    const playSprayBurst = () => {
      try {
        if (!primeSprayCtxRef.current) {
          const AudioCtx =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;
          primeSprayCtxRef.current = new AudioCtx();
        }

        const ctx = primeSprayCtxRef.current;
        if (!ctx) return;

        const now = ctx.currentTime;
        const duration = 0.09;
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.65;
        }

        const src = ctx.createBufferSource();
        src.buffer = buffer;

        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(800, now);

        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(2200, now);
        bp.Q.setValueAtTime(0.9, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        src.connect(hp);
        hp.connect(bp);
        bp.connect(gain);
        gain.connect(ctx.destination);

        src.start(now);
        src.stop(now + duration);
      } catch {
      }
    };

    const hslToRgb = (h: number, s: number, l: number) => {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const hp = h / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r1 = 0;
      let g1 = 0;
      let b1 = 0;
      if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
      else if (hp < 2) [r1, g1, b1] = [x, c, 0];
      else if (hp < 3) [r1, g1, b1] = [0, c, x];
      else if (hp < 4) [r1, g1, b1] = [0, x, c];
      else if (hp < 5) [r1, g1, b1] = [x, 0, c];
      else [r1, g1, b1] = [c, 0, x];
      const m = l - c / 2;
      const r = Math.round((r1 + m) * 255);
      const g = Math.round((g1 + m) * 255);
      const b = Math.round((b1 + m) * 255);
      return { r, g, b };
    };

    const triggerPrime = () => {
      stopPrime();
      primeActiveRef.current = true;

      try {
        document.body.classList.add("primeisonline");
      } catch {
      }

      const handler = (e: MouseEvent) => {
        if (!primeActiveRef.current) return;

        const now = performance.now();
        if (now - primeLastSprayRef.current > 45) {
          primeLastSprayRef.current = now;
          playSprayBurst();
        }

        const root = appRootRef.current;
        const target = document.elementFromPoint(e.clientX, e.clientY) as
          | HTMLElement
          | null;
        if (!target) return;
        if (root && !root.contains(target)) return;

        const el = target;

        const hue = (now / 8) % 360;
        const { r, g, b } = hslToRgb(hue, 1, 0.55);

        const styled = primeStyledRef.current;
        if (!styled.has(el)) {
          const cs = window.getComputedStyle(el);
          styled.set(el, {
            filter: el.style.filter || "",
            color: el.style.color || "",
            backgroundColor: el.style.backgroundColor || "",
            borderColor: el.style.borderColor || "",
            boxShadow: el.style.boxShadow || "",
          });


          void cs;
        }

        try {
          el.style.filter = `hue-rotate(${hue.toFixed(0)}deg) saturate(1.8)`;
          el.style.color = `rgb(${r}, ${g}, ${b})`;
          el.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.65)`;
          el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.12)`;
          el.style.boxShadow = `0 0 0 1px rgba(${r}, ${g}, ${b}, 0.22)`;
        } catch {
        }
      };

      primeMoveHandlerRef.current = handler;
      window.addEventListener("mousemove", handler, true);

      primeTimeoutRef.current = setTimeout(() => {
        stopPrime();
      }, PRIME_MS);
    };

    const clearFitzTimeout = () => {
      if (fitzTimeoutRef.current) {
        clearTimeout(fitzTimeoutRef.current);
        fitzTimeoutRef.current = null;
      }
    };

    const stopFitzAudio = () => {
      const audio = fitzAudioRef.current;
      fitzAudioRef.current = null;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
      }
    };

    const stopFitz = () => {
      clearFitzTimeout();
      stopFitzAudio();
      setFitzOpen(false);
      setFitzDrops([]);
    };

    const clearZyleTimeout = () => {
      if (zyleTimeoutRef.current) {
        clearTimeout(zyleTimeoutRef.current);
        zyleTimeoutRef.current = null;
      }
    };

    const stopZyleAudio = () => {
      const audio = zyleAudioRef.current;
      zyleAudioRef.current = null;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
      }
    };

    const stopZyle = () => {
      clearZyleTimeout();
      stopZyleAudio();
      setZyleOpen(false);
    };

    const clearNexusTimers = () => {
      if (nexusIntervalRef.current) {
        clearInterval(nexusIntervalRef.current);
        nexusIntervalRef.current = null;
      }
      if (nexusTimeoutRef.current) {
        clearTimeout(nexusTimeoutRef.current);
        nexusTimeoutRef.current = null;
      }
    };

    const stopNexusAudio = () => {
      const audio = nexusAudioRef.current;
      nexusAudioRef.current = null;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
      }
    };

    const stopNexus = () => {
      clearNexusTimers();
      stopNexusAudio();
      setNexusOpen(false);
      setNexusProgress(0);
      setNexusConfetti([]);
    };

    const playDeployedDing = () => {
      try {
        const AudioCtx =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          ctx.currentTime + 0.22,
        );

        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, ctx.currentTime);

        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1320, ctx.currentTime);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.24);
        osc2.stop(ctx.currentTime + 0.24);

        const close = () => {
          try {
            ctx.close();
          } catch {
          }
        };
        setTimeout(close, 350);
      } catch {
      }
    };

    const makeConfetti = (seed: number) => {
      const rand = (min: number, max: number) => min + Math.random() * (max - min);
      const colors = [
        "bg-red-600",
        "bg-blue-600",
        "bg-white",
        "bg-red-500",
        "bg-blue-500",
      ];
      const pieces: ConfettiPiece[] = Array.from(
        { length: NEXUS_CONFETTI_COUNT },
        (_, idx) => {
          const colorClass = colors[(seed + idx) % colors.length];
          return {
            id: seed * 1000 + idx,
            leftPct: rand(4, 96),
            sizePx: rand(6, 12),
            tiltDeg: rand(-40, 40),
            delayMs: rand(0, 600),
            durationMs: rand(1400, 2600),
            colorClass,
          };
        },
      );
      setNexusConfetti(pieces);
    };

    const triggerNexus = () => {
      stopNexus();
      setNexusStage("patching");
      setNexusProgress(0);
      setNexusOpen(true);
      setNexusConfetti([]);

      try {
        const audio = new Audio(nexusOgg);
        audio.volume = 0.9;
        audio.loop = true;
        nexusAudioRef.current = audio;

        const p = audio.play();
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
          });
        }
      } catch {
      }

      const startedAt = performance.now();
      nexusIntervalRef.current = setInterval(() => {
        const elapsed = performance.now() - startedAt;
        const pct = Math.min(100, Math.floor((elapsed / NEXUS_PATCH_MS) * 100));
        setNexusProgress(pct);
        if (pct >= 100) {
          if (nexusIntervalRef.current) {
            clearInterval(nexusIntervalRef.current);
            nexusIntervalRef.current = null;
          }
          setNexusStage("deployed");
          makeConfetti(Math.floor(Math.random() * 100000));
          playDeployedDing();

          nexusTimeoutRef.current = setTimeout(() => {
            stopNexus();
          }, NEXUS_DEPLOY_MS);
        }
      }, 50);
    };

    const triggerZyle = () => {
      stopZyle();

      setZyleRunId((v) => v + 1);
      setZyleOpen(true);

      try {
        const audio = new Audio(zyleOgg);
        audio.volume = 0.9;
        zyleAudioRef.current = audio;

        const p = audio.play();
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
          });
        }
      } catch {
      }

      zyleTimeoutRef.current = setTimeout(() => {
        stopZyle();
      }, ZYLE_MS);
    };

    const triggerFitz = () => {
      stopFitz();

      setFitzRunId((v) => v + 1);
      setFitzOpen(true);

      try {
        const audio = new Audio(fitzxelOgg);
        audio.volume = 0.9;
        fitzAudioRef.current = audio;

        const p = audio.play();
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
          });
        }
      } catch {
      }

      const rand = (min: number, max: number) => min + Math.random() * (max - min);
      const logLines = [
        "[build] initializing pipeline...",
        "[tsc] checking types...",
        "[vite] transforming modules...",
        "[vite] rendering chunks...",
        "[electron] packaging...",
        "[deps] resolving graph...",
        "[ok] ✓ compiled successfully",
        "[warn] source maps missing",
        "[log] patching registry...",
        "[log] writing manifest...",
      ];

      const randomTail = () => {
        const chars = "01abcdef";
        const len = Math.floor(rand(10, 28));
        let out = "";
        for (let i = 0; i < len; i++) out += chars[Math.floor(rand(0, chars.length))];
        return out;
      };

      const drops: MatrixDrop[] = Array.from({ length: 110 }, (_, idx) => {
        const base = logLines[Math.floor(rand(0, logLines.length))];
        const text = `${base} ${randomTail()}`;
        return {
          id: Date.now() + idx,
          leftPct: rand(2, 98),
          delayMs: rand(0, 1400),
          durationMs: rand(1800, 3800),
          fontSizePx: rand(10, 14),
          text,
        };
      });
      setFitzDrops(drops);

      fitzTimeoutRef.current = setTimeout(() => {
        stopFitz();
      }, FITZXEL_MS);
    };

    const clearMagdTimeout = () => {
      if (magdTimeoutRef.current) {
        clearTimeout(magdTimeoutRef.current);
        magdTimeoutRef.current = null;
      }
    };

    const stopMagdAudio = () => {
      const audio = magdAudioRef.current;
      magdAudioRef.current = null;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
      }
    };

    const hideMagdOverlay = () => {
      clearMagdTimeout();
      setMagdOpen(false);
    };

    const stopMagd = () => {
      hideMagdOverlay();
      stopMagdAudio();
    };

    const triggerMagd = () => {
      stopMagd();

      setMagdRunId((v) => v + 1);
      setMagdOpen(true);

      try {
        const audio = new Audio(magdOgg);
        audio.volume = 1;
        magdAudioRef.current = audio;

        const p = audio.play();
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
          });
        }
      } catch {
      }

      magdTimeoutRef.current = setTimeout(() => {
        hideMagdOverlay();
      }, MAGD_EASTER_MS);
    };

    const clearSimonTimeout = () => {
      if (simonTimeoutRef.current) {
        clearTimeout(simonTimeoutRef.current);
        simonTimeoutRef.current = null;
      }
    };

    const stopSimonAudio = () => {
      const audio = simonAudioRef.current;
      simonAudioRef.current = null;
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
      }
    };

    const stopSimon = () => {
      clearSimonTimeout();
      stopSimonAudio();
      setSimonOpen(false);
    };

    const triggerSimon = () => {
      stopSimon();

      setSimonRunId((v) => v + 1);

      const dir = simonNextDirectionRef.current;
      simonNextDirectionRef.current = dir === "up" ? "down" : "up";
      setSimonDirection(dir);

      setSimonOpen(true);

      try {
        const audio = new Audio(simonOgg);
        audio.volume = 1;
        simonAudioRef.current = audio;

        const p = audio.play();
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
          });
        }
      } catch {
      }

      simonTimeoutRef.current = setTimeout(() => {
        stopSimon();
      }, SIMON_EASTER_MS);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      if (key === "Backspace") {
        buffer = buffer.slice(0, -1);
        return;
      }

      if (key.length !== 1) return;
      const ch = key.toLowerCase();
      if (!/^[a-z0-9]$/.test(ch)) {
        buffer = "";
        return;
      }

      buffer += ch;
      const maxLength = Math.max(
        MAGD_EASTER_KEY.length,
        SIMON_EASTER_KEY.length,
        NEXUS_EASTER_KEY.length,
        ZYLE_EASTER_KEY.length,
        FITZXEL_EASTER_KEY.length,
        PRIME_EASTER_KEY.length,
        KAIZ_EASTER_KEY.length,
        IKY_EASTER_KEY.length,
        CRYPTKEEPER_EASTER_KEY.length,
        NICK_EASTER_KEY.length,
        LUNARKATSU_EASTER_KEY.length,
        PRIMESTO_EASTER_KEY.length,
        SUPPORT_TICKET_EASTER_KEY.length,
      );
      if (buffer.length > maxLength) {
        buffer = buffer.slice(buffer.length - maxLength);
      }

      if (buffer.endsWith(MAGD_EASTER_KEY)) {
        triggerMagd();
      }

      if (buffer.endsWith(SIMON_EASTER_KEY)) {
        triggerSimon();
      }

      if (buffer.endsWith(NEXUS_EASTER_KEY)) {
        buffer = "";
        triggerNexus();
      }

      if (buffer.endsWith(ZYLE_EASTER_KEY)) {
        buffer = "";
        triggerZyle();
      }

      if (buffer.endsWith(FITZXEL_EASTER_KEY)) {
        buffer = "";
        triggerFitz();
      }

      if (buffer.endsWith(PRIME_EASTER_KEY)) {
        buffer = "";
        triggerPrime();
      }

      if (buffer.endsWith(KAIZ_EASTER_KEY)) {
        buffer = "";
        triggerKaiz();
      }

      if (buffer.endsWith(IKY_EASTER_KEY)) {
        buffer = "";
        triggerIky();
      }

      if (buffer.endsWith(CRYPTKEEPER_EASTER_KEY) || buffer.endsWith(NICK_EASTER_KEY)) {
        const source = buffer.endsWith(NICK_EASTER_KEY) ? "nick" : "cryptkeeper";
        buffer = "";
        triggerCrypt(source);
      }

      if (buffer.endsWith(LUNARKATSU_EASTER_KEY) || buffer.endsWith(PRIMESTO_EASTER_KEY)) {
        const who = buffer.endsWith(PRIMESTO_EASTER_KEY) ? "primesto" : "lunarkatsu";
        buffer = "";
        triggerLunar(who);
      }

      if (buffer.endsWith(SUPPORT_TICKET_EASTER_KEY)) {
        buffer = "";
        const code = genSupportTicketCode();
        supportTicketUploadStartedRef.current = false;
        setSupportTicketCode(code);
        setSupportTicketPhase("waiting");
        setSupportTicketStatusText("Copy this code and send it to support.");
        setSupportTicketOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      stopMagd();
      stopSimon();
      stopNexus();
      stopZyle();
      stopFitz();
      stopPrime();
      stopKaiz();
      stopIky();
      stopCrypt();
      stopLunar();
    };
  }, []);

  useEffect(() => {
    if (!supportTicketOpen) return;
    if (!supportTicketCode) return;

    const clearPoll = () => {
      if (supportTicketPollRef.current) {
        try {
          clearInterval(supportTicketPollRef.current);
        } catch {
        }
        supportTicketPollRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const url = `${SUPPORT_TICKET_API_BASE}/api/client/support-ticket/status?code=${encodeURIComponent(supportTicketCode)}`;
        const status = (await window.ipcRenderer.invoke("fetch:json", url, {
          method: "GET",
          headers: {
            "cache-control": "no-store",
          },
        })) as any;

        const state = typeof status?.status === "string" ? status.status : "missing";
        if (state === "missing") {
          if (supportTicketPhase !== "waiting") setSupportTicketPhase("waiting");
          setSupportTicketStatusText(
            "Waiting for support to create the ticket with this code…",
          );
          return;
        }

        if (state === "uploaded") {
          setSupportTicketPhase("done");
          setSupportTicketStatusText("Los Desarrolladores te asistiran en breve.");
          clearPoll();
          return;
        }

        if (state !== "pending") {
          setSupportTicketPhase("error");
          setSupportTicketStatusText("Ticket inválido o expirado.");
          clearPoll();
          return;
        }

        // pending => accepted by support
        if (supportTicketUploadStartedRef.current) return;
        supportTicketUploadStartedRef.current = true;
        setSupportTicketPhase("uploading");
        setSupportTicketStatusText("Uploading logs…");

        const customUUID = (() => {
          try {
            const raw = (localStorage.getItem("customUUID") || "").trim();
            return raw.length ? raw : null;
          } catch {
            return null;
          }
        })();

        const bundle = (await (window.config as any).supportTicketCollect?.(
          username || "",
          customUUID,
        )) as any;

        if (!bundle || bundle.ok !== true) {
          setSupportTicketPhase("error");
          setSupportTicketStatusText(
            "No se pudieron recopilar los logs locales.",
          );
          clearPoll();
          return;
        }

        const uploadUrl = `${SUPPORT_TICKET_API_BASE}/api/client/support-ticket/upload`;
        const payload = {
          code: supportTicketCode,
          username: bundle.username,
          uuid: bundle.uuid,
          client: {
            os: (window.config as any).OS,
            arch: (window.config as any).ARCH,
            version: (window.config as any).VERSION,
            buildDate: (window.config as any).BUILD_DATE,
          },
          logs: bundle.logs,
        };

        const resp = (await window.ipcRenderer.invoke("fetch:json", uploadUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        })) as any;

        if (resp && resp.ok) {
          setSupportTicketPhase("done");
          setSupportTicketStatusText("Los Desarrolladores te asistiran en breve.");
          clearPoll();
          return;
        }

        setSupportTicketPhase("error");
        setSupportTicketStatusText(
          typeof resp?.error === "string" && resp.error.trim()
            ? resp.error
            : "Upload failed.",
        );
        clearPoll();
      } catch {
        setSupportTicketPhase("error");
        setSupportTicketStatusText("No se pudo conectar al soporte.");
        clearPoll();
      }
    };

    void poll();
    supportTicketPollRef.current = setInterval(poll, SUPPORT_TICKET_POLL_MS);

    return () => {
      clearPoll();
    };
  }, [supportTicketOpen, supportTicketCode, username, supportTicketPhase]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes simonSlideUp {
          0% { transform: translate(-50%, 100%); }
          100% { transform: translate(-50%, -100vh); }
        }

        @keyframes simonSlideDown {
          0% { transform: translate(-50%, -100%); }
          100% { transform: translate(-50%, 100vh); }
        }

        @keyframes nexusConfettiFall {
          0% { transform: translateY(-15vh) rotate(var(--tilt)); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(120vh) rotate(calc(var(--tilt) + 240deg)); opacity: 0.95; }
        }

        @keyframes nexusStampPop {
          0% { transform: translate(-50%, -50%) scale(1.6) rotate(-12deg); opacity: 0; }
          35% { opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1) rotate(-12deg); opacity: 1; }
        }

        @keyframes nexusDance {
          0% { transform: translate(-50%, -50%) rotate(-6deg) scale(1.00); }
          25% { transform: translate(calc(-50% - 6px), calc(-50% + 2px)) rotate(6deg) scale(1.03); }
          50% { transform: translate(-50%, calc(-50% + 6px)) rotate(-4deg) scale(1.01); }
          75% { transform: translate(calc(-50% + 6px), calc(-50% + 2px)) rotate(5deg) scale(1.03); }
          100% { transform: translate(-50%, -50%) rotate(-6deg) scale(1.00); }
        }

        @keyframes zyleBlueprintFade {
          0% { opacity: 0; }
          12% { opacity: 1; }
          86% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes zyleSketchFlicker {
          0% { opacity: 0.55; }
          8% { opacity: 0.72; }
          16% { opacity: 0.58; }
          24% { opacity: 0.75; }
          32% { opacity: 0.6; }
          100% { opacity: 0.68; }
        }

        @keyframes zyleGridDrift {
          0% { background-position: 0px 0px; }
          100% { background-position: 64px 64px; }
        }

        @keyframes zylePartIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes zyleDraw {
          0% { transform: scaleX(0); opacity: 0.75; }
          100% { transform: scaleX(1); opacity: 0.12; }
        }

        @keyframes zyleScanline {
          0% { transform: translateY(-20%); opacity: 0; }
          8% { opacity: 0.35; }
          100% { transform: translateY(140%); opacity: 0; }
        }

        @keyframes zyleApprovedIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes fitzRain {
          0% { transform: translateY(-30vh); opacity: 0; }
          8% { opacity: 0.95; }
          100% { transform: translateY(130vh); opacity: 0.2; }
        }

        @keyframes fitzAsciiIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.99); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes fitzRainDim {
          0% { opacity: 1; }
          100% { opacity: 0.25; }
        }

        @keyframes ikyRain {
          0% { transform: translateY(-28vh); opacity: 0; }
          10% { opacity: 0.95; }
          100% { transform: translateY(135vh); opacity: 0.18; }
        }

        @keyframes ikyTileOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.985); }
        }

        @keyframes ikyStampPop {
          0% { transform: scale(1.55); opacity: 0; filter: blur(2px); }
          100% { transform: scale(1); opacity: 1; filter: blur(0); }
        }

        @keyframes ikyJitter {
          0% { transform: translate(0, 0); }
          20% { transform: translate(-2px, 1px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, -2px); }
          80% { transform: translate(1px, 2px); }
          100% { transform: translate(0, 0); }
        }

        @keyframes ikyFlicker {
          0% { opacity: 1; }
          10% { opacity: 0.65; }
          20% { opacity: 1; }
          35% { opacity: 0.72; }
          55% { opacity: 1; }
          70% { opacity: 0.6; }
          100% { opacity: 1; }
        }

        @keyframes ikyScanlines {
          0% { transform: translateY(0); }
          100% { transform: translateY(6px); }
        }

        @keyframes ikyBars {
          0% { transform: translateY(-8%); }
          100% { transform: translateY(8%); }
        }

        @keyframes ikyType {
          0% { clip-path: inset(0 100% 0 0); opacity: 0.2; }
          10% { opacity: 1; }
          100% { clip-path: inset(0 0 0 0); opacity: 1; }
        }

        @keyframes ikyCaret {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        .iky-scanlines {
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(34, 197, 94, 0.06),
            rgba(34, 197, 94, 0.06) 1px,
            transparent 1px,
            transparent 6px
          );
          animation: ikyScanlines 220ms steps(2, end) infinite;
          mix-blend-mode: screen;
          opacity: 0.8;
        }

        .iky-glitch-bars {
          background-image:
            repeating-linear-gradient(
              to bottom,
              rgba(34, 197, 94, 0.0),
              rgba(34, 197, 94, 0.0) 10px,
              rgba(34, 197, 94, 0.09) 10px,
              rgba(34, 197, 94, 0.09) 14px
            ),
            linear-gradient(90deg, rgba(255,255,255,0.06), transparent 55%, rgba(255,255,255,0.03));
          animation: ikyBars 170ms steps(2, end) infinite;
          mix-blend-mode: screen;
          opacity: 0.9;
        }

        .iky-glitch {
          animation: ikyJitter 90ms steps(2, end) infinite, ikyFlicker 280ms steps(2, end) infinite;
          filter: saturate(1.35) contrast(1.22) hue-rotate(22deg);
        }

        .iky-type {
          overflow: hidden;
          white-space: nowrap;
          clip-path: inset(0 100% 0 0);
          animation: ikyType 820ms steps(34, end) both;
        }

        .iky-caret {
          display: inline-block;
          margin-left: 6px;
          animation: ikyCaret 650ms steps(1, end) infinite;
        }

        body.primeisonline, body.primeisonline * {
          cursor: url("${primePng}") 6 6, crosshair !important;
        }

        .zyle-part {
          position: relative;
          overflow: hidden;
          animation: zylePartIn 420ms ease-out both;
        }
        .zyle-draw {
          position: absolute;
          inset: 0;
          transform-origin: left center;
          background-image: linear-gradient(90deg, rgba(34,211,238,0.55), rgba(34,211,238,0.04));
          animation: zyleDraw 760ms ease-out both;
          pointer-events: none;
        }

        .nexus-door {
          will-change: transform;
          transform: translateX(0);
        }
        .nexus-doors.open .nexus-door.left { transform: translateX(-120%); }
        .nexus-doors.open .nexus-door.right { transform: translateX(120%); }

        @keyframes ckShackleClose {
          0% { transform: translate(-50%, -22px) scaleY(1.05); }
          60% { transform: translate(-50%, 2px) scaleY(1.0); }
          100% { transform: translate(-50%, 0px) scaleY(1.0); }
        }

        @keyframes ckLockImpact {
          0% { transform: translateY(0); }
          35% { transform: translateY(2px); }
          55% { transform: translateY(-1px); }
          100% { transform: translateY(0); }
        }

        @keyframes ckWarmGlow {
          0% { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes ckMorphOut {
          0% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); }
          100% { opacity: 0; transform: scale(0.92) rotate(-3deg); filter: blur(6px); }
        }

        @keyframes ckMorphIn {
          0% { opacity: 0; transform: scale(0.92) rotate(2deg); filter: blur(6px); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); }
        }

        @keyframes ckTextIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes ckGlowPulse {
          0% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.03); }
          100% { opacity: 0.55; transform: scale(1); }
        }

        @keyframes ckHeartBeat {
          0% { transform: scale(1); }
          18% { transform: scale(1.06); }
          32% { transform: scale(1.0); }
          54% { transform: scale(1.08); }
          70% { transform: scale(1.0); }
          100% { transform: scale(1); }
        }

        @keyframes ckFloat {
          0% { transform: translate(-50%, -48%) translateY(0px); }
          50% { transform: translate(-50%, -48%) translateY(-6px); }
          100% { transform: translate(-50%, -48%) translateY(0px); }
        }

        @keyframes ckSparkle {
          0% { transform: translateY(6px) scale(0.9); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translateY(-14px) scale(1.15); opacity: 0; }
        }

        @keyframes ckNickIn {
          0% { transform: translateX(26px) translateY(-6px); opacity: 0; }
          100% { transform: translateX(0) translateY(0); opacity: 1; }
        }

        @keyframes ckNickNod {
          0% { transform: rotate(0deg) translateY(0px); }
          30% { transform: rotate(-2deg) translateY(0px); }
          55% { transform: rotate(0deg) translateY(2px); }
          100% { transform: rotate(0deg) translateY(0px); }
        }

        @keyframes ckNickScan {
          0% { transform: translateY(-120%); opacity: 0; }
          15% { opacity: 0.55; }
          100% { transform: translateY(220%); opacity: 0; }
        }

        .ck-nickCard {
          width: 126px;
          height: 126px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(253, 230, 138, 0.22);
          background: rgba(0, 0, 0, 0.35);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
          animation: ckNickIn 420ms ease-out both;
        }

        .ck-nickImg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: saturate(1.05) contrast(1.05);
        }

        .ck-nickScan {
          position: absolute;
          left: 0;
          right: 0;
          height: 36px;
          background: linear-gradient(
            180deg,
            transparent,
            rgba(253, 230, 138, 0.22),
            rgba(253, 230, 138, 0.06),
            transparent
          );
          mix-blend-mode: screen;
          animation: ckNickScan 980ms ease-in-out infinite;
        }

        .ck-lock {
          position: relative;
          width: 190px;
          height: 240px;
        }

        .ck-shackle {
          position: absolute;
          left: 50%;
          top: 0;
          width: 128px;
          height: 122px;
          border: 14px solid rgba(255, 255, 255, 0.78);
          border-bottom: 0;
          border-radius: 84px 84px 0 0;
          transform: translate(-50%, -22px) scaleY(1.05);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.25) inset;
        }

        .ck-body {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 190px;
          height: 150px;
          transform: translateX(-50%);
          border-radius: 18px;
          border: 2px solid rgba(255,255,255,0.22);
          background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
          box-shadow: 0 18px 50px rgba(0,0,0,0.55);
        }

        .ck-keyhole {
          position: absolute;
          left: 50%;
          top: 56px;
          width: 26px;
          height: 38px;
          transform: translateX(-50%);
          border-radius: 16px;
          background: rgba(0,0,0,0.55);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset;
        }
        .ck-keyhole:after {
          content: "";
          position: absolute;
          left: 50%;
          top: 26px;
          width: 10px;
          height: 14px;
          transform: translateX(-50%);
          border-radius: 10px;
          background: rgba(0,0,0,0.55);
        }

        .ck-close .ck-shackle {
          animation: ckShackleClose 860ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
        }
        .ck-close {
          animation: ckLockImpact 220ms ease-out 520ms both;
        }

        .ck-warmGlow {
          animation: ckWarmGlow 650ms ease-out both;
        }

        .ck-warmGlowPulse {
          animation: ckGlowPulse 1200ms ease-in-out infinite;
        }

        .ck-heartImg {
          width: 150px;
          height: 150px;
          aspect-ratio: 1 / 1;
          object-fit: contain;
          image-rendering: pixelated;
          filter: drop-shadow(0 0 18px rgba(253, 230, 138, 0.22));
          animation: ckHeartBeat 1200ms ease-in-out infinite;
        }

        .ck-heartFloat {
          animation: ckFloat 1800ms ease-in-out infinite;
          will-change: transform;
        }

        .ck-spark {
          position: absolute;
          background: rgba(253, 230, 138, 0.95);
          box-shadow: 0 0 14px rgba(253, 230, 138, 0.22);
          animation: ckSparkle 1100ms ease-out infinite;
        }

        .ck-heart {
          --px: 10px;
          width: var(--px);
          height: var(--px);
          background: rgba(253, 230, 138, 0.92);
          box-shadow:
            calc(var(--px) * 2) 0 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 3) 0 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 5) 0 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 6) 0 0 0 rgba(253, 230, 138, 0.92),

            calc(var(--px) * 1) calc(var(--px) * 1) 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 4) calc(var(--px) * 1) 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 7) calc(var(--px) * 1) 0 0 rgba(253, 230, 138, 0.92),

            calc(var(--px) * 1) calc(var(--px) * 2) 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 7) calc(var(--px) * 2) 0 0 rgba(253, 230, 138, 0.92),

            calc(var(--px) * 2) calc(var(--px) * 3) 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 6) calc(var(--px) * 3) 0 0 rgba(253, 230, 138, 0.92),

            calc(var(--px) * 3) calc(var(--px) * 4) 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 5) calc(var(--px) * 4) 0 0 rgba(253, 230, 138, 0.92),

            calc(var(--px) * 4) calc(var(--px) * 5) 0 0 rgba(253, 230, 138, 0.92),
            calc(var(--px) * 4) calc(var(--px) * 6) 0 0 rgba(253, 230, 138, 0.92);
          filter: drop-shadow(0 0 18px rgba(253, 230, 138, 0.35));
        }

        @keyframes lunarGuideSweep {
          0% { transform: translateX(-20%); opacity: 0; }
          10% { opacity: 0.6; }
          100% { transform: translateX(120%); opacity: 0; }
        }

        @keyframes lunarCursor {
          0% { transform: translate(0, 0); opacity: 0; }
          10% { opacity: 1; }
          55% { transform: translate(96px, 38px); }
          75% { transform: translate(84px, 62px); }
          100% { transform: translate(124px, 46px); opacity: 0; }
        }

        @keyframes lunarBadge {
          0% { opacity: 0; transform: translateY(-6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {cryptOpen && (
        <div
          key={`crypt-${cryptRunId}`}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[999999] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/75" />

          {cryptSource === "nick" && (
            <div
              className="absolute right-6 top-6"
              style={{
                animation:
                  cryptPhase === "heart"
                    ? "ckNickNod 900ms ease-in-out infinite"
                    : undefined,
              }}
            >
              <div className="ck-nickCard relative">
                <img
                  src={nickJpg}
                  alt=""
                  draggable={false}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                  className="ck-nickImg"
                />
                <span className="ck-nickScan" />
                <div className="absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-amber-200/80">
                    audit
                  </div>
                </div>
              </div>
            </div>
          )}

          {(cryptPhase === "warm" || cryptPhase === "heart") && (
            <div
              className={
                "ck-warmGlow absolute inset-0 " +
                (cryptPhase === "heart" ? "ck-warmGlowPulse" : "")
              }
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 45%, rgba(253,230,138,0.22), rgba(0,0,0,0) 55%)",
              }}
            />
          )}

          <div className="relative flex flex-col items-center">
            <div
              className={
                "relative " +
                (cryptPhase === "lock" ? "ck-close" : "") +
                ""
              }
              style={{
                opacity: cryptPhase === "heart" ? 0 : 1,
                animation: cryptPhase === "heart" ? "ckMorphOut 520ms ease-out both" : undefined,
              }}
            >
              <div className="ck-lock">
                <div className="ck-shackle" />
                <div className="ck-body">
                  <div className="ck-keyhole" />
                </div>
              </div>
            </div>

            <div
              className="absolute"
              style={{
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -48%)",
                opacity: cryptPhase === "heart" ? 1 : 0,
                animation: cryptPhase === "heart" ? "ckMorphIn 520ms ease-out both" : undefined,
              }}
            >
              <div className="ck-heartFloat" style={{ position: "relative" }}>
                <img
                  src={cryptkeeperPng}
                  alt=""
                  draggable={false}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                  className="ck-heartImg"
                />
                {cryptSparkles.map((s) => (
                  <span
                    key={s.id}
                    className="ck-spark"
                    style={{
                      left: `${s.leftPct}%`,
                      top: `${s.topPct}%`,
                      width: `${s.sizePx}px`,
                      height: `${s.sizePx}px`,
                      opacity: s.opacity,
                      animationDuration: `${s.durationMs}ms`,
                      animationDelay: `${s.delayMs}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div
            className="absolute left-1/2 bottom-14 w-[min(860px,94vw)] -translate-x-1/2"
            style={{
              opacity: cryptPhase === "heart" ? 1 : 0,
              animation: cryptPhase === "heart" ? "ckTextIn 520ms ease-out both" : undefined,
            }}
          >
            <div className="text-center text-sm text-white/80">
              <span className="font-mono tracking-wide">
                Security Audit: Passed. Respect the Guardian Cryptkeeper!
              </span>
            </div>
          </div>
        </div>
      )}

      {lunarOpen && (
        <div
          key={`lunar-${lunarRunId}`}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[999999]"
        >
          <div className="absolute inset-0 bg-black/70" />

          <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
            <div className="flex max-h-[calc(100vh-3rem)] w-[min(1100px,96vw)] flex-col">
              <div className="flex items-center justify-between">
                <div
                  className="rounded border border-white/15 bg-black/40 px-3 py-2"
                  style={{ animation: "lunarBadge 240ms ease-out both" }}
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/75">
                    designer mode
                  </div>
                  <div className="font-mono text-sm text-white/90">
                    {lunarWho === "lunarkatsu" ? "LunarKatsu" : "PrimeSto"} — web design in progress
                  </div>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/60">
                  {LUNAR_BREAKPOINTS[lunarBpIdx]?.name} • {LUNAR_BREAKPOINTS[lunarBpIdx]?.media}
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto">
                <div className="grid grid-cols-12 gap-4 pb-1">
                  <div className="col-span-12 md:col-span-3">
                    <div className="rounded-md border border-white/15 bg-black/35 p-3">
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/60">
                        layers
                      </div>
                      <div className="mt-3 space-y-2 font-mono text-[12px] text-white/75">
                        {["App", "Header", "Hero", "Buttons", "Cards", "Footer"].map((t) => (
                          <div key={t} className="rounded border border-white/10 bg-black/25 px-2 py-1">
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-6">
                    <div className="rounded-md border border-white/15 bg-black/35 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/60">
                          preview
                        </div>
                        <div className="font-mono text-[11px] text-white/55">
                          {LUNAR_BREAKPOINTS[lunarBpIdx]?.widthPx}×{LUNAR_BREAKPOINTS[lunarBpIdx]?.heightPx}
                        </div>
                      </div>

                      <div className="relative mt-3 flex justify-center">
                        <div
                          className="relative overflow-hidden rounded-lg border border-white/15 bg-black/60"
                          style={{
                            width: `${Math.min(860, LUNAR_BREAKPOINTS[lunarBpIdx]?.widthPx || 360)}px`,
                            height: `${Math.min(560, LUNAR_BREAKPOINTS[lunarBpIdx]?.heightPx || 520)}px`,
                            transition: "width 220ms ease, height 220ms ease",
                          }}
                        >
                          <div className="absolute left-0 right-0 top-0 h-9 border-b border-white/10 bg-black/40" />
                          <div className="absolute left-3 top-3 flex gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500/70" />
                            <span className="h-2 w-2 rounded-full bg-amber-500/70" />
                            <span className="h-2 w-2 rounded-full bg-green-500/70" />
                            <span className="sr-only">preview window controls</span>
                          </div>

                          <div className="absolute inset-0" style={{ opacity: 0.12 }}>
                            <div
                              className="absolute top-0 h-full w-10 border-r border-white/10"
                              style={{ left: "50%" }}
                            />
                            <div className="absolute left-0 w-full border-b border-white/10" style={{ top: "50%" }} />
                          </div>

                          <div
                            className="absolute left-0 top-0 h-full w-1 bg-cyan-200/30"
                            style={{ animation: "lunarGuideSweep 1100ms ease-in-out infinite" }}
                          />

                          <div className="absolute left-0 right-0 top-9 bottom-0 p-4">
                            <div className="rounded-md border border-white/10 bg-black/35 p-3">
                              <div className="font-mono text-[12px] uppercase tracking-widest text-white/70">
                                butter launcher
                              </div>
                              <div className="mt-2 h-2 w-24 rounded bg-white/10" />
                              <div className="mt-3 grid grid-cols-2 gap-3">
                                {[1, 2, 3, 4].map((i) => (
                                  <div key={i} className="h-16 rounded border border-white/10 bg-black/25" />
                                ))}
                              </div>
                              <div className="mt-3 flex gap-2">
                                <div className="h-9 flex-1 rounded border border-white/10 bg-black/25" />
                                <div className="h-9 w-24 rounded border border-white/10 bg-white/10" />
                              </div>
                            </div>
                          </div>

                          <div
                            className="absolute left-6 top-16"
                            style={{ animation: "lunarCursor 1200ms ease-in-out infinite" }}
                          >
                            <div className="h-0 w-0 border-l-[10px] border-l-white/80 border-t-[14px] border-t-transparent border-b-[14px] border-b-transparent" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-3">
                    <div className="rounded-md border border-white/15 bg-black/35 p-3">
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/60">
                        inspect
                      </div>
                      <div className="mt-3 max-h-[min(240px,32vh)] overflow-auto rounded border border-white/10 bg-black/30 p-2">
                        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-white/75">
                          {lunarLogs.join("\n")}
                          {"\n"}█
                        </pre>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-white/55">
                          grid
                        </div>
                        <div className="font-mono text-[12px] text-white/80">12 cols</div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-white/55">
                          spacing
                        </div>
                        <div className="font-mono text-[12px] text-white/80">
                          {lunarBpIdx === 0 ? "8px" : lunarBpIdx === 1 ? "12px" : "16px"}
                        </div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-white/55">
                          radius
                        </div>
                        <div className="font-mono text-[12px] text-white/80">
                          {lunarBpIdx === 0 ? "12px" : lunarBpIdx === 1 ? "14px" : "16px"}
                        </div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/25 px-2 py-2">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-white/55">
                          a11y
                        </div>
                        <div className="font-mono text-[12px] text-white/80">focus: ok</div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>

              <div className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-white/55">
                shipping vibes only • responsive, readable, lovable
              </div>
            </div>
          </div>
        </div>
      )}

      {supportTicketOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              setSupportTicketOpen(false);
              setSupportTicketPhase("idle");
              setSupportTicketStatusText("");
              setSupportTicketCode("");
            }}
          />

          <div className="relative w-[min(720px,94vw)] rounded-xl border border-white/10 bg-black/55 backdrop-blur-md shadow-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-extrabold tracking-wider uppercase text-white/85">
                  Support Ticket
                </div>
                <div className="mt-1 text-xs text-white/70">
                  Copy this code and send it to support.
                </div>
              </div>

              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition"
                onClick={() => {
                  setSupportTicketOpen(false);
                  setSupportTicketPhase("idle");
                  setSupportTicketStatusText("");
                  setSupportTicketCode("");
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3">
              <div className="font-mono text-lg text-white tracking-wider select-text break-all">
                {supportTicketCode}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg font-bold text-white bg-linear-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 transition"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(supportTicketCode);
                      setSupportTicketStatusText("Copied. Send it to support.");
                    } catch {
                      setSupportTicketStatusText(
                        "No se pudo copiar automáticamente. Selecciona el código y cópialo manualmente.",
                      );
                    }
                  }}
                >
                  Copy
                </button>

                {supportTicketPhase === "error" ? (
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition"
                    onClick={() => {
                      supportTicketUploadStartedRef.current = false;
                      setSupportTicketPhase("waiting");
                      setSupportTicketStatusText("Retrying…");
                      // Re-trigger polling by flipping the open state.
                      setSupportTicketOpen(false);
                      setTimeout(() => setSupportTicketOpen(true), 0);
                    }}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 text-xs text-white/75">
              {supportTicketStatusText || ""}
            </div>
            {supportTicketPhase === "uploading" ? (
              <div className="mt-2 text-[11px] text-white/55">
                This may take a few seconds.
              </div>
            ) : null}
          </div>
        </div>
      )}

      {ikyOpen && (
        <div
          key={`iky-${ikyRunId}`}
          aria-hidden="true"
          className="fixed inset-0 z-[999999]"
          style={{ pointerEvents: "all" }}
        >
          {/* Hex/asm view */}
          <div
            className="absolute inset-0 bg-black"
            style={{
              opacity: ikyPhase === "glitch" ? 0 : 1,
              transition: "opacity 140ms linear",
            }}
          />

          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              opacity:
                ikyPhase === "hex" || ikyPhase === "freeze" || ikyPhase === "rebuild"
                  ? 1
                  : 0,
              transition: "opacity 160ms linear",
            }}
          >
            <div className="absolute inset-0" style={{ opacity: 0.12 }}>
              <div className="absolute inset-0 iky-scanlines" />
            </div>

            <div
              className="absolute inset-0"
              style={{
                opacity: ikyPhase === "rebuild" ? 0.18 : 1,
                transition: "opacity 200ms ease-in-out",
              }}
            >
              {ikyDrops.map((d) => (
                <div
                  key={d.id}
                  className="absolute top-0 whitespace-pre font-mono text-green-400/90"
                  style={{
                    left: `${d.leftPct}%`,
                    fontSize: `${d.fontSizePx}px`,
                    animation: `ikyRain ${d.durationMs}ms linear ${d.delayMs}ms infinite`,
                  }}
                >
                  {d.text}
                </div>
              ))}
            </div>

            {/* Fast console typing */}
            <div
              className="absolute inset-0 flex items-center justify-center px-4"
              style={{
                opacity: ikyPhase === "hex" || ikyPhase === "freeze" ? 1 : 0,
                transition: "opacity 220ms ease-in-out",
              }}
            >
              <div className="w-[min(820px,94vw)]">
                <div className="rounded-md border border-green-400/30 bg-black/55 p-4">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-green-300/70">
                    raw logic view
                  </div>
                  <div className="mt-3 space-y-2 font-mono text-sm text-green-200">
                    {["Intercepting Packet ID: 0x01", "Decrypting Logic...", "Replicating Server Instance..."]
                      .map((line, idx) => {
                        const baseDelay = IKY_GLITCH_MS + 900 + idx * 900;
                        return (
                          <div
                            key={line}
                            className="iky-type"
                            style={{
                              animationDelay: `${baseDelay}ms`,
                            }}
                          >
                            <span className="text-green-400">&gt; </span>
                            {line}
                            {idx === 2 && ikyPhase === "hex" && (
                              <span className="iky-caret">█</span>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  <div className="mt-4 rounded border border-green-400/20 bg-black/35 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-green-300/90">
                      {ikyLiveLog.join("\n")}
                      {ikyPhase === "hex" ? "\n█" : ""}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Freeze + stamp */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                opacity: ikyPhase === "freeze" ? 1 : 0,
                transition: "opacity 120ms linear",
              }}
            >
              <div className="absolute inset-0 bg-black/30" />
              <div
                className="select-none"
                style={{ animation: "ikyStampPop 340ms ease-out both" }}
              >
                <div className="-rotate-6 rounded border-4 border-green-200/80 bg-black/40 px-8 py-5">
                  <div className="font-mono text-3xl font-bold tracking-[0.26em] text-green-100">
                    LOGIC REPLICATED
                  </div>
                </div>
              </div>
            </div>

            {/* Rebuild tiles */}
            {ikyPhase === "rebuild" && (
              <div className="absolute inset-0">
                {ikyTiles.map((t) => (
                  <div
                    key={t.id}
                    className="absolute bg-black/95 border border-green-500/20"
                    style={{
                      left: `${t.leftPct}%`,
                      top: `${t.topPct}%`,
                      width: `${t.widthPct}%`,
                      height: `${t.heightPct}%`,
                      animation: `ikyTileOut 520ms ease-out ${t.delayMs}ms both`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Initial UI glitch overlay */}
          <div
            className="absolute inset-0"
            style={{
              opacity: ikyPhase === "glitch" ? 1 : 0,
              transition: "opacity 120ms linear",
            }}
          >
            <div className="absolute inset-0 bg-black/35" />
            <div className="absolute inset-0 iky-glitch-bars" />
          </div>
        </div>
      )}

      {simonOpen && (
        <img
          key={`simon-${simonRunId}`}
          src={simonPng}
          alt=""
          draggable={false}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
          style={{
            position: "fixed",
            left: "50%",
            ...(simonDirection === "up" ? { bottom: 0 } : { top: 0 }),
            zIndex: 999999,
            pointerEvents: "none",
            animation: `${
              simonDirection === "up" ? "simonSlideUp" : "simonSlideDown"
            } ${SIMON_EASTER_MS}ms linear forwards`,
            maxWidth: "80vw",
            maxHeight: "80vh",
          }}
        />
      )}
      {magdOpen && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[999999] flex items-center justify-center"
        >
          <img
            key={magdRunId}
            src={magdPng}
            alt=""
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
            className="magd-easter max-w-[78vw] max-h-[78vh] select-none"
          />
        </div>
      )}

      {nexusOpen && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[999999] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/70" />

          <img
            src={nexusPng}
            alt=""
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
            className="absolute left-1/2 top-1/2 max-h-[85vh] max-w-[85vw] opacity-25"
            style={{
              animation: "nexusDance 900ms ease-in-out infinite",
              filter: "contrast(1.05) saturate(1.05)",
            }}
          />

          <div className="relative w-[min(560px,92vw)] px-6 py-5">
            <div className="rounded-md border border-white/20 bg-black/60 px-5 py-4">
              <div className="font-mono text-sm tracking-wide text-white/90">
                Patching Server...
              </div>

              <div className="mt-4">
                <div className="relative overflow-hidden rounded border border-white/30 bg-black/40">
                  <div
                    className="h-5 bg-green-500/70"
                    style={{ width: `${Math.max(0, Math.min(100, nexusProgress))}%` }}
                  />
                  <div
                    className={
                      "nexus-doors absolute inset-0 flex " +
                      (nexusStage === "deployed" ? "open" : "")
                    }
                  >
                    <div className="nexus-door left w-1/2 border-r border-white/10 bg-black/80 transition-transform duration-500" />
                    <div className="nexus-door right w-1/2 bg-black/80 transition-transform duration-500" />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-white/60">
                    nexus
                  </div>
                  <div className="font-mono text-[11px] text-white/80">
                    {nexusProgress}%
                  </div>
                </div>
              </div>
            </div>

            {nexusStage === "deployed" && (
              <>
                <div className="pointer-events-none absolute inset-0">
                  {nexusConfetti.map((p) => (
                    <span
                      key={p.id}
                      className={
                        "absolute top-0 rounded-sm opacity-90 " +
                        p.colorClass
                      }
                      style={
                        {
                        left: `${p.leftPct}%`,
                        width: `${p.sizePx}px`,
                        height: `${Math.max(8, p.sizePx * 1.6)}px`,
                        animation: `nexusConfettiFall ${p.durationMs}ms linear ${p.delayMs}ms both`,
                        transform: `rotate(${p.tiltDeg}deg)`,
                        ["--tilt" as any]: `${p.tiltDeg}deg`,
                      } as React.CSSProperties
                      }
                    />
                  ))}
                </div>

                <div
                  className="absolute left-1/2 top-1/2 select-none"
                  style={{ animation: "nexusStampPop 420ms ease-out both" }}
                >
                  <div className="relative -rotate-12 rounded border-4 border-white/80 bg-black/40 px-8 py-4">
                    <div className="absolute left-0 top-0 h-1 w-full bg-blue-600" />
                    <div className="absolute bottom-0 left-0 h-1 w-full bg-red-600" />
                    <div className="font-mono text-3xl font-bold tracking-widest text-white">
                      DEPLOYED
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {zyleOpen && (
        <div
          key={`zyle-${zyleRunId}`}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[999999]"
          style={{ animation: `zyleBlueprintFade ${ZYLE_MS}ms ease-in-out both` }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: "rgba(2, 6, 23, 0.88)",
              backgroundImage:
                "linear-gradient(rgba(34,211,238,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.14) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              animation: `zyleGridDrift ${ZYLE_MS}ms linear both`,
            }}
          />

          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 20%, rgba(34,211,238,0.18), transparent 45%), radial-gradient(circle at 70% 70%, rgba(34,211,238,0.12), transparent 50%)",
              animation: "zyleSketchFlicker 1200ms steps(2, end) infinite",
            }}
          />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-[min(980px,92vw)]">
              <div className="rounded-md border border-cyan-200/40 bg-black/20 p-4">
                <div
                  className="zyle-part mb-3 h-10 rounded border border-cyan-200/40"
                  style={{ animationDelay: "120ms" }}
                >
                  <div className="zyle-draw" style={{ animationDelay: "120ms" }} />
                  <div className="absolute inset-0 flex items-center px-3">
                    <div className="font-mono text-[11px] uppercase tracking-widest text-cyan-200/70">
                      launcher blueprint
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Play", delay: 520 },
                    { label: "Mods", delay: 760 },
                    { label: "Install", delay: 1000 },
                    { label: "Select version", delay: 1240 },
                    { label: "Host a a Server", delay: 1560 },
                    { label: "Wiki", delay: 1820 },
                    { label: "Friends", delay: 2080 },
                    { label: "Servers", delay: 2340 },
                  ].map((b) => (
                    <div
                      key={b.label}
                      className="zyle-part h-10 rounded border border-cyan-200/40"
                      style={{ animationDelay: `${b.delay}ms` }}
                    >
                      <div className="zyle-draw" style={{ animationDelay: `${b.delay}ms` }} />
                      <div className="absolute inset-0 flex items-center justify-center px-2">
                        <div className="font-mono text-[11px] uppercase tracking-widest text-cyan-200/80">
                          {b.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-4">
                  <div className="w-[280px] shrink-0">
                    <div
                      className="zyle-part h-32 rounded border border-cyan-200/40"
                      style={{ animationDelay: "2700ms" }}
                    >
                      <div className="zyle-draw" style={{ animationDelay: "2700ms" }} />
                    </div>
                    <div
                      className="zyle-part mt-4 h-56 rounded border border-cyan-200/40"
                      style={{ animationDelay: "3050ms" }}
                    >
                      <div className="zyle-draw" style={{ animationDelay: "3050ms" }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div
                      className="zyle-part h-44 rounded border border-cyan-200/40"
                      style={{ animationDelay: "2850ms" }}
                    >
                      <div className="zyle-draw" style={{ animationDelay: "2850ms" }} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div
                        className="zyle-part h-36 rounded border border-cyan-200/40"
                        style={{ animationDelay: "3400ms" }}
                      >
                        <div className="zyle-draw" style={{ animationDelay: "3400ms" }} />
                      </div>
                      <div
                        className="zyle-part h-36 rounded border border-cyan-200/40"
                        style={{ animationDelay: "3700ms" }}
                      >
                        <div className="zyle-draw" style={{ animationDelay: "3700ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="absolute left-0 right-0 top-0 h-16"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, transparent, rgba(34,211,238,0.20), transparent)",
                  animation: `zyleScanline ${ZYLE_MS}ms linear both`,
                }}
              />

              <div className="mt-4 flex items-center justify-between">
                <div className="font-mono text-[11px] uppercase tracking-widest text-cyan-200/70">
                  wireframe / blueprint view
                </div>
                <div
                  className="font-mono text-[12px] uppercase tracking-[0.22em] text-cyan-200/80"
                  style={{
                    opacity: 0,
                    animation: "zyleApprovedIn 380ms ease-out both",
                    animationDelay: "4600ms",
                  }}
                >
                  concept approved
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {fitzOpen && (
        <div
          key={`fitz-${fitzRunId}`}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[999999]"
        >
          <div className="absolute inset-0 bg-black/90" />

          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              animation: `fitzRainDim 800ms ease-in-out ${Math.floor(
                FITZXEL_MS * 0.62,
              )}ms both`,
            }}
          >
            {fitzDrops.map((d) => (
              <div
                key={d.id}
                className="absolute top-0 whitespace-pre font-mono text-green-400/90"
                style={{
                  left: `${d.leftPct}%`,
                  fontSize: `${d.fontSizePx}px`,
                  animation: `fitzRain ${d.durationMs}ms linear ${d.delayMs}ms infinite`,
                }}
              >
                {d.text}
              </div>
            ))}
          </div>

          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="w-[min(1100px,96vw)] max-h-[86vh]">
              <div className="rounded-md border border-green-400/30 bg-black/40 p-4">
                <pre
                  className="whitespace-pre font-mono text-[7px] leading-[1.05] text-green-300 sm:text-[8px] md:text-[9px] lg:text-[10px]"
                  style={{
                    opacity: 0,
                    animation: `fitzAsciiIn 900ms ease-out ${Math.floor(
                      FITZXEL_MS * 0.58,
                    )}ms both`,
                  }}
                >
                  {FITZXEL_ASCII}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
      {launcherUpdateInfo && (
        <LauncherUpdateModal
          open={launcherUpdateOpen}
          info={launcherUpdateInfo}
          onClose={(dontRemindAgain) => {
            if (dontRemindAgain) {
              try {
                localStorage.setItem(SUPPRESS_KEY, launcherUpdateInfo.latestVersion);
              } catch {
              }
            }
            setLauncherUpdateOpen(false);
          }}
          onUpdate={async (dontRemindAgain) => {
            if (dontRemindAgain) {
              try {
                localStorage.setItem(SUPPRESS_KEY, launcherUpdateInfo.latestVersion);
              } catch {
              }
            }

            const url = "https://butterlauncher.tech";
            try {
              await (window.config as any).openExternal?.(url);
            } catch {
            }
            setLauncherUpdateOpen(false);
          }}
        />
      )}
      <div
        ref={appRootRef}
        className={
          "w-full h-full min-h-screen flex flex-col " +
          (ikyOpen && ikyPhase === "glitch" ? "iky-glitch" : "")
        }
        style={{
          position: "relative",
          opacity:
            zyleOpen ||
            (ikyOpen && (ikyPhase === "hex" || ikyPhase === "freeze"))
              ? 0
              : 1,
          transition:
            ikyOpen && ikyPhase === "rebuild"
              ? "opacity 0ms linear"
              : "opacity 850ms ease-in-out",
        }}
      >
        {showLoader && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10000,
              pointerEvents: "all",
              opacity: fade ? 0 : 1,
              transition: "opacity 1s",
            }}
          >
            <Loader />
          </div>
        )}
        {!showLoader &&
          (ready ? (
            username ? (
              <Launcher
                onLogout={() => {
                  setUsername(null);
                  try {
                    void window.config.premiumLogout?.();
                  } catch {
                    // ignore
                  }
                  try {
                    localStorage.removeItem("accountType");
                  } catch {
                    // ignore
                  }
                }}
              />
            ) : (
              <Login onLogin={(username) => setUsername(username)} />
            )
          ) : null)}
      </div>
    </div>
  );
}