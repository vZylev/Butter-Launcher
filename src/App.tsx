import { useUserContext } from "./hooks/userContext";
import Launcher from "./components/Launcher";
import Login from "./components/Login";
import Loader from "./components/Loader";
import { useState, useEffect } from "react";

export default function App() {
  const { ready, username, setUsername } = useUserContext();
  const [showLoader, setShowLoader] = useState(true);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    window.ipcRenderer.send("ready", {
      enableRPC: !!window.localStorage.getItem("enableRPC"),
    });

    if (ready) {
      setFade(true);
      const timeout = setTimeout(() => setShowLoader(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [ready]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        className="w-full h-full min-h-screen flex flex-col"
        style={{ position: "relative" }}
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
              <Launcher onLogout={() => setUsername(null)} />
            ) : (
              <Login onLogin={(username) => setUsername(username)} />
            )
          ) : null)}
      </div>
    </div>
  );
}
