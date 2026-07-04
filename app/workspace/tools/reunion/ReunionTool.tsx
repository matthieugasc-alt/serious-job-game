"use client";

/**
 * ReunionTool — salle de réunion minimale en panneau (contrat §3).
 * Phase préparation (brief + décompte) puis phase active (gros timer).
 *  - mode "presentation" : zone de prise de parole (texte) ; à
 *    l'expiration ou sur « Terminer » → deliverable_submitted
 *    { tool_id: "reunion", payload: { speech, duration_s } }.
 *  - mode "qa" : le tool n'affiche que timer + brief — l'échange
 *    questions/réponses passe par le THREAD du step (le jury est un
 *    acteur, ChatDock/Messages).
 *
 * VOIX : volontairement TEXTE SEUL. Le pattern voiceCapture (probe de
 * capability + /api/transcribe + cycle micro) ajouterait ~80 lignes et
 * une gestion de permissions au panneau ; il reste disponible dans
 * app/lib/voiceCapture.ts pour une itération future si le PO la demande.
 *
 * Les horodatages de phase vivent dans l'état du tool (tool_state_changed)
 * pour que le chrono survive au refresh (deep-save).
 */

import { useEffect, useRef, useState } from "react";
import { CountdownTimer } from "@/app/workspace/primitives/CountdownTimer";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { PrimaryButton } from "@/app/workspace/primitives/ui";
import type { ToolComponentProps } from "../types";
import {
  REUNION_TOOL_ID,
  computeReunionDurationS,
  normalizeReunionState,
  parseReunionConfig,
  remainingReunionSeconds,
  type ReunionToolState,
} from "./spec";

const SAVE_DEBOUNCE_MS = 700;

export function ReunionTool({ state, config, dispatch }: ToolComponentProps) {
  const cfg = parseReunionConfig(config);
  const persisted = normalizeReunionState(state, config);

  const [local, setLocal] = useState<ReunionToolState>(persisted);
  const [speech, setSpeech] = useState(persisted.speech);
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const localRef = useRef(local);
  localRef.current = local;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  /** Toute transition de phase passe par le journal (tool_state_changed). */
  const commit = (next: ReunionToolState) => {
    setLocal(next);
    dispatch({ type: "tool_state_changed", tool_id: REUNION_TOOL_ID, state: next });
  };

  // Démarrage de la phase courante : pose l'horodatage manquant
  // (première ouverture ou reprise après refresh).
  useEffect(() => {
    const s = localRef.current;
    if (s.phase === "prepare" && s.prepare_started_at === null) {
      commit({ ...s, prepare_started_at: Date.now() });
    } else if (s.phase === "active" && s.active_started_at === null) {
      commit({ ...s, active_started_at: Date.now() });
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startActive = () => {
    if (localRef.current.phase !== "prepare") return;
    commit({
      ...localRef.current,
      phase: "active",
      active_started_at: Date.now(),
      speech: speechRef.current,
    });
  };

  const onSpeechChange = (value: string) => {
    setSpeech(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const s = localRef.current;
      commit({ ...s, speech: value });
    }, SAVE_DEBOUNCE_MS);
  };

  /** Fin de prise de parole (bouton « Terminer » ou expiration). */
  const finish = () => {
    const s = localRef.current;
    if (s.phase !== "active" || submittedRef.current) return;
    submittedRef.current = true;
    if (timer.current) clearTimeout(timer.current);
    const finalSpeech = speechRef.current.trim();
    const durationS = computeReunionDurationS(
      s.active_started_at,
      Date.now(),
      cfg.timeLimitS,
    );
    commit({ ...s, phase: "done", speech: finalSpeech });
    if (cfg.mode === "presentation") {
      dispatch({
        type: "deliverable_submitted",
        tool_id: REUNION_TOOL_ID,
        payload: { speech: finalSpeech, duration_s: durationS },
      });
    }
  };

  // ── Rendu ──

  if (local.phase === "done") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-white px-6 text-center">
        <span aria-hidden className="text-3xl">🏁</span>
        <p className="text-sm font-semibold text-gray-900">Réunion terminée.</p>
        <p className="text-xs text-gray-500">
          {cfg.mode === "presentation"
            ? "Votre prise de parole a été rendue."
            : "L'échange s'est déroulé dans le fil de discussion."}
        </p>
      </div>
    );
  }

  if (local.phase === "prepare") {
    const remaining = remainingReunionSeconds(
      local.prepare_started_at,
      Date.now(),
      cfg.preparationS,
    );
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Préparation
          </p>
          <CountdownTimer key="prepare" seconds={remaining} running onExpire={startActive} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <Markdown>{cfg.brief}</Markdown>
        </div>
        <div className="shrink-0 border-t border-gray-200 px-4 py-2.5">
          <PrimaryButton className="w-full" onClick={startActive}>
            {cfg.mode === "presentation" ? "Commencer l'exposé →" : "Rejoindre la réunion →"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // Phase active : gros timer + brief (+ prise de parole en mode presentation).
  const remaining = remainingReunionSeconds(
    local.active_started_at,
    Date.now(),
    cfg.timeLimitS,
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-center border-b border-gray-200 bg-gray-50/60 px-4 py-3">
        <CountdownTimer key="active" seconds={remaining} running onExpire={finish} size="lg" />
      </div>
      <div
        className={`shrink-0 overflow-y-auto border-b border-gray-100 px-4 py-3 ${
          cfg.mode === "qa" ? "min-h-0 flex-1 border-b-0" : "max-h-40"
        }`}
      >
        <Markdown>{cfg.brief}</Markdown>
      </div>
      {cfg.mode === "presentation" ? (
        <>
          <textarea
            className="min-h-0 w-full flex-1 resize-none bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none"
            placeholder="Prononcez votre prise de parole… (texte)"
            value={speech}
            onChange={(e) => onSpeechChange(e.target.value)}
            aria-label="Prise de parole"
          />
          <div className="flex shrink-0 justify-end border-t border-gray-200 px-4 py-2.5">
            <PrimaryButton onClick={finish}>Terminer</PrimaryButton>
          </div>
        </>
      ) : (
        <p className="shrink-0 border-t border-gray-100 bg-indigo-50/50 px-4 py-2.5 text-xs text-indigo-900">
          💬 Les questions/réponses se passent dans <strong>Messages</strong> (ou une
          bulle de chat) : le jury vous écrit dans le fil de la réunion.
        </p>
      )}
    </div>
  );
}
