import { useEffect, useRef, useState } from "react";
import { Box, Button, HStack, IconButton, Input, Text, VStack } from "@chakra-ui/react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { StorageService } from "../services/StorageService";
import { ModalBackdrop, SectionLabel } from "./ui";

const WS_URL = "wss://butter.lat/api/matcha/ws";
const EMOJIS = ["😀", "😂", "🔥", "❤️", "👍", "😎", "😭", "👀"];

type Message = {
  from: string;
  to: string;
  msg: string;
  time: number;
};

export default function Chat({ user, onClose }: { user: string; onClose: () => void }) {
  const { t } = useTranslation();
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
    const saved = StorageService.getJson<Message[]>(storageKey, []);
    setMessages(saved ?? []);
  }, [currentChat, user]);

  useEffect(() => {
    if (messages.length > 0) {
      StorageService.setJson(`butter-chat-${user}-${currentChat}`, messages);
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
          const existing = StorageService.getJson<Message[]>(backgroundKey, []) ?? [];
          StorageService.setJson(backgroundKey, [...existing, data]);
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
    ws.current?.send(JSON.stringify({ type: "message", from: user, to: currentChat, msg: text, time: Date.now() }));
    setText("");
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={9999}>
      <Box
        w="720px"
        h="480px"
        bg="rgba(11,15,26,1)"
        rounded="xl"
        shadow="xl"
        display="flex"
        color="white"
        overflow="hidden"
        border="1px solid"
        borderColor="whiteAlpha.100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <Box w="208px" bg="rgba(15,23,42,1)" p={3} borderRight="1px solid" borderColor="whiteAlpha.100" display="flex" flexDir="column">
          <Box mb={4} px={2}>
            <SectionLabel>{t("chat.channels")}</SectionLabel>
          </Box>
          <Button
            size="sm"
            justifyContent="flex-start"
            variant={currentChat === "global" ? "solid" : "ghost"}
            bg={currentChat === "global" ? "blue.600" : "transparent"}
            color={currentChat === "global" ? "white" : "whiteAlpha.500"}
            _hover={{ bg: currentChat === "global" ? "blue.600" : "whiteAlpha.50" }}
            borderRadius="lg"
            mb={1}
            onClick={() => setCurrentChat("global")}
          >
            🌍 {t("chat.globalChat")}
          </Button>

          <Box mt={4} mb={2} px={2}>
            <SectionLabel>{t("chat.directMessages")}</SectionLabel>
          </Box>
          <Box flex={1} overflowY="auto" className="dark-scrollbar">
            {onlineUsers.map((u) => (
              <Button
                key={u}
                size="sm"
                justifyContent="flex-start"
                w="full"
                variant="ghost"
                bg={currentChat === u ? "blue.600" : "transparent"}
                color={currentChat === u ? "white" : "whiteAlpha.500"}
                _hover={{ bg: currentChat === u ? "blue.600" : "whiteAlpha.50" }}
                borderRadius="lg"
                mb={1}
                onClick={() => setCurrentChat(u)}
              >
                <Box w={2} h={2} bg="green.500" rounded="full" mr={2} flexShrink={0} style={{ animation: "pulse 2s infinite" }} />
                <Text as="span" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{u}</Text>
              </Button>
            ))}
          </Box>
        </Box>

        {/* Main chat area */}
        <Box flex={1} display="flex" flexDir="column" bg="rgba(11,15,26,1)">
          <HStack
            px={4}
            py={3}
            bg="rgba(17,24,39,0.5)"
            backdropFilter="blur(12px)"
            borderBottom="1px solid"
            borderColor="whiteAlpha.100"
            justify="space-between"
          >
            <Box>
              <Text fontWeight="bold">
                {currentChat === "global" ? `🌍 ${t("chat.globalChat")}` : `👤 ${currentChat}`}
              </Text>
              <Text fontSize="10px" color="green.400">{t("chat.online")}</Text>
            </Box>
            <IconButton
              aria-label={t("common.close")}
              size="sm"
              variant="ghost"
              color="whiteAlpha.500"
              _hover={{ color: "white", bg: "whiteAlpha.100" }}
              rounded="full"
              onClick={onClose}
            >
              <IconX size={18} />
            </IconButton>
          </HStack>

          <Box flex={1} overflowY="auto" px={4} py={4} className="dark-scrollbar">
            <VStack gap={3} align="stretch">
              {messages.map((m, i) => {
                const isMe = m.from === user;
                return (
                  <Box key={i} display="flex" justifyContent={isMe ? "flex-end" : "flex-start"}>
                    <Box maxW="80%">
                      {!isMe && (
                        <Text fontSize="xs" fontWeight="bold" color="blue.400" mb={1} ml={1}>
                          {m.from}
                        </Text>
                      )}
                      <Box
                        px={3}
                        py={2}
                        borderRadius={isMe ? "2xl" : "2xl"}
                        borderTopRightRadius={isMe ? "sm" : undefined}
                        borderTopLeftRadius={isMe ? undefined : "sm"}
                        fontSize="sm"
                        bg={isMe ? "blue.600" : "whiteAlpha.100"}
                        color={isMe ? "white" : "whiteAlpha.800"}
                      >
                        {m.msg}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
              {typingUser && (
                <Text fontSize="10px" fontStyle="italic" color="whiteAlpha.500"
                      style={{ animation: "pulse 1.5s infinite" }}>
                  {t("chat.typing", { user: typingUser })}
                </Text>
              )}
              <div ref={bottomRef} />
            </VStack>
          </Box>

          <Box p={4} bg="rgba(15,23,42,0.5)" borderTop="1px solid" borderColor="whiteAlpha.100">
            {showEmojis && (
              <HStack gap={2} p={2} mb={2} bg="whiteAlpha.50" rounded="lg" border="1px solid" borderColor="whiteAlpha.50" overflowX="auto">
                {EMOJIS.map((e) => (
                  <Button key={e} variant="ghost" size="xs" p={1} onClick={() => setText((prev) => prev + e)}>
                    {e}
                  </Button>
                ))}
              </HStack>
            )}
            <HStack gap={3}>
              <IconButton
                aria-label={t("chat.emoji")}
                variant="ghost"
                size="sm"
                onClick={() => setShowEmojis(!showEmojis)}
                filter={showEmojis ? "none" : "grayscale(1)"}
                _hover={{ filter: "none" }}
                fontSize="xl"
              >
                😊
              </IconButton>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                bg="blackAlpha.500"
                border="1px solid"
                borderColor="whiteAlpha.150"
                color="white"
                borderRadius="xl"
                px={4}
                py={2}
                fontSize="sm"
                _placeholder={{ color: "whiteAlpha.400" }}
                _focus={{ borderColor: "blue.500" }}
                placeholder={t("chat.placeholder", { target: currentChat })}
              />
              <Button
                bg="blue.600"
                _hover={{ bg: "blue.500" }}
                color="white"
                px={5}
                py={2}
                borderRadius="xl"
                fontSize="sm"
                fontWeight="bold"
                _active={{ transform: "scale(0.95)" }}
                onClick={sendMessage}
              >
                {t("chat.send")}
              </Button>
            </HStack>
          </Box>
        </Box>
      </Box>
    </ModalBackdrop>
  );
}
