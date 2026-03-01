import butterLogo from "../assets/butter-logo.png";
import butterBg from "../assets/butter-bg.png";
import butterLauncherOgg from "../assets/butterlauncher.ogg";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type GlobalStartupSoundState = {
  audio: HTMLAudioElement | null;
  stop: (() => void) | null;
};

const getGlobalStartupSoundState = (): GlobalStartupSoundState => {
  const w = window as any;
  if (!w.__butter_global_startup_sound) {
    w.__butter_global_startup_sound = { audio: null, stop: null } as GlobalStartupSoundState;
  }
  return w.__butter_global_startup_sound as GlobalStartupSoundState;
};

const stopGlobalStartupSound = () => {
  const g = getGlobalStartupSoundState();
  try {
    g.stop?.();
  } catch {
    // ignore
  }
  g.stop = null;

  const a = g.audio;
  g.audio = null;
  if (a) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      // ignore
    }
  }
};

const Loader: React.FC = () => {
  const { t } = useTranslation();
  const [beat, setBeat] = useState(0);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let active = true;
    stoppedRef.current = false;
    let cleanup: (() => void) | null = null;

    const startAudio = (opts?: { markFirstRunPlayed?: boolean }) => {
      // Ensure we never overlap (StrictMode/HMR can cause double effect runs).
      stopGlobalStartupSound();

      const audio = new Audio(butterLauncherOgg);
      audio.volume = 0.95;
      audioRef.current = audio;

      // Track globally so other mounts can stop it.
      {
        const g = getGlobalStartupSoundState();
        g.audio = audio;
      }

      let audioStartedAt = 0;

      let ctx: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;

      const setupAnalyser = () => {
        try {
          ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.85;

          const source = ctx.createMediaElementSource(audio);
          source.connect(analyser);
          analyser.connect(ctx.destination);

          ctxRef.current = ctx;
          analyserRef.current = analyser;
          dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        } catch {
          ctx = null;
          analyser = null;
        }
      };

      setupAnalyser();

      const tick = () => {
        if (stoppedRef.current) return;

        const a = analyserRef.current;
        const buf = dataRef.current;
        if (a && buf) {
          try {
            a.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length); // ~0..1
            const v = Math.max(0, Math.min(1, (rms - 0.02) * 7.5));
            setBeat((prev) => prev * 0.55 + v * 0.45);
          } catch {
            // ignore
          }
        }

        rafRef.current = window.requestAnimationFrame(tick);
      };

      rafRef.current = window.requestAnimationFrame(tick);

      try {
        const p = audio.play();
        audioStartedAt = performance.now();
        if (opts?.markFirstRunPlayed && p && typeof (p as any).then === "function") {
          (p as any)
            .then(() => {
              try {
                void window.config.startupSoundMarkFirstRunPlayed();
              } catch {
                // ignore
              }
            })
            .catch(() => {
              // If autoplay is blocked, keep pending so we can try next time.
            });
        }
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {
            // ignore (autoplay blocked, missing file, etc.)
          });
        }

        void (ctx as any)?.resume?.().catch?.(() => {
          // ignore
        });
      } catch {
        // ignore
      }

      return () => {
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        const el = audioRef.current;
        audioRef.current = null;
        if (el) {
          const playedMs = audioStartedAt ? performance.now() - audioStartedAt : 0;
          // In dev (React StrictMode) effects can mount/unmount very quickly.
          // If we fade out here, it can overlap with a second mount starting audio,
          // making it sound like it plays twice. For very short plays, stop immediately.
          if (playedMs > 0 && playedMs < 900) {
            try {
              el.pause();
              el.currentTime = 0;
            } catch {
              // ignore
            }
          } else {
            const start = performance.now();
            const from = el.volume;
            const fadeMs = 260;
            const fade = (ts: number) => {
              const k = Math.min(1, (ts - start) / fadeMs);
              try {
                el.volume = from * (1 - k);
              } catch {
                // ignore
              }
              if (k < 1) {
                window.requestAnimationFrame(fade);
              } else {
                try {
                  el.pause();
                  el.currentTime = 0;
                } catch {
                  // ignore
                }
              }
            };
            window.requestAnimationFrame(fade);
          }
        }

        try {
          analyserRef.current?.disconnect();
        } catch {
          // ignore
        }
        analyserRef.current = null;
        dataRef.current = null;

        try {
          ctxRef.current?.close?.();
        } catch {
          // ignore
        }
        ctxRef.current = null;

        // Clear global if it's still pointing to us.
        try {
          const g = getGlobalStartupSoundState();
          if (g.audio === audio) {
            g.audio = null;
            g.stop = null;
          }
        } catch {
          // ignore
        }
      };
    };

    void (async () => {
      let allowSound = false;
      let markFirstRunPlayed = false;

      try {
        const res = await window.config.startupSoundGet();
        if (res.ok) {
          // If enabled in config, always play.
          // If settings file didn't exist (or was recreated), play once.
          allowSound = !!res.playstartupsound || !!res.firstRunStartupSoundPending;
          markFirstRunPlayed = !res.playstartupsound && !!res.firstRunStartupSoundPending;
        } else {
          // If we can't read settings, err on the side of the first-run experience.
          allowSound = true;
        }
      } catch {
        allowSound = true;
      }

      if (!active || stoppedRef.current) return;

      if (!allowSound) {
        setBeat(0);
        return;
      }

      // If something is already playing (from a double effect run), don't start again.
      try {
        const g = getGlobalStartupSoundState();
        if (g.audio && !g.audio.paused) return;
      } catch {
        // ignore
      }

      cleanup = startAudio({ markFirstRunPlayed });

      try {
        const g = getGlobalStartupSoundState();
        g.stop = cleanup;
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
      stoppedRef.current = true;
      try {
        cleanup?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return (
    <div
      className="splash-root fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        // @ts-ignore (electron app-region)
        appRegion: "drag",
        // Provide a simple 0..1 intensity to CSS
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ["--splash-beat" as any]: String(beat.toFixed(3)),
      }}
    >
      <div aria-hidden="true" className="absolute inset-0">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: `url(${butterBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(1px)",
          }}
        />
        <div className="splash-vignette absolute inset-0" />
        <div className="splash-aurora absolute inset-0" />
      </div>

      <div className="relative w-[min(520px,86vw)] px-6">
        <div className="relative mx-auto w-[240px] h-[240px]">
          <div className="splash-ring absolute inset-0 rounded-full" />
          <div className="splash-ring2 absolute inset-0 rounded-full" />
          <div className="splash-glow absolute inset-0 rounded-full" />

          <div className="splash-logo absolute inset-0 flex items-center justify-center">
            <img
              src={butterLogo}
              alt={t("splash.logoAlt")}
              draggable={false}
              className="w-[220px] select-none pointer-events-none"
            />
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="splash-title text-2xl font-extrabold tracking-wider uppercase">
            {t("splash.title")}
          </div>
          <div className="mt-2 text-sm font-semibold text-gray-200/90">
            {t("splash.initializing")}
          </div>
        </div>

        <div className="mt-6">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="splash-bar h-full rounded-full" />
          </div>
          <div className="mt-2 text-center text-xs font-semibold text-gray-300/80">
            {t("splash.preparing")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Loader;
