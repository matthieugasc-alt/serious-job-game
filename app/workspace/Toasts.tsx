"use client";

/**
 * Toasts — pile de notifications éphémères du workspace (haut-droite).
 * Extrait du WorkspaceShell (fix bug PO toasts, 4 juillet 2026).
 *
 * Règles PO :
 *  1. JAMAIS de toast pour le contenu déjà sous les yeux du joueur :
 *     app source active, ou mini-fenêtre ChatDock ouverte sur le fil
 *     concerné (repéré par notification.source_id).
 *  2. Disparition automatique après 3 s ; croix de fermeture conservée.
 *  3. Position HAUT-DROITE sous le bandeau du shell, pile de 3 max —
 *     ne recouvre jamais le ChatDock ni le composer des apps (bas-droite).
 *
 * Choix d'implémentation — suppression par FILTRAGE À L'AFFICHAGE
 * (état local `handled`), PAS de dispatch synthétique : le journal
 * d'actions du moteur ne contient que de vraies interactions joueur
 * (contrat §2). `notification_read` n'est dispatché que sur un clic
 * réel (ouvrir l'app source / fermer le toast).
 */

import { useEffect, useRef, useState } from "react";
import type { WorkspaceAction, WsNotification } from "@/app/lib/engine/workspace";
import { APP_REGISTRY } from "./apps/registry";

const TOAST_LIMIT = 3;
const TOAST_TTL_MS = 3_000;

interface Props {
  notifications: WsNotification[];
  /** App actuellement affichée dans le shell. */
  activeApp: string;
  /** Fils dont une mini-fenêtre ChatDock est ouverte ([] si dock masqué). */
  openChatThreads: string[];
  openApp: (appId: string) => void;
  dispatch: (action: WorkspaceAction) => void;
}

export function Toasts({ notifications, activeApp, openChatThreads, openApp, dispatch }: Props) {
  // notif_ids traités côté affichage : expirés (3 s) ou nés pendant que
  // leur contenu était déjà visible — ils ne (ré)apparaîtront jamais.
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /** Le joueur regarde déjà ce contenu → pas de toast (règle 1). */
  const suppressed = (n: WsNotification) =>
    n.app === activeApp ||
    (n.app === "messages" &&
      n.source_id !== undefined &&
      openChatThreads.includes(n.source_id));

  const pending = notifications.filter((n) => !n.read && !handled.has(n.notif_id));
  const toasts = pending.filter((n) => !suppressed(n)).slice(-TOAST_LIMIT);

  // Une notification née pendant que son contenu est visible est absorbée
  // DÉFINITIVEMENT (sinon elle surgirait, périmée, en quittant l'app).
  useEffect(() => {
    const absorbed = pending.filter(suppressed).map((n) => n.notif_id);
    if (absorbed.length > 0) {
      setHandled((prev) => new Set([...prev, ...absorbed]));
    }
  });

  // Règle 2 : un timer de 3 s par toast affiché, armé une seule fois.
  useEffect(() => {
    for (const n of toasts) {
      if (timersRef.current.has(n.notif_id)) continue;
      timersRef.current.set(
        n.notif_id,
        setTimeout(
          () => setHandled((prev) => new Set(prev).add(n.notif_id)),
          TOAST_TTL_MS,
        ),
      );
    }
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-12 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((n) => (
        <div
          key={n.notif_id}
          className="pointer-events-auto flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              openApp(n.app);
              dispatch({ type: "notification_read", notif_id: n.notif_id });
            }}
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
              <span aria-hidden>{APP_REGISTRY[n.app]?.icon ?? "🔔"}</span>
              <span className="truncate">{n.title}</span>
            </p>
            {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{n.body}</p>}
          </button>
          <button
            type="button"
            aria-label="Ignorer la notification"
            className="shrink-0 rounded-md px-1 text-gray-400 transition hover:text-gray-600"
            onClick={() => dispatch({ type: "notification_read", notif_id: n.notif_id })}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
