"use client";

/** Overlay minimal de transition entre steps / retry. Aucune logique. */

interface Props {
  banner:
    | { kind: "transition"; title: string }
    | { kind: "retry"; reason: string };
  onDismiss: () => void;
}

export function TransitionOverlay({ banner, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-xl">
        {banner.kind === "transition" ? (
          <>
            <p className="text-xs uppercase tracking-wide opacity-50">
              Étape suivante
            </p>
            <h2 className="mt-2 text-lg font-semibold">{banner.title}</h2>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-red-600">
              Étape non validée — nouvel essai
            </p>
            <p className="mt-2 text-sm">{banner.reason}</p>
          </>
        )}
        <button
          className="mt-6 rounded bg-black px-4 py-2 text-sm text-white"
          onClick={onDismiss}
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
