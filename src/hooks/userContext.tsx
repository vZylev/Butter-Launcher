import { createContext, useContext, useState, useEffect } from "react";
import { StorageService } from "../services/StorageService";

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

  useEffect(() => {
    const storedUsername = StorageService.get("username");
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
      StorageService.set("username", username);
    } else {
      StorageService.remove("username");
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
