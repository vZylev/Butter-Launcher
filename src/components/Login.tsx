import React, { useEffect, useMemo, useRef, useState } from "react";
import butterLoginBg from "../assets/butter-login.jpeg";
import butterLogo from "../assets/butter-logo.png";
import DragBar from "./DragBar";
import { useTranslation } from "react-i18next";
import { customAlternativeLoginProvider } from "../utils/dynamicModules/customAlternativeLoginProvider";
import { StorageService } from "../services/StorageService";
import {
  Box,
  Button,
  Input,
  Text,
  VStack,
  HStack,
  Spinner,
} from "@chakra-ui/react";

const Login: React.FC<{ onLogin: (username: string) => void }> = ({
  onLogin,
}) => {
  const { t } = useTranslation();

  const allowAlternative = customAlternativeLoginProvider.allowAlternative;
  const alternativeLabel = customAlternativeLoginProvider.alternativeLabel;

  const storedAccountType = useMemo<AccountType | null>(() => {
    const raw = StorageService.getAccountType();
    if (raw === "premium") return "premium";
    if (raw === "custom") return "custom";
    return null;
  }, []);

  const [accountType, setAccountType] = useState<AccountType | null>(
    storedAccountType,
  );
  const [premiumError, setPremiumError] = useState<string | null>(null);
  const [premiumWorking, setPremiumWorking] = useState(false);
  const [showPremiumCancel, setShowPremiumCancel] = useState(false);
  const premiumCancelledRef = useRef(false);

  const MIN_NICK_LEN = 3;
  const MAX_NICK_LEN = 16;

  const [nick, setNick] = useState("");
  const [error, setError] = useState<{
    key:
      | "login.errors.empty"
      | "login.errors.minLength"
      | "login.errors.maxLength";
    params?: Record<string, unknown>;
  } | null>(null);

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
    StorageService.setAccountType(next);
    setAccountType(next);
  };

  // Base behavior (no dynamic module installed): only allow the official mode.
  // This also heals any legacy/localStorage values that would otherwise select a non-official mode.
  useEffect(() => {
    if (allowAlternative) return;
    if (accountType === null || accountType === "custom") {
      persistAccountType("premium");
    }
  }, [allowAlternative, accountType]);

  const goBackToAccountType = () => {
    StorageService.remove("accountType");
    try {
      window.dispatchEvent(new Event("accountType:changed"));
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
    <Box w="100vw" h="100vh" display="flex" bg="black" overflow="hidden">
      {/* DragBar overlaid on top */}
      <Box position="fixed" top={0} left={0} w="full" zIndex={50}>
        <DragBar />
      </Box>

      {/* Left panel */}
      <Box
        w="380px"
        minW="380px"
        h="full"
        bg="rgba(10,14,22,0.98)"
        display="flex"
        flexDir="column"
        alignItems="stretch"
        px={10}
        pt="88px"
        pb={8}
        position="relative"
        borderRight="1px solid"
        borderColor="whiteAlpha.50"
        backdropFilter="blur(12px)"
      >
        {/* Logo */}
        <Box mb={10} display="flex" justifyContent="center">
          <img
            src={butterLogo}
            alt="Logo"
            draggable={false}
            style={{ width: 180, userSelect: "none" }}
          />
        </Box>

        {/* Forms */}
        {accountType === null ? (
          <VStack gap={3}>
            <Text color="whiteAlpha.600" fontSize="sm" textAlign="center">
              {t("login.accountTypePrompt")}
            </Text>
            <Button
              w="full"
              h={11}
              fontWeight="semibold"
              color="white"
              style={{ background: "linear-gradient(90deg,#0268D4,#02D4D4)" }}
              _hover={{ opacity: 0.9 }}
              onClick={() => persistAccountType("premium")}
            >
              {t("login.premium")}
            </Button>
            {allowAlternative && alternativeLabel ? (
              <Button
                w="full"
                h={11}
                fontWeight="semibold"
                bg="whiteAlpha.100"
                color="white"
                _hover={{ bg: "whiteAlpha.150" }}
                onClick={() => persistAccountType("custom")}
              >
                {alternativeLabel}
              </Button>
            ) : null}
          </VStack>
        ) : accountType === "premium" ? (
          <VStack gap={3} align="stretch">
            <Text color="whiteAlpha.600" fontSize="sm" textAlign="center">
              {t("login.premiumPrompt")}
            </Text>
            <Button
              w="full"
              h={11}
              fontWeight="semibold"
              color="white"
              disabled={premiumWorking}
              style={premiumWorking ? { background: "rgba(255,255,255,0.08)" } : { background: "linear-gradient(90deg,#0268D4,#02D4D4)" }}
              _hover={premiumWorking ? {} : { opacity: 0.9 }}
              onClick={startPremiumLogin}
            >
              {premiumWorking ? (
                <HStack>
                  <Spinner size="sm" color="white" />
                  <span>{t("common.working")}</span>
                </HStack>
              ) : t("login.premiumLogin")}
            </Button>
            {premiumError ? (
              <Text color="red.400" fontSize="xs">{premiumError}</Text>
            ) : null}
            {premiumWorking && showPremiumCancel ? (
              <Button
                w="full"
                h={10}
                variant="outline"
                colorScheme="whiteAlpha"
                color="whiteAlpha.700"
                fontSize="sm"
                borderColor="whiteAlpha.200"
                _hover={{ bg: "whiteAlpha.100" }}
                onClick={cancelPremiumLogin}
              >
                {t("common.cancel")}
              </Button>
            ) : null}
            {allowAlternative ? (
              <Button
                position="absolute"
                bottom={16}
                left={10}
                right={10}
                h={10}
                variant="outline"
                fontSize="sm"
                color="whiteAlpha.600"
                borderColor="whiteAlpha.200"
                _hover={{ bg: "whiteAlpha.100", color: "white" }}
                disabled={premiumWorking}
                onClick={goBackToAccountType}
              >
                {t("common.back")}
              </Button>
            ) : null}
          </VStack>
        ) : (
          <>
            <VStack gap={2} align="stretch">
              <Text color="whiteAlpha.600" fontSize="sm" textAlign="center" mb={1}>
                {t("login.prompt")}
              </Text>
              <Box as="form" onSubmit={handleSubmit as any} {...({noValidate: true} as any)} display="flex" flexDir="column" gap={2}>
                <Input
                  type="text"
                  placeholder={t("login.nicknamePlaceholder")}
                  value={nick}
                  maxLength={MAX_NICK_LEN}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNick(e.target.value)}
                  bg="whiteAlpha.50"
                  border="1px solid"
                  borderColor="whiteAlpha.150"
                  color="white"
                  h={11}
                  px={4}
                  borderRadius="lg"
                  _placeholder={{ color: "whiteAlpha.400" }}
                  _focus={{ borderColor: "#4a90e2", boxShadow: "0 0 0 1px #4a90e2" }}
                  _hover={{ borderColor: "whiteAlpha.300" }}
                />
                {error ? (
                  <Text color="red.400" fontSize="xs">{t(error.key, error.params as any) as string}</Text>
                ) : null}
                <Text px={1} color="whiteAlpha.500" fontSize="xs">
                  {t("login.characters", { current: nick.length, max: MAX_NICK_LEN }) as string}
                </Text>
                <Button
                  type="submit"
                  w="full"
                  h={11}
                  fontWeight="semibold"
                  color="white"
                  mt={1}
                  style={{ background: "linear-gradient(90deg,#0268D4,#02D4D4)" }}
                  _hover={{ opacity: 0.9 }}
                >
                  {t("login.enter")}
                </Button>
              </Box>
            </VStack>
            <Button
              position="absolute"
              bottom={16}
              left={10}
              right={10}
              h={10}
              variant="outline"
              fontSize="sm"
              color="whiteAlpha.600"
              borderColor="whiteAlpha.200"
              _hover={{ bg: "whiteAlpha.100", color: "white" }}
              onClick={goBackToAccountType}
            >
              {t("common.back")}
            </Button>
          </>
        )}

        {/* Version */}
        <Text position="absolute" bottom={6} left={10} fontSize="xs" color="whiteAlpha.300">
          {`${window.config.BUILD_DATE} V${window.config.VERSION}`}
        </Text>
      </Box>

      {/* Right background panel */}
      <Box
        flex={1}
        h="full"
        style={{
          backgroundImage: `url(${butterLoginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    </Box>
  );
};

export default Login;
