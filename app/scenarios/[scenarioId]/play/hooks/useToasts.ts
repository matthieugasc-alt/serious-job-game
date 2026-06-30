/**
 * useToasts — small notification queue (mail / chat events).
 * Each toast auto-dismisses after 4 seconds.
 */

import { useCallback, useState } from "react";

export type Toast = {
  id: string;
  text: string;
  icon: string;
  type: "chat" | "mail";
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((text: string, icon: string, type: "chat" | "mail") => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, text, icon, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
