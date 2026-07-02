"use client";

/**
 * MechanicRunner — charge UNE mécanique, lui fournit son contexte et
 * ses I/O, récupère son résultat. C'est la seule frontière entre le
 * shell générique et les mécaniques. ~100 lignes, aucune connaissance
 * métier.
 */

import { useMemo } from "react";
import type {
  MechanicModule,
  MechanicContext,
  MechanicResult,
  MechanicIO,
  StepInvocation,
  JsonObject,
  TranscriptEvent,
  ScenarioV2,
} from "@/app/lib/engine/mechanics";
import type { SessionV2State } from "@/app/lib/engine/sessionV2";
import { resolveStepInputs } from "@/app/lib/engine/composer";

interface Props {
  module: MechanicModule;
  scenario: ScenarioV2;
  session: SessionV2State;
  step: StepInvocation;
  /** I/O réelles (API IA) ou mockées (tests, storybook). */
  io: MechanicIO;
  onComplete: (result: MechanicResult) => void;
}

export function MechanicRunner({
  module,
  scenario,
  session,
  step,
  io,
  onComplete,
}: Props) {
  const context: MechanicContext = useMemo(() => {
    const visibleActorIds = collectActorRefs(step.params);
    return {
      scenarioId: scenario.scenario_id,
      stepId: step.step_id,
      params: step.params,
      actors:
        visibleActorIds.length > 0
          ? scenario.actors.filter((a) => visibleActorIds.includes(a.actor_id))
          : scenario.actors,
      documents: filterDocuments(scenario, step.params),
      inputs: resolveStepInputs(session, step),
      criteria: step.evaluation.observed_criteria,
      transcript: session.transcripts[step.step_id] ?? [],
      scratch: session.scratch[step.step_id] ?? {},
      timeLimitS: step.time_limit_s,
      io,
    };
    // La session est mutée en place par le shell ; le step identifie le contexte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.step_id, module.manifest.id]);

  const Component = module.Component;
  return <Component context={context} onComplete={onComplete} />;
}

/** Convention composer : params.actor_id et params.*_actor désignent des acteurs. */
function collectActorRefs(params: JsonObject): string[] {
  const refs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string") {
      refs.push(v);
    }
  }
  return refs;
}

/** params.document_ids restreint les documents visibles pour le step. */
function filterDocuments(scenario: ScenarioV2, params: JsonObject) {
  const ids = Array.isArray(params.document_ids)
    ? (params.document_ids as string[])
    : null;
  if (!ids) return scenario.documents;
  return scenario.documents.filter((d) => ids.includes(d.id));
}

export type { TranscriptEvent };
