import React, { useEffect, useMemo, useRef, useState } from "react";
import butterLoginBg from "../assets/butter-login.jpeg";
import butterLogo from "../assets/butter-logo.png";
import DragBar from "./DragBar";
import { useTranslation } from "react-i18next";

const Login: React.FC<{ onLogin: (username: string) => void }> = ({
  onLogin,
}) => {
  const { t } = useTranslation();

  type AccountType = "premium" | "nopremium";

  const storedAccountType = useMemo<AccountType | null>(() => {
    try {
      const raw = localStorage.getItem("accountType");
      return raw === "premium" || raw === "nopremium" ? raw : null;
    } catch {
      return null;
    }
  }, []);

  const [accountType, setAccountType] = useState<AccountType | null>(storedAccountType);
  const [premiumError, setPremiumError] = useState<string | null>(null);
  const [premiumWorking, setPremiumWorking] = useState(false);
  const [showPremiumCancel, setShowPremiumCancel] = useState(false);
  const premiumCancelledRef = useRef(false);

  const MIN_NICK_LEN = 3;
  const MAX_NICK_LEN = 16;

  const [nick, setNick] = useState("");
  const [error, setError] = useState<
    | {
        key:
          | "login.errors.empty"
          | "login.errors.minLength"
          | "login.errors.maxLength";
        params?: Record<string, unknown>;
      }
    | null
  >(null);

  useEffect(() => {
    if (accountType !== "premium") return;
    let cancelled = false;

    void (async () => {
      try {
        const status = await window.config.premiumStatus();
        if (cancelled) return;
        if (status.ok && status.loggedIn && status.profile?.displayName) {
          onLogin(status.profile.displayName);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountType, onLogin]);

  useEffect(() => {
    if (!premiumWorking) {
      setShowPremiumCancel(false);
      return;
    }

    const timer = setTimeout(() => setShowPremiumCancel(true), 5000);
    return () => clearTimeout(timer);
  }, [premiumWorking]);

  const persistAccountType = (next: AccountType) => {
    try {
      localStorage.setItem("accountType", next);
    } catch {
      // ignore
    }
    setAccountType(next);
  };

  const goBackToAccountType = () => {
    try {
      localStorage.removeItem("accountType");
    } catch {
      // ignore
    }

    try {
      void window.config.premiumOauthCancel?.();
    } catch {
      // ignore
    }

    setAccountType(null);
    setPremiumError(null);
    setPremiumWorking(false);
    setShowPremiumCancel(false);
    setError(null);
    setNick("");
  };

  useEffect(() => {
    if (!window.ipcRenderer) return;
    const onForceLogout = () => {
      goBackToAccountType();
    };
    window.ipcRenderer.on("premium:force-logout", onForceLogout);
    return () => {
      try {
        window.ipcRenderer.off("premium:force-logout", onForceLogout);
      } catch {
        // ignore
      }
    };
  }, []);

  const startPremiumLogin = async () => {
    setPremiumError(null);
    premiumCancelledRef.current = false;
    setPremiumWorking(true);
    try {
      const res = await window.config.premiumOauthStart();
      if (premiumCancelledRef.current) return;
      if (!res.ok) {
        setPremiumError(res.error || "Login failed");
        return;
      }
      onLogin(res.displayName);
    } catch (e) {
      if (premiumCancelledRef.current) return;
      setPremiumError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setPremiumWorking(false);
    }
  };

  const cancelPremiumLogin = async () => {
    premiumCancelledRef.current = true;
    try {
      await window.config.premiumOauthCancel?.();
    } catch {
      // ignore
    } finally {
      setPremiumWorking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nick.trim()) {
      setError({ key: "login.errors.empty" });
      return;
    }
    if (nick.length < MIN_NICK_LEN) {
      setError({
        key: "login.errors.minLength",
        params: { min: MIN_NICK_LEN },
      });
      return;
    }
    if (nick.length > MAX_NICK_LEN) {
      setError({
        key: "login.errors.maxLength",
        params: { max: MAX_NICK_LEN },
      });
      return;
    }
    setError(null);
    onLogin(nick.trim());
  };

  return (
    <div className="w-screen h-screen flex bg-black overflow-hidden">
      <div className="fixed top-0 left-0 w-full z-50">
        <DragBar />
      </div>

      <div className="w-[380px] h-full bg-[#0f131a] flex flex-col justify-center px-10 relative">
        <img
          src={butterLogo}
          alt="Logo"
          draggable={false}
          className="
            w-[220px]
            h-auto
            top-[10px]
            left-[74px]
            mb-10
            select-none
            absolute"
        />

        {accountType === null ? (
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-gray-400 text-sm text-center">{t("login.accountTypePrompt")}</p>
            <button
              type="button"
              onClick={() => persistAccountType("premium")}
              className="
                h-11 w-full
                bg-linear-to-r from-[#0268D4] to-[#02D4D4]
                text-white font-semibold
                rounded
                hover:from-[#025bb8] hover:to-[#02baba]
                transition
              "
            >
              {t("login.premium")}
            </button>
            <button
              type="button"
              onClick={() => persistAccountType("nopremium")}
              className="
                h-11 w-full
                bg-[#1a1f2e]
                text-white font-semibold
                rounded
                hover:bg-[#232a3d]
                transition
              "
            >
              {t("login.noPremium")}
            </button>
          </div>
        ) : accountType === "premium" ? (
          <div className="flex flex-col gap-2">
            <p className="mb-2 text-gray-400 text-sm text-center">{t("login.premiumPrompt")}</p>
            <button
              type="button"
              onClick={startPremiumLogin}
              disabled={premiumWorking}
              className={
                "h-11 w-full text-white font-semibold rounded transition " +
                (premiumWorking
                  ? "bg-[#1a1f2e] cursor-not-allowed opacity-80"
                  : "bg-linear-to-r from-[#0268D4] to-[#02D4D4] hover:from-[#025bb8] hover:to-[#02baba]")
              }
            >
              {premiumWorking ? t("common.working") : t("login.premiumLogin")}
            </button>
            {premiumError ? (
              <span className="text-red-400 text-xs">{premiumError}</span>
            ) : null}

            {premiumWorking && showPremiumCancel ? (
              <button
                type="button"
                onClick={cancelPremiumLogin}
                className="h-10 w-full rounded text-sm transition bg-transparent border border-gray-600 text-gray-300 hover:bg-[#1a1f2e]"
              >
                {t("common.cancel")}
              </button>
            ) : null}

            <button
              type="button"
              onClick={goBackToAccountType}
              disabled={premiumWorking}
              className={
                "absolute bottom-16 left-10 right-10 h-10 rounded text-sm transition " +
                (premiumWorking
                  ? "opacity-70 cursor-not-allowed bg-transparent border border-gray-700 text-gray-400"
                  : "bg-transparent border border-gray-600 text-gray-300 hover:bg-[#1a1f2e]")
              }
            >
              {t("common.back")}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-gray-400 text-sm text-center">{t("login.prompt")}</p>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
              <input
                type="text"
                placeholder={t("login.nicknamePlaceholder")}
                value={nick}
                maxLength={MAX_NICK_LEN}
                onChange={(e) => setNick(e.target.value)}
                className="
                  w-full h-11 px-4
                  bg-[#1a1f2e]
                  text-white
                  placeholder-gray-500
                  rounded
                  focus:outline-none
                  focus:ring-2 focus:ring-[#4a90e2]
                "
              />
              {error ? (
                <span className="text-red-400 text-xs">{t(error.key, error.params)}</span>
              ) : null}
              <p className="px-2 text-gray-400 text-xs">
                {t("login.characters", { current: nick.length, max: MAX_NICK_LEN })}
              </p>
              <button
                type="submit"
                className="
                  mt-2 h-11 w-full
                  bg-linear-to-r from-[#0268D4] to-[#02D4D4]
                  text-white font-semibold
                  rounded
                  hover:from-[#025bb8] hover:to-[#02baba]
                  transition
                "
              >
                {t("login.enter")}
              </button>
            </form>

            <button
              type="button"
              onClick={goBackToAccountType}
              className="absolute bottom-16 left-10 right-10 h-10 rounded text-sm transition bg-transparent border border-gray-600 text-gray-300 hover:bg-[#1a1f2e]"
            >
              {t("common.back")}
            </button>
          </>
        )}
        <div className="absolute bottom-6 left-10 text-xs text-gray-500">
          {`${window.config.BUILD_DATE} V${window.config.VERSION}`}
        </div>
      </div>

      <div
        className="flex-1 h-full bg-cover bg-center"
        style={{ backgroundImage: `url(${butterLoginBg})` }}
      />
    </div>
  );
};

export default Login;
