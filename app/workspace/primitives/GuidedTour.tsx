"use client";

/**
 * GuidedTour — tour guidé « coach-mark » : surbrillance (spotlight) d'un
 * élément cible + bulle ancrée « étape X/N » avec Précédent / Suivant /
 * Passer. Générique et réutilisable : on lui passe une liste d'étapes
 * ciblant des éléments via un sélecteur CSS (data-tour="…").
 *
 * Le spotlight = un trou lumineux obtenu par une immense box-shadow sombre
 * autour du rectangle de la cible. Si la cible est introuvable, la bulle se
 * centre (fallback), le tour ne casse jamais.
 */

import { useEffect, useLayoutEffect, useState } from "react";

export interface TourStep {
  /** Sélecteur CSS de la cible (ex. `[data-tour="search"]`). */
  selector: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
  /** Action à exécuter en entrant dans l'étape (ex. ouvrir un document). */
  beforeShow?: () => void;
  /** Étape ACTIVE : « Suivant » reste bloqué tant que ce prédicat est faux
   *  (le joueur DOIT faire l'action décrite). Réévalué à chaque rendu. */
  waitFor?: () => boolean;
  /** Consigne d'action affichée tant que waitFor est faux (ex. « Crée une tâche »). */
  todo?: string;
  /** Couleur d'accent du spotlight. « red » = cerclage rouge pulsant très
   *  voyant (pour une cible discrète comme la poignée ⋮ d'une ligne). */
  accent?: "indigo" | "red";
}

const PAD = 6;

export function GuidedTour({
  steps,
  open,
  onClose,
  index,
  onIndexChange,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  /** Index d'étape CONTRÔLÉ par le parent — nécessaire quand le composant
   *  peut être remonté pendant le tour (ex. changement de vue). Sinon état
   *  interne. Le parent gère alors la remise à 0 à l'ouverture. */
  index?: number;
  onIndexChange?: (i: number) => void;
}) {
  const [internalI, setInternalI] = useState(0);
  const controlled = index !== undefined;
  const i = controlled ? (index as number) : internalI;
  const setI = (u: number | ((v: number) => number)) => {
    const next = typeof u === "function" ? u(i) : u;
    if (onIndexChange) onIndexChange(next);
    else setInternalI(next);
  };
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // En mode contrôlé, c'est le parent qui remet à 0 à l'ouverture (sinon
    // un remontage pendant le tour réinitialiserait l'étape).
    if (open && !controlled) setInternalI(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = open ? steps[i] : undefined;

  useLayoutEffect(() => {
    if (!open || !step) return;
    step.beforeShow?.();
    const locate = () => {
      const el = step.selector ? (document.querySelector(step.selector) as HTMLElement | null) : null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(locate));
    const onMove = () => setTick((t) => t + 1);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, tick]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        const st = steps[i];
        if (st?.waitFor && !st.waitFor()) return; // étape active non satisfaite
        if (i + 1 < steps.length) setI(i + 1);
      } else if (e.key === "ArrowLeft") setI(Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, steps]);

  if (!open || !step) return null;

  const last = i === steps.length - 1;
  const gated = !!step.waitFor && !step.waitFor();
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const BW = 320;

  // Position de la bulle : sous la cible par défaut, sinon au-dessus si pas
  // la place ; clampée dans le viewport. Centrée si pas de cible.
  let bubbleStyle: React.CSSProperties;
  if (rect) {
    const place = step.placement ?? (rect.bottom + 170 < vh ? "bottom" : "top");
    let top: number;
    let left = Math.min(Math.max(8, rect.left), vw - BW - 8);
    if (place === "top") top = Math.max(8, rect.top - 8 - 150);
    else if (place === "bottom") top = Math.min(vh - 160, rect.bottom + 12);
    else {
      top = Math.min(Math.max(8, rect.top), vh - 160);
      left = place === "left" ? Math.max(8, rect.left - BW - 12) : Math.min(vw - BW - 8, rect.right + 12);
    }
    bubbleStyle = { top, left, width: BW };
  } else {
    bubbleStyle = { top: vh / 2 - 80, left: vw / 2 - BW / 2, width: BW };
  }

  return (
    // pointer-events-none : l'overlay ne fait que la SURBRILLANCE, il ne
    // capture pas les clics — le joueur peut donc interagir avec l'élément
    // mis en avant (ex. « + bureau »). Seule la bulle reste cliquable.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {/* Spotlight : trou clair autour de la cible via box-shadow sombre. */}
      {rect ? (
        <>
          <div
            className={`pointer-events-none absolute rounded-lg transition-all ${
              step.accent === "red" ? "ring-4 ring-red-500" : "ring-2 ring-indigo-400"
            }`}
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 9999px rgba(17,24,39,0.55)",
            }}
          />
          {/* Halo pulsant (sans ombre) — UNIQUEMENT sur l'accent rouge, pour
              attirer l'œil sur une petite cible (la poignée ⋮). Sur les étapes
              normales, pas d'animation : un carré qui s'étend en continu est
              gênant tout au long du tuto. */}
          {step.accent === "red" && (
            <div
              className="pointer-events-none absolute rounded-lg animate-ping ring-4 ring-red-500"
              style={{
                top: rect.top - PAD,
                left: rect.left - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
              }}
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-gray-900/55" />
      )}

      {/* Bulle (seul élément cliquable de l'overlay). */}
      <div
        className="pointer-events-auto absolute rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xl"
        style={bubbleStyle}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
            Étape {i + 1}/{steps.length}
          </span>
          <button type="button" className="text-[11px] text-gray-400 hover:text-gray-700" onClick={onClose}>
            Passer ✕
          </button>
        </div>
        <p className="text-sm font-semibold text-gray-900">{step.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{step.body}</p>
        {step.waitFor && (
          <p
            className={`mt-2 rounded-lg px-2 py-1.5 text-[12px] font-medium ${
              gated ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {gated ? `👉 ${step.todo ?? "Fais l'action décrite pour continuer."}` : "✓ C'est fait — tu peux continuer."}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 disabled:opacity-40"
            onClick={() => setI(Math.max(0, i - 1))}
            disabled={i === 0}
          >
            ← Précédent
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => (last ? onClose() : setI(i + 1))}
            disabled={gated}
          >
            {last ? "Terminer" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
