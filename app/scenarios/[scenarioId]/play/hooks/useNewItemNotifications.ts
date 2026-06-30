/**
 * useNewItemNotifications — fires toast notifications when new mails
 * arrive in the inbox or new NPC messages land in the chat.
 *
 * Owns its own "previous count" refs so callers don't need to track
 * those. Also bumps the unread-mail badge on every new mail.
 *
 * Skips chat toasts when the player is already on the chat tab.
 */

import { useEffect, useRef } from "react";

const TYPE_BADGE: Record<string, string> = {
  phone_call: "📞",
  whatsapp_message: "📱",
  sms: "📱",
  visio: "📹",
  interruption: "⚡",
};

export function useNewItemNotifications(opts: {
  inboxMails: any[];
  conversation: any[];
  mainView: string;
  getActorInfo: (id: string) => { name: string };
  addToast: (text: string, icon: string, type: "chat" | "mail") => void;
  setUnreadMails: React.Dispatch<React.SetStateAction<number>>;
}) {
  const {
    inboxMails, conversation, mainView,
    getActorInfo, addToast, setUnreadMails,
  } = opts;

  const prevMailCountRef = useRef(-1);
  const prevChatCountRef = useRef(-1);

  // ── New mails → toast + unread badge ──
  useEffect(() => {
    if (prevMailCountRef.current === -1) {
      prevMailCountRef.current = inboxMails.length;
      return;
    }
    if (inboxMails.length > prevMailCountRef.current) {
      const newCount = inboxMails.length - prevMailCountRef.current;
      setUnreadMails((u) => u + newCount);
      const newMails = inboxMails.slice(-newCount);
      for (const mail of newMails) {
        const senderInfo = getActorInfo(mail.from);
        addToast(`${senderInfo.name} : ${mail.subject}`, "📧", "mail");
      }
    }
    prevMailCountRef.current = inboxMails.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxMails.length]);

  // ── New chat messages → toast (unless already on chat tab) ──
  useEffect(() => {
    const nonPlayerMsgs = conversation.filter(
      (m: any) => m.role !== "player" && m.role !== "system",
    );
    if (prevChatCountRef.current === -1) {
      prevChatCountRef.current = nonPlayerMsgs.length;
      return;
    }
    if (nonPlayerMsgs.length > prevChatCountRef.current) {
      const newCount = nonPlayerMsgs.length - prevChatCountRef.current;
      const newMsgs = nonPlayerMsgs.slice(-newCount);
      for (const msg of newMsgs) {
        const actorInfo = getActorInfo(msg.actor || "npc");
        const icon = TYPE_BADGE[msg.type || ""] || "💬";
        const preview =
          msg.content.length > 60 ? msg.content.slice(0, 57) + "..." : msg.content;
        if (mainView !== "chat") {
          addToast(`${actorInfo.name} : ${preview}`, icon, "chat");
        }
      }
    }
    prevChatCountRef.current = nonPlayerMsgs.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.length]);
}
