"use client";

/**
 * StepChrome — chrome commun du player v2, appliqué par le Shell autour
 * de chaque mécanique. Rendu pur, aucune logique métier :
 *   - header sticky : titre scénario, titre step, progression (X/Y + points),
 *     limite de temps éventuelle ;
 *   - bandeau discret « Reprise de votre session » sur deep-save ;
 *   - contenu centré max-w-6xl sur fond gris pâle, carte blanche à
 *     hauteur maîtrisée (les mécaniques posent h-full dessus).
 */

import { useState, type ReactNode } from "react";

interface Props {
  scenarioTitle: string;
  stepTitle: string;
  stepIndex: number; // 0-based
  stepCount: number;
  timeLimitS?: number;
  /** Session reprise depuis un deep-save → bandeau discret. */
  resumed?: boolean;
  children: ReactNode;
}

export function StepChrome({
  scenarioTitle,
  stepTitle,
  stepIndex,
  stepCount,
  timeLimitS,
  resumed,
  children,
}: Props) {
  const [resumeDismissed, setResumeDismissed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
              {scenarioTitle}
            </p>
            <h1 className="truncate text-base font-semibold leading-tight text-gray-900">
              {stepTitle}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {typeof timeLimitS === "number" && timeLimitS > 0 && (
              <span className="hidden items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline-flex">
                ⏱ limite {Math.round(timeLimitS / 60)} min
              </span>
            )}
            <div className="flex items-center gap-2.5">
              <span className="whitespace-nowrap text-xs font-medium text-gray-500">
                Étape {stepIndex + 1}/{stepCount}
              </span>
              {stepCount > 1 && stepCount <= 12 && (
                <div className="flex items-center gap-1.5" aria-hidden>
                  {Array.from({ length: stepCount }, (_, i) => (
                    <span
                      key={i}
                      className={`rounded-full transition-all ${
                        i < stepIndex
                          ? "h-2 w-2 bg-indigo-600"
                          : i === stepIndex
                            ? "h-2.5 w-2.5 bg-indigo-600 ring-2 ring-indigo-200"
                            : "h-2 w-2 bg-gray-300"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {resumed && !resumeDismissed && (
        <div className="border-b border-indigo-100 bg-indigo-50/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <p className="text-xs font-medium text-indigo-800">
              ↻ Reprise de votre session — vous reprenez là où vous vous étiez
              arrêté.
            </p>
            <button
              type="button"
              aria-label="Masquer"
              className="rounded p-1 text-indigo-400 hover:text-indigo-700"
              onClick={() => setResumeDismissed(true)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="flex h-[calc(100vh-8.75rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
