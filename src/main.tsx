import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import "./i18n";

// Entry point: one render call, infinite consequences.

import { GameContextProvider } from "./hooks/gameContext";
import { UserContextProvider } from "./hooks/userContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GameContextProvider>
      <UserContextProvider>
        <App />
      </UserContextProvider>
    </GameContextProvider>
  </React.StrictMode>
);
