"use client";

/**
 * useNavigationGuard — protège une partie en cours contre les sorties
 * accidentelles (bouton retour du navigateur, refresh, fermeture).
 *
 * - popstate (retour arrière) : intercepté ; une confirmation explicite
 *   est demandée. Refus → l'état d'historique est re-poussé, le joueur
 *   reste dans la mission. Accord → navigation normale.
 * - beforeunload (refresh/fermeture) : confirmation native du navigateur.
 *
 * Le deep-save reste la vraie protection (l'état survit à tout) ; ce
 * garde protège l'IMMERSION : on ne sort pas d'une mission par un
 * geste réflexe.
 */

import { useEffect } from "react";

export function useNavigationGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;

    // Ancre d'historique : le premier "retour" tombe sur cette entrée.
    window.history.pushState({ revealioGuard: true }, "", window.location.href);

    const onPopState = () => {
      const leave = window.confirm(
        "Quitter la mission en cours ? Votre progression est sauvegardée, vous pourrez reprendre.",
      );
      if (leave) {
        window.history.back();
      } else {
        window.history.pushState({ revealioGuard: true }, "", window.location.href);
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);
}
