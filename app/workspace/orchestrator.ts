/**
 * Orchestrateur v3 — exécute les PendingEffect rendus par le moteur
 * (workspaceReducer) : I/O IA (/api/v2/actor, /api/v2/observe), verdicts
 * (completeStepV3 + buildOutput des specs headless), réinjection via
 * recordActorMessage / recordStepObservation / applyNarrativeEffect.
 *
 * Le moteur REND des effets, ce module les EXÉCUTE — aucune règle de jeu
 * ici. Pas de React : WorkspacePlayer (client) fournit les hooks.
 *
 * Concurrence : les effets s'exécutent séquentiellement (WorkspacePlayer
 * chaîne les lots) et relisent la session via getSession() après chaque
 * await — un dispatch pendant un appel IA ne perd donc pas la réponse.
 */

import type { StepObservation } from "@/app/lib/engine/criteria";
import type { ActorDef, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  PendingEffect,
  StepInvocationV3,
  Thread,
} from "@/app/lib/engine/workspace";
import type { SessionV3State } from "@/app/lib/engine/sessionV3";
import { getCurrentStepV3 } from "@/app/lib/engine/sessionV3";
import {
  applyNarrativeEffect,
  completeStepV3,
  recordActorMessage,
  recordStepObservation,
} from "@/app/lib/engine/workspaceReducer";
import { MECHANIC_SPECS } from "@/app/mechanics/specs";

export interface OrchestratorHooks {
  /** Après chaque mutation de session : re-render + persistance. */
  onMutate: () => void;
  /** Indicateur de frappe d'un fil (actor_reply en cours). */
  onThreadBusy: (threadId: string, busy: boolean) => void;
}

const OPTS = { specs: MECHANIC_SPECS };
/** Garde anti-boucle : un lot d'effets ne peut pas en engendrer à l'infini. */
const MAX_EFFECTS_PER_BATCH = 24;

// ─── Transcripts (contrats des routes /api/v2/actor et observe) ────

interface TranscriptEventBody {
  channel: string;
  role: "player" | "actor" | "system";
  actor_id?: string;
  content: string;
}

function threadTranscript(thread: Thread): TranscriptEventBody[] {
  return thread.messages.map((m) => ({
    channel: "chat",
    role: m.from === "player" ? "player" : "actor",
    actor_id: m.actor_id,
    content: m.content,
  }));
}

/** Tout ce qui s'est dit/envoyé depuis le début du step, trié. */
function stepTranscript(session: SessionV3State): TranscriptEventBody[] {
  const ws = session.workspace;
  const since = ws.stepStartedAt;
  const events: (TranscriptEventBody & { at: number })[] = [];
  for (const thread of Object.values(ws.threads)) {
    for (const m of thread.messages) {
      if (m.at < since) continue;
      events.push({
        at: m.at,
        channel: "chat",
        role: m.from === "player" ? "player" : "actor",
        actor_id: m.actor_id,
        content: m.content,
      });
    }
  }
  for (const mail of ws.mailbox.sent) {
    if (mail.at < since) continue;
    events.push({
      at: mail.at,
      channel: "mail",
      role: "player",
      content: `À : ${mail.to.join(", ")}\nObjet : ${mail.subject}\n\n${mail.body}`,
    });
  }
  for (const mail of ws.mailbox.inbox) {
    if (mail.at < since) continue;
    events.push({
      at: mail.at,
      channel: "mail",
      role: "actor",
      actor_id: mail.from,
      content: `Objet : ${mail.subject}\n\n${mail.body}`,
    });
  }
  return events
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const { at, ...rest } = e;
      void at;
      return rest;
    });
}

// ─── Appels IA ──────────────────────────────────────────────────────

async function callActor(
  actor: ActorDef,
  transcript: TranscriptEventBody[],
  directive?: string,
): Promise<string> {
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
  if (!res.ok) throw new Error(`actor: HTTP ${res.status}`);
  return ((await res.json()) as { content: string }).content;
}

/** Observation fraîche du step courant : critères déclarés + artefacts
 *  de la spec headless (buildArtifacts) + transcript pertinent. */
async function observeStep(
  session: SessionV3State,
  step: StepInvocationV3,
): Promise<StepObservation> {
  const spec = MECHANIC_SPECS[step.mechanic];
  const artifacts = spec
    ? spec.buildArtifacts(session.workspace, step, session.actionLog)
    : null;
  const res = await fetch("/api/v2/observe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      criteria: step.evaluation.observed_criteria,
      transcript: stepTranscript(session),
      artifacts,
    }),
  });
  if (!res.ok) throw new Error(`observe: HTTP ${res.status}`);
  return (await res.json()) as StepObservation;
}

// ─── Boucle d'exécution ─────────────────────────────────────────────

/**
 * Exécute un lot d'effets (et ceux qu'ils engendrent) séquentiellement.
 * Dédoublonne observe_step/evaluate_step (une seule observation à la fois,
 * evaluate absorbe observe). Ne throw jamais : un échec IA laisse le step
 * ouvert et notifie via onMutate (l'état reste cohérent, le joueur rejoue).
 */
export async function runPendingEffects(
  getSession: () => SessionV3State | null,
  initial: PendingEffect[],
  hooks: OrchestratorHooks,
): Promise<void> {
  const queue: PendingEffect[] = [...initial];
  let executed = 0;

  while (queue.length > 0) {
    const session = getSession();
    if (!session || session.isFinished) break;
    if (++executed > MAX_EFFECTS_PER_BATCH) break; // défensif

    const effect = queue.shift()!;
    // evaluate_step observe déjà : les observe_step en attente sont couverts.
    if (
      effect.kind === "observe_step" &&
      queue.some((e) => e.kind === "evaluate_step" || e.kind === "observe_step")
    ) {
      continue;
    }

    try {
      const produced = await executeEffect(session, effect, hooks, getSession);
      queue.push(...produced);
    } catch {
      // Échec I/O : rien n'avance (sémantique stricte), le joueur peut rejouer.
    }
    hooks.onMutate();
  }
}

async function executeEffect(
  session: SessionV3State,
  effect: PendingEffect,
  hooks: OrchestratorHooks,
  getSession: () => SessionV3State | null,
): Promise<PendingEffect[]> {
  switch (effect.kind) {
    case "actor_reply": {
      const actor = session.scenario.actors.find((a) => a.actor_id === effect.actor_id);
      const thread = session.workspace.threads[effect.thread_id];
      if (!actor || !thread) return [];
      hooks.onThreadBusy(effect.thread_id, true);
      try {
        const content = await callActor(actor, threadTranscript(thread), effect.directive);
        const current = getSession();
        if (!current || current.isFinished || content.trim().length === 0) return [];
        return recordActorMessage(current, effect.thread_id, effect.actor_id, content).effects;
      } finally {
        hooks.onThreadBusy(effect.thread_id, false);
      }
    }

    case "mail_incoming":
      return applyNarrativeEffect(session, {
        type: "mail_received",
        from_actor: effect.from_actor,
        subject: effect.subject,
        body: effect.body,
        attachment_document_ids: effect.attachment_document_ids,
      }).effects;

    case "observe_step": {
      const step = getCurrentStepV3(session);
      if (!step) return [];
      const observation = await observeStep(session, step);
      const current = getSession();
      if (!current || current.isFinished) return [];
      return recordStepObservation(current, observation).effects;
    }

    case "evaluate_step": {
      const step = getCurrentStepV3(session);
      if (!step) return [];
      // Observation FRAÎCHE puis verdict moteur (retry diégétique inclus).
      const observation = await observeStep(session, step);
      const current = getSession();
      if (!current || current.isFinished) return [];
      const spec = MECHANIC_SPECS[step.mechanic];
      const output: JsonObject = spec
        ? spec.buildOutput(current.workspace, step, observation, current.actionLog)
        : {};
      return completeStepV3(current, observation, output, OPTS).effects;
    }
  }
}

// ─── Fin de partie (même flux que PlayerClient v2) ──────────────────

/** Payload de POST /api/v2/complete — même forme que le player v2. */
export function buildCompletionPayload(
  session: SessionV3State,
  campaignId: string | null,
): JsonObject {
  return {
    scenario_id: session.scenarioId,
    campaign_id: campaignId,
    ending_id: session.ending?.id ?? null,
    finished_at: new Date().toISOString(),
    duration_min: Math.max(0, Math.round((Date.now() - session.realStartTime) / 60000)),
    step_results: Object.values(session.stepResults).map((r) => ({
      step_id: r.stepId,
      mechanic: r.mechanic,
      passed: r.passed,
      attempts: r.attempts,
      applied_rule: r.evaluation.appliedRule,
      matched: r.evaluation.matched,
      missing: r.evaluation.missing,
      critical_failures: r.evaluation.criticalFailures,
      bonus_matched: r.evaluation.bonusMatched,
      output: r.output,
    })) as unknown as JsonObject[],
  };
}
