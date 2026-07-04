"use client";

/**
 * useNavigationGuard — le retour arrière ne quitte JAMAIS une mission.
 *
 * - popstate (retour arrière navigateur / trackpad) : intercepté ; l'état
 *   d'historique est SYSTÉMATIQUEMENT re-poussé (on ne sort jamais du
 *   scénario par un geste réflexe) et un événement `revealio:back` est
 *   émis pour que l'app courante l'utilise comme navigation INTERNE
 *   (ex. revenir au sélecteur de documents).
 * - beforeunload (refresh/fermeture) : confirmation native, sauf sortie
 *   explicite (bouton « Quitter » → requestScenarioExit).
 *
 * La sortie d'un scénario passe UNIQUEMENT par un bouton « Quitter »
 * (requestScenarioExit) — jamais par le retour arrière.
 */

import { useEffect } from "react";

/** Événement émis à chaque retour arrière : navigation interne à l'app. */
export const REVEALIO_BACK_EVENT = "revealio:back";

let exiting = false;

/** Sortie EXPLICITE d'un scénario (bouton « Quitter ») : lève le garde
 *  beforeunload puis navigue vers la destination. */
export function requestScenarioExit(href: string): void {
  exiting = true;
  window.location.assign(href);
}

export function useNavigationGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;

    // Ancre d'historique : le premier "retour" tombe sur cette entrée.
    window.history.pushState({ revealioGuard: true }, "", window.location.href);

    const onPopState = () => {
      // JAMAIS de sortie : on ré-ancre et on signale un retour interne.
      window.history.pushState({ revealioGuard: true }, "", window.location.href);
      window.dispatchEvent(new CustomEvent(REVEALIO_BACK_EVENT));
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (exiting) return;
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
