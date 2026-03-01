import { useEffect, useRef, useState } from "react";

const WS_URL = "wss://butter.lat/api/matcha/ws";
const EMOJIS = ["😀", "😂", "🔥", "❤️", "👍", "😎", "😭", "👀"];

// Badges must be server-driven (admin/dev panel), not hardcoded client-side.

type Message = {
  from: string;
  to: string;
  msg: string;
  time: number;
};

export default function Chat({
  user,
  onClose,
}: {
  user: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [currentChat, setCurrentChat] = useState("global");
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  const ws = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
    const storageKey = `butter-chat-${user}-${currentChat}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
      setMessages([]);
    }
  }, [currentChat, user]);

  useEffect(() => {
    if (messages.length > 0) {
      const storageKey = `butter-chat-${user}-${currentChat}`;
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, currentChat, user]);

  useEffect(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({ type: "join", user }));
    };

    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === "users") {
        setOnlineUsers(data.users.filter((u: string) => u !== user));
        return;
      }

      if (data.type === "message") {
        const isGlobal = data.to === "global" && currentChat === "global";
        const isTargetedDM = (data.to === user && data.from === currentChat) || 
                             (data.from === user && data.to === currentChat);

        if (isGlobal || isTargetedDM) {
          setMessages((p) => [...p, data]);
        } else {
          const backgroundKey = `butter-chat-${user}-${data.to === "global" ? "global" : data.from}`;
          const existing = JSON.parse(localStorage.getItem(backgroundKey) || "[]");
          localStorage.setItem(backgroundKey, JSON.stringify([...existing, data]));
        }
      }

      if (data.type === "typing" && data.from === currentChat) {
        setTypingUser(data.from);
        setTimeout(() => setTypingUser(null), 1500);
      }
    };

    return () => ws.current?.close();
  }, [user, currentChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  const sendMessage = () => {
    if (!text.trim()) return;
    
    const msgData = {
      type: "message",
      from: user,
      to: currentChat,
      msg: text,
      time: Date.now()
    };

    ws.current?.send(JSON.stringify(msgData));
    setText("");
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
      <div className="w-[720px] h-[480px] bg-[#0b0f1a] rounded-xl shadow-xl flex text-white overflow-hidden border border-white/10">
        
        <div className="w-52 bg-[#0f172a] p-3 border-r border-white/10 flex flex-col">
          <div className="font-bold text-blue-400 mb-4 px-2 tracking-widest text-xs uppercase">Canales</div>
          <button
            onClick={() => setCurrentChat("global")}
            className={`w-full px-3 py-2 rounded-lg mb-1 text-left transition-all ${
              currentChat === "global" ? "bg-blue-600 shadow-lg shadow-blue-900/20" : "hover:bg-white/5 text-gray-400"
            }`}
          >
            🌍 Global Chat
          </button>

          <div className="font-bold text-gray-500 mt-6 mb-2 px-2 text-[10px] uppercase">Mensajes Directos</div>
          <div className="flex-1 overflow-y-auto">
            {onlineUsers.map((u) => (
              <button
                key={u}
                onClick={() => setCurrentChat(u)}
                className={`w-full px-3 py-2 rounded-lg mb-1 flex items-center gap-2 text-left transition-all ${
                  currentChat === u ? "bg-blue-600" : "hover:bg-white/5 text-gray-400"
                }`}
              >
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="truncate">{u}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#0b0f1a]">
          <div className="px-4 py-3 bg-[#111827]/50 backdrop-blur-md border-b border-white/10 flex justify-between items-center">
            <div>
              <div className="font-bold flex items-center gap-2">
                {currentChat === "global" ? "🌍 Chat Global" : `👤 ${currentChat}`}
              </div>
              <div className="text-[10px] text-green-500">En línea</div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl">×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => {
              const isMe = m.from === user;

              return (
                <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`group max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && (
                      <div className="flex items-center gap-1.5 mb-1 ml-1">
                        <span className="text-xs font-bold text-blue-400">{m.from}</span>
                      </div>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm shadow-sm ${
                      isMe ? "bg-blue-600 rounded-tr-none" : "bg-white/10 rounded-tl-none text-gray-200"
                    }`}>
                      {m.msg}
                    </div>
                  </div>
                </div>
              );
            })}
            {typingUser && <div className="text-[10px] italic text-gray-500 animate-bounce">{typingUser} está escribiendo...</div>}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 bg-[#0f172a]/50 border-t border-white/10">
            {showEmojis && (
              <div className="flex gap-2 p-2 mb-2 bg-white/5 rounded-lg border border-white/5 overflow-x-auto">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setText(t => t + e)} className="hover:scale-125 transition-transform">{e}</button>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowEmojis(!showEmojis)} className="text-xl grayscale hover:grayscale-0 transition-all">😊</button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all"
                placeholder={`Escribe a ${currentChat}...`}
              />
              <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95">
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}