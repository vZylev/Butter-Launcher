import butterLogo from "../assets/butter-logo.png";
import React from "react";

const Loader: React.FC = () => (
  <div
    style={{
      // @ts-ignore
      appRegion: "drag",
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: `#181c23`,
      flexDirection: "column",
    }}
  >
    <img
      src={butterLogo}
      alt="Butter Logo"
      style={{
        width: 280,
        marginBottom: 32,
        userSelect: "none",
        pointerEvents: "none",
      }}
      draggable={false}
    />
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle
        cx="32"
        cy="32"
        r="26"
        stroke="#23293a"
        strokeWidth="8"
        fill="none"
        opacity="0.85"
      />
      <circle
        cx="32"
        cy="32"
        r="26"
        stroke="#4a90e2"
        strokeWidth="8"
        fill="none"
        strokeDasharray="40 120"
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 32 32"
          to="360 32 32"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
    <span
      style={{
        color: "#d1d5db",
        fontSize: 18,
        fontWeight: 500,
        textShadow: "0 1px 4px #000a",
        marginTop: 18,
      }}
    >
      Initializing Butter Launcher
    </span>
  </div>
);

export default Loader;
