import butterLogo from "../assets/butter-logo.png";
import React from "react";

const Loader: React.FC = () => (
  <div style={styles.wrapper}>
    <div style={styles.logoWrapper}>
      <img
        src={butterLogo}
        alt="Butter Logo"
        style={styles.logo}
        draggable={false}
      />
    </div>

    <div style={styles.waveLoader}>
      <span />
      <span />
      <span />
    </div>

    <span style={styles.text}>
      Initializing Butter Launcher
      <span className="dots">...</span>
    </span>

    <style>
      {`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes shine {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }

        @keyframes wave {
          0% { transform: scale(0.6); opacity: 0.4; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.6); opacity: 0.4; }
        }

        .dots::after {
          content: "";
          animation: dots 1.5s infinite;
        }

        @keyframes dots {
          0% { content: ""; }
          33% { content: "."; }
          66% { content: ".."; }
          100% { content: "..."; }
        }
      `}
    </style>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    // @ts-ignore
    appRegion: "drag",
    position: "fixed",
    inset: 0,
    background: "#181c23",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },

  logoWrapper: {
    position: "relative",
    animation: "float 3s ease-in-out infinite",
    marginBottom: 32,
  },

  logo: {
    width: 260,
    userSelect: "none",
    pointerEvents: "none",
  },

  waveLoader: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
  },

  text: {
    color: "#d1d5db",
    fontSize: 17,
    letterSpacing: 0.4,
    opacity: 0.9,
  },
};

export default Loader;
