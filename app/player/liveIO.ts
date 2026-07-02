"use client";

/**
 * Implémentation réelle de MechanicIO.
 *
 * Deux routes serveur GÉNÉRIQUES, sans aucun contenu scénario :
 *   POST /api/v2/actor   — fait répondre un acteur (prompt scénario + transcript)
 *   POST /api/v2/observe — observation IA des critères (jamais de décision)
 *
 * record/saveScratch mutent la session en place ; le shell persiste.
 */

import type {
  MechanicIO,
  TranscriptEvent,
  JsonObject,
} from "@/app/lib/engine/mechanics";
import type { StepObservation } from "@/app/lib/engine/criteria";
import {
  recordTranscriptEvent,
  type SessionV2State,
} from "@/app/lib/engine/sessionV2";

export function createLiveIO(opts: {
  session: SessionV2State;
  stepId: string;
  onMutate: () => void;
}): MechanicIO {
  const { session, stepId, onMutate } = opts;

  return {
    async actorRespond({ actor, transcript, directive }) {
      const res = await fetch("/api/v2/actor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_prompt: actor.prompt,
          actor_name: actor.name,
          actor_role: actor.role,
          directive: directive ?? null,
          transcript,
        }),
      });
      if (!res.ok) throw new Error(`actorRespond: HTTP ${res.status}`);
      const data = (await res.json()) as { content: string };
      return data.content;
    },

    async observe({ criteria, transcript, artifacts }) {
      const res = await fetch("/api/v2/observe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria, transcript, artifacts: artifacts ?? null }),
      });
      if (!res.ok) throw new Error(`observe: HTTP ${res.status}`);
      return (await res.json()) as StepObservation;
    },

    record(event: Omit<TranscriptEvent, "at">) {
      recordTranscriptEvent(session, stepId, { ...event, at: Date.now() });
      onMutate();
    },

    saveScratch(scratch: JsonObject) {
      session.scratch[stepId] = scratch;
      onMutate();
    },
  };
}
