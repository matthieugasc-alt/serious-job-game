/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v2 — ScenarioComposer : lecture et validation d'un scénario,
 * résolution des inputs entre steps
 * ═════════════════════════════════════════════════════════════════
 *
 * Le composer est la SEULE couche qui comprend le JSON scénario v2.
 * Il ne connaît aucune mécanique concrète : il travaille contre les
 * manifests (contrats), jamais contre les implémentations.
 */

import type {
  ScenarioV2,
  StepInvocation,
  MechanicManifest,
  JsonObject,
  Json,
} from "./mechanics";
import type { SessionV2State } from "./sessionV2";

export interface ComposerIssue {
  code:
    | "UNKNOWN_MECHANIC"
    | "DUPLICATE_STEP_ID"
    | "MISSING_PARAM"
    | "BAD_INPUT_REF"
    | "INPUT_REF_FORWARD"
    | "UNKNOWN_OUTPUT_KEY"
    | "UNKNOWN_ACTOR_REF"
    | "NO_CRITERIA"
    | "NO_COMPLETION_RULE"
    | "UNKNOWN_REQUIRED_CRITERION"
    | "BAD_ENDINGS";
  stepId?: string;
  message: string;
}

/**
 * Garde-fou statique complet d'un scénario v2 contre les manifests.
 * Utilisé par validate:scenarios:v2 ET par le Shell au chargement.
 */
export function validateScenarioV2(
  scenario: ScenarioV2,
  manifests: Record<string, MechanicManifest>,
): ComposerIssue[] {
  const issues: ComposerIssue[] = [];
  const seenSteps = new Map<string, StepInvocation>();
  const actorIds = new Set(scenario.actors.map((a) => a.actor_id));

  for (const step of scenario.sequence) {
    if (seenSteps.has(step.step_id)) {
      issues.push({
        code: "DUPLICATE_STEP_ID",
        stepId: step.step_id,
        message: `step_id dupliqué : ${step.step_id}`,
      });
    }

    const manifest = manifests[step.mechanic];
    if (!manifest) {
      issues.push({
        code: "UNKNOWN_MECHANIC",
        stepId: step.step_id,
        message: `Mécanique inconnue : "${step.mechanic}". Disponibles : ${Object.keys(manifests).join(", ")}`,
      });
      seenSteps.set(step.step_id, step);
      continue;
    }

    for (const key of manifest.required_params) {
      if (step.params?.[key] === undefined) {
        issues.push({
          code: "MISSING_PARAM",
          stepId: step.step_id,
          message: `Param requis manquant pour ${step.mechanic} : "${key}"`,
        });
      }
    }

    // Convention : tout param nommé *_actor / actor_id référence un acteur déclaré.
    for (const [k, v] of Object.entries(step.params ?? {})) {
      if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string") {
        if (!actorIds.has(v)) {
          issues.push({
            code: "UNKNOWN_ACTOR_REF",
            stepId: step.step_id,
            message: `params.${k} référence un acteur inconnu : "${v}"`,
          });
        }
      }
    }

    // inputs : { alias: "stepId" | "stepId.outputKey" } — steps précédents uniquement.
    for (const [alias, ref] of Object.entries(step.inputs ?? {})) {
      const [srcId, key, ...rest] = ref.split(".");
      const src = seenSteps.get(srcId);
      if (rest.length > 0) {
        issues.push({
          code: "BAD_INPUT_REF",
          stepId: step.step_id,
          message: `inputs.${alias} : référence invalide "${ref}" (format attendu : "stepId" ou "stepId.cle")`,
        });
      } else if (!src) {
        const existsLater = scenario.sequence.some((s) => s.step_id === srcId);
        issues.push({
          code: existsLater ? "INPUT_REF_FORWARD" : "BAD_INPUT_REF",
          stepId: step.step_id,
          message: existsLater
            ? `inputs.${alias} : "${srcId}" est déclaré APRÈS ce step — un input ne peut venir que d'un step précédent`
            : `inputs.${alias} : step source inconnu "${srcId}"`,
        });
      } else if (key !== undefined) {
        const srcManifest = manifests[src.mechanic];
        if (srcManifest && !srcManifest.output_keys.includes(key)) {
          issues.push({
            code: "UNKNOWN_OUTPUT_KEY",
            stepId: step.step_id,
            message: `inputs.${alias} : "${key}" n'est pas une clé d'output de ${src.mechanic} (clés : ${srcManifest.output_keys.join(", ")})`,
          });
        }
      }
    }

    // Évaluation : le contrat IA-observe/moteur-décide est obligatoire.
    const criteria = step.evaluation?.observed_criteria ?? [];
    if (criteria.length === 0) {
      issues.push({
        code: "NO_CRITERIA",
        stepId: step.step_id,
        message: "Aucun observed_criteria déclaré — le moteur ne pourra pas décider.",
      });
    }
    const rules = step.completion_rules ?? {};
    const hasRule =
      (rules.required_criteria?.length ?? 0) > 0 ||
      (typeof rules.min_criteria_count === "number" &&
        rules.min_criteria_count > 0);
    if (!hasRule) {
      issues.push({
        code: "NO_COMPLETION_RULE",
        stepId: step.step_id,
        message:
          "Aucune completion_rule (required_criteria ou min_criteria_count).",
      });
    }
    const criterionIds = new Set(criteria.map((c) => c.id));
    for (const id of rules.required_criteria ?? []) {
      if (!criterionIds.has(id)) {
        issues.push({
          code: "UNKNOWN_REQUIRED_CRITERION",
          stepId: step.step_id,
          message: `required_criteria référence un critère non déclaré : "${id}"`,
        });
      }
    }

    seenSteps.set(step.step_id, step);
  }

  const defaults = scenario.endings.filter((e) => e.default).length;
  if (scenario.endings.length === 0 || defaults !== 1) {
    issues.push({
      code: "BAD_ENDINGS",
      message: `endings : exactement un ending "default: true" requis (trouvé : ${defaults}).`,
    });
  }
  const stepIds = new Set(scenario.sequence.map((s) => s.step_id));
  for (const e of scenario.endings) {
    for (const id of e.requires_passed ?? []) {
      if (!stepIds.has(id)) {
        issues.push({
          code: "BAD_ENDINGS",
          message: `ending "${e.id}" : requires_passed référence un step inconnu "${id}"`,
        });
      }
    }
  }

  return issues;
}

/**
 * Résout les inputs déclarés d'un step depuis les outputs des steps
 * précédents. Runtime-strict : une référence irrésoluble throw —
 * c'est un bug de scénario que la validation aurait dû attraper.
 */
export function resolveStepInputs(
  session: SessionV2State,
  step: StepInvocation,
): JsonObject {
  const resolved: JsonObject = {};
  for (const [alias, ref] of Object.entries(step.inputs ?? {})) {
    const [srcId, key] = ref.split(".");
    const src = session.stepResults[srcId];
    if (!src) {
      throw new Error(
        `Step ${step.step_id} : input "${alias}" référence "${srcId}" qui n'a pas encore produit d'output.`,
      );
    }
    if (key === undefined) {
      resolved[alias] = src.output;
    } else {
      const value: Json | undefined = src.output[key];
      if (value === undefined) {
        throw new Error(
          `Step ${step.step_id} : input "${alias}" — clé "${key}" absente de l'output de "${srcId}".`,
        );
      }
      resolved[alias] = value;
    }
  }
  return resolved;
}
