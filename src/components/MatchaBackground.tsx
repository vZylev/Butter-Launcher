import { useEffect, useRef } from "react";

const API_BASE = "https://butter.lat";
const LS_TOKEN = "matcha:token";

const readToken = (): string | null => {
  try {
    const t = (localStorage.getItem(LS_TOKEN) || "").trim();
    return t || null;
  } catch {
    return null;
  }
};

const syncTokenToMain = (token: string | null) => {
  try {
    const ipc = (window as any)?.ipcRenderer;
    if (ipc && typeof ipc.send === "function") ipc.send("matcha:token", { token });
  } catch {
    // ignore
  }
};

const postHeartbeat = async (token: string) => {
  try {
    const ipc = (window as any)?.ipcRenderer;
    if (!ipc || typeof ipc.invoke !== "function") return;

    await ipc.invoke("fetch:json", `${API_BASE}/api/matcha/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ state: "online" }),
    });
  } catch {
    // ignore
  }
};

const postPresenceEvent = async (
  token: string,
  event: string,
  server?: string,
) => {
  try {
    const ipc = (window as any)?.ipcRenderer;
    if (!ipc || typeof ipc.invoke !== "function") return;

    const payload: Record<string, string> = { event };
    const serverClean = String(server || "").trim();
    if (serverClean) payload.server = serverClean;

    await ipc.invoke("fetch:json", `${API_BASE}/api/matcha/presence/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
};

export default function MatchaBackground() {
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const ipc = (window as any)?.ipcRenderer;
    if (!ipc || typeof ipc.on !== "function") return;

    const onPresence = (_evt: any, payload: any) => {
      const event = String(payload?.event || "").trim();
      const server = String(payload?.server || "").trim();
      if (!event) return;
      const token = readToken();
      if (!token) return;
      void postPresenceEvent(token, event, server);
    };

    ipc.on("matcha:presence", onPresence);
    return () => {
      try {
        if (typeof ipc.off === "function") ipc.off("matcha:presence", onPresence);
        else if (typeof ipc.removeListener === "function")
          ipc.removeListener("matcha:presence", onPresence);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    let closed = false;

    const tick = async () => {
      if (closed) return;

      const token = readToken();
      if (token !== lastTokenRef.current) {
        lastTokenRef.current = token;
        syncTokenToMain(token);
      }

      if (!token) return;
      await postHeartbeat(token);
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 60_000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
