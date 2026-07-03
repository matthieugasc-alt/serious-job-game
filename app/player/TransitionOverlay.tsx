"use client";

/** Overlay de transition entre steps / retry. Aucune logique. */

import { PrimaryButton } from "./primitives/ui";

interface Props {
  banner:
    | { kind: "transition"; title: string }
    | { kind: "retry"; reason: string };
  onDismiss: () => void;
}

export function TransitionOverlay({ banner, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-2xl">
        {banner.kind === "transition" ? (
          <>
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-xl"
            >
              ✅
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
              Étape validée — étape suivante
            </p>
            <h2 className="mt-2 text-lg font-semibold text-gray-900">
              {banner.title}
            </h2>
          </>
        ) : (
          <>
            <div
              aria-hidden
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl"
            >
              🔁
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
              Étape non validée — nouvel essai
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {banner.reason}
            </p>
          </>
        )}
        <PrimaryButton className="mt-6 w-full" onClick={onDismiss}>
          Continuer
        </PrimaryButton>
      </div>
    </div>
  );
}
