import { createContext, useContext, useState, useEffect } from "react";

interface UserContextType {
  ready: boolean;
  username: string | null;
  setUsername: (username: string | null) => void;
}

export const UserContext = createContext<UserContextType | null>(null);

export const UserContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  const safeLocalStorage = {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore
      }
    },
    removeItem: (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };

  useEffect(() => {
    const storedUsername = safeLocalStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }
    const timeout = setTimeout(() => {
      setReady(true);
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (username) {
      safeLocalStorage.setItem("username", username);
    } else {
      safeLocalStorage.removeItem("username");
    }
  }, [username]);

  return (
    <UserContext.Provider value={{ ready, username, setUsername }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (!context)
    throw new Error("useUserContext must be used within a UserContextProvider");
  return context;
};
