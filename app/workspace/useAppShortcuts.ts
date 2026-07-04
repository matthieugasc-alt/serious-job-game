"use client";

/**
 * useAppShortcuts — raccourcis clavier ⌘⌥ + chiffre (1..9) pour basculer
 * entre les apps du poste de travail, dans l'ordre du rail (APP_ORDER).
 * Ex. ⌘⌥1 = Messages, ⌘⌥2 = Mail, ⌘⌥3 = Documents, ⌘⌥4 = Bloc-notes,
 * ⌘⌥5 = Decision Engine. Le shell reste seul maître de l'app active.
 */

import { useEffect } from "react";

export function useAppShortcuts(order: readonly string[], onOpen: (id: string) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || !e.altKey) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < order.length) {
        e.preventDefault();
        onOpen(order[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onOpen]);
}
