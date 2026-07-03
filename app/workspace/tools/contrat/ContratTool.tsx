"use client";

/**
 * ContratTool — panneau de contrat (contrat §3).
 * Le Tool ne connaît ni les threads ni le scénario : proposer des termes
 * dispatch `tool_state_changed` + `deliverable_submitted` (le moteur fait
 * suivre) ; signer/refuser dispatch `contract_signed`/`contract_rejected`.
 * Toutes les confirmations sont inline — jamais de modale bloquante.
 */

import { useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import { DangerButton, PrimaryButton, SecondaryButton } from "@/app/player/primitives/ui";
import type { ToolComponentProps } from "../types";
import {
  CONTRAT_TOOL_ID,
  normalizeContratState,
  parseContratTerms,
  type ContratTermDef,
} from "./spec";

type PendingAction = null | "propose" | "sign" | "reject";

export function ContratTool({ state, config, dispatch }: ToolComponentProps) {
  const terms = parseContratTerms(config);
  const persisted = normalizeContratState(state, config);
  const [values, setValues] = useState<Record<string, Json>>(persisted.values);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const closed = persisted.status !== "open";

  const setValue = (term: ContratTermDef, raw: string) => {
    setValues((v) => ({
      ...v,
      [term.id]: term.type === "number" ? (raw === "" ? "" : Number(raw)) : raw,
    }));
  };

  const propose = () => {
    const proposal = { at: Date.now(), values };
    dispatch({
      type: "tool_state_changed",
      tool_id: CONTRAT_TOOL_ID,
      state: { ...persisted, values, proposals: [...persisted.proposals, proposal] },
    });
    dispatch({ type: "deliverable_submitted", tool_id: CONTRAT_TOOL_ID, payload: { proposal } });
    setPending(null);
  };

  const sign = () => {
    dispatch({
      type: "tool_state_changed",
      tool_id: CONTRAT_TOOL_ID,
      state: { ...persisted, values, status: "signed" },
    });
    dispatch({ type: "contract_signed", tool_id: CONTRAT_TOOL_ID, terms: values });
    setPending(null);
  };

  const reject = () => {
    dispatch({
      type: "tool_state_changed",
      tool_id: CONTRAT_TOOL_ID,
      state: { ...persisted, values, status: "rejected" },
    });
    dispatch({
      type: "contract_rejected",
      tool_id: CONTRAT_TOOL_ID,
      reason: reason.trim() || undefined,
    });
    setPending(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-white">
      {closed && (
        <div
          className={`shrink-0 border-b px-4 py-3 text-sm font-medium ${
            persisted.status === "signed"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {persisted.status === "signed"
            ? "Contrat signé aux termes affichés."
            : "Vous avez refusé de signer ce contrat."}
        </div>
      )}

      {/* Termes du contrat. */}
      <div className="space-y-3 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Termes du contrat
        </p>
        {terms.length === 0 && (
          <p className="text-sm text-gray-400">Aucun terme à négocier pour le moment.</p>
        )}
        {terms.map((term) => {
          const value = values[term.id];
          const display = value === null || value === undefined ? "" : String(value);
          return (
            <label key={term.id} className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">{term.label}</span>
              <span className="flex items-center gap-2">
                {term.type === "textarea" ? (
                  <textarea
                    className="min-h-[64px] w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-500"
                    value={display}
                    disabled={closed}
                    onChange={(e) => setValue(term, e.target.value)}
                  />
                ) : (
                  <input
                    type={term.type === "number" ? "number" : "text"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50 disabled:text-gray-500"
                    value={display}
                    disabled={closed}
                    onChange={(e) => setValue(term, e.target.value)}
                  />
                )}
                {term.suffix && <span className="shrink-0 text-xs text-gray-500">{term.suffix}</span>}
              </span>
            </label>
          );
        })}
      </div>

      {/* Actions + confirmations inline. */}
      {!closed && (
        <div className="space-y-2 border-t border-gray-100 px-4 py-3">
          {pending === null ? (
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={() => setPending("propose")}>
                Proposer ces termes
              </SecondaryButton>
              <PrimaryButton onClick={() => setPending("sign")}>
                Signer aux termes affichés
              </PrimaryButton>
              <DangerButton onClick={() => setPending("reject")}>Refuser</DangerButton>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-sm font-medium text-gray-800">
                {pending === "propose" && "Envoyer cette proposition à l'autre partie ?"}
                {pending === "sign" && "Signer le contrat aux termes affichés ? Cette action est définitive."}
                {pending === "reject" && "Refuser de signer ce contrat ? Cette action est définitive."}
              </p>
              {pending === "reject" && (
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none"
                  placeholder="Motif (optionnel)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
              <div className="flex gap-2">
                <PrimaryButton
                  onClick={pending === "propose" ? propose : pending === "sign" ? sign : reject}
                >
                  Confirmer
                </PrimaryButton>
                <SecondaryButton onClick={() => setPending(null)}>Annuler</SecondaryButton>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historique des propositions. */}
      {persisted.proposals.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Propositions envoyées
          </p>
          <ul className="space-y-2">
            {[...persisted.proposals].reverse().map((p, i) => (
              <li key={`${p.at}-${i}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-[11px] text-gray-400">
                  {new Date(p.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-xs text-gray-700">
                  {terms
                    .map((t) => `${t.label} : ${String(p.values[t.id] ?? "—")}${t.suffix ? ` ${t.suffix}` : ""}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
