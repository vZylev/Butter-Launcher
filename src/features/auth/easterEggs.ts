/**
 * Easter egg trigger and rendering logic.
 *
 * Extracted from App.tsx to keep the main component focused on
 * application flow rather than surprise mechanics.
 */

import { useRef, useCallback } from "react";

// ── Assets (lazy) ─────────────────────────────────────────────────

import magdPng from "../../assets/images/magd.png";
import magdOgg from "../../assets/sounds/magd.ogg";
import simonPng from "../../assets/images/simon.jpg";
import simonOgg from "../../assets/sounds/simon.ogg";
import nexusPng from "../../assets/images/nexus.png";
import nexusOgg from "../../assets/sounds/nexus.ogg";
import zyleOgg from "../../assets/sounds/zyle.ogg";
import fitzxelOgg from "../../assets/sounds/fitzxel.ogg";
import primePng from "../../assets/images/prime.png";
import kaizorakdevOgg from "../../assets/sounds/kaizorakdev.ogg";
import ikymaxOgg from "../../assets/sounds/ikymax.ogg";
import cryptkeeperPng from "../../assets/images/cryptkeeper.png";
import nickJpg from "../../assets/images/nick.jpg";

// ── Constants ──────────────────────────────────────────────────

export const MAGD_EASTER_KEY = "magdmagdmydear";
export const MAGD_EASTER_MS = 6000;
export const SIMON_EASTER_KEY = "simon";
export const SIMON_EASTER_MS = 16000;
export const NEXUS_EASTER_KEY = "nexusatko";
export const NEXUS_TOTAL_MS = 9000;
export const NEXUS_DEPLOY_MS = 1600;
export const NEXUS_PATCH_MS = Math.max(1000, NEXUS_TOTAL_MS - NEXUS_DEPLOY_MS);
export const NEXUS_CONFETTI_COUNT = 90;
export const ZYLE_EASTER_KEY = "zyle";
export const ZYLE_MS = 6000;
export const FITZXEL_EASTER_KEY = "fitzxel";
export const FITZXEL_MS = 6000;
export const PRIME_EASTER_KEY = "primeisonline";
export const PRIME_MS = 15000;
export const KAIZ_EASTER_KEY = "kaizorakdev";
export const KAIZ_MS = 10000;
export const IKY_EASTER_KEY = "ikymax";
export const IKY_MS = 15000;
export const IKY_GLITCH_MS = 1200;
export const IKY_FREEZE_AT_MS = 12600;
export const IKY_REBUILD_AT_MS = 13800;
export const CRYPTKEEPER_EASTER_KEY = "cryptkeeper";
export const NICK_EASTER_KEY = "nick";
export const CRYPT_MS = 9000;
export const CRYPT_WARM_AT_MS = 1700;
export const CRYPT_HEART_AT_MS = 3000;
export const LUNARKATSU_EASTER_KEY = "lunarkatsu";
export const PRIMESTO_EASTER_KEY = "primesto";
export const LUNAR_MS = 10000;
export const SUPPORT_TICKET_EASTER_KEY = "supportticket";

// All known easter egg keys for the keydown buffer matching.
export const ALL_EASTER_KEYS = [
  MAGD_EASTER_KEY,
  SIMON_EASTER_KEY,
  NEXUS_EASTER_KEY,
  ZYLE_EASTER_KEY,
  FITZXEL_EASTER_KEY,
  PRIME_EASTER_KEY,
  KAIZ_EASTER_KEY,
  IKY_EASTER_KEY,
  CRYPTKEEPER_EASTER_KEY,
  NICK_EASTER_KEY,
  LUNARKATSU_EASTER_KEY,
  PRIMESTO_EASTER_KEY,
  SUPPORT_TICKET_EASTER_KEY,
] as const;

// Re-export asset paths so App.tsx doesn't import them directly.
export const EASTER_ASSETS = {
  magdPng,
  magdOgg,
  simonPng,
  simonOgg,
  nexusPng,
  nexusOgg,
  zyleOgg,
  fitzxelOgg,
  primePng,
  kaizorakdevOgg,
  ikymaxOgg,
  cryptkeeperPng,
  nickJpg,
} as const;

// ── Types ──────────────────────────────────────────────────────

export type ConfettiPiece = {
  id: number;
  leftPct: number;
  sizePx: number;
  tiltDeg: number;
  delayMs: number;
  durationMs: number;
  colorClass: string;
};

export type MatrixDrop = {
  id: number;
  leftPct: number;
  delayMs: number;
  durationMs: number;
  fontSizePx: number;
  text: string;
};

export type IkyTile = {
  id: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  delayMs: number;
};

export type CryptSparkle = {
  id: number;
  leftPct: number;
  topPct: number;
  sizePx: number;
  delayMs: number;
  durationMs: number;
  opacity: number;
};

export type LunarBreakpoint = {
  name: string;
  widthPx: number;
  heightPx: number;
  media: string;
};

export const LUNAR_BREAKPOINTS: LunarBreakpoint[] = [
  { name: "mobile", widthPx: 360, heightPx: 640, media: "(max-width: 640px)" },
  { name: "tablet", widthPx: 768, heightPx: 560, media: "(min-width: 768px)" },
  { name: "desktop", widthPx: 1100, heightPx: 600, media: "(min-width: 1024px)" },
];

export const FITZXEL_ASCII = String.raw`
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

/**
 * Hook that encapsulates the key-buffer easter egg detection.
 *
 * Returns `{ activeEgg, trigger }` — `activeEgg` is the currently
 * matched key (or null), and `trigger(key)` can be called externally.
 *
 * The actual *rendering* of each easter egg still happens in App.tsx
 * using the existing state variables; this hook only handles detection
 * so the raw keydown buffer isn't polluting the component.
 */
export function useEasterEggDetector() {
  const bufferRef = useRef("");
  const maxLen = Math.max(...ALL_EASTER_KEYS.map((k) => k.length));

  const detect = useCallback(
    (char: string): string | null => {
      bufferRef.current = (bufferRef.current + char).slice(-maxLen);
      const buf = bufferRef.current.toLowerCase();
      for (const key of ALL_EASTER_KEYS) {
        if (buf.endsWith(key)) {
          bufferRef.current = "";
          return key;
        }
      }
      return null;
    },
    [maxLen],
  );

  return { detect, resetBuffer: () => { bufferRef.current = ""; } };
}
