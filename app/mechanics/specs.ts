/**
 * MECHANIC_SPECS — registre des mécaniques HEADLESS v3 (workspace).
 * Garde-fou : toute mécanique v3 ajoutée sans être enregistrée ici +
 * dans schema/mechanics-v3.json casse le test
 * app/mechanics/__tests__/specs.headless.test.ts.
 *
 * Ce module est PUR (importable en node, zéro React) — le même test
 * interdit tout .tsx sous app/mechanics/ (l'UI vit dans app/workspace/).
 */

import type { MechanicSpec, MechanicSpecManifest } from "@/app/lib/engine/workspace";
import { analyseSpec } from "./analyse/spec";
import { debatSpec } from "./debat/spec";
import { decisionSpec } from "./decision/spec";
import { diagnosticSpec } from "./diagnostic/spec";
import { entretienSpec } from "./entretien/spec";
import { facilitationSpec } from "./facilitation/spec";
import { feedbackSpec } from "./feedback/spec";
import { formationSpec } from "./formation/spec";
import { mediationSpec } from "./mediation/spec";
import { negociationSpec } from "./negociation/spec";
import { planificationSpec } from "./planification/spec";
import { presentationSpec } from "./presentation/spec";
import { productionSpec } from "./production/spec";
import { qaSpec } from "./qa/spec";

export const MECHANIC_SPECS: Record<string, MechanicSpec> = {
  [analyseSpec.manifest.id]: analyseSpec,
  [debatSpec.manifest.id]: debatSpec,
  [decisionSpec.manifest.id]: decisionSpec,
  [diagnosticSpec.manifest.id]: diagnosticSpec,
  [entretienSpec.manifest.id]: entretienSpec,
  [facilitationSpec.manifest.id]: facilitationSpec,
  [feedbackSpec.manifest.id]: feedbackSpec,
  [formationSpec.manifest.id]: formationSpec,
  [mediationSpec.manifest.id]: mediationSpec,
  [negociationSpec.manifest.id]: negociationSpec,
  [planificationSpec.manifest.id]: planificationSpec,
  [presentationSpec.manifest.id]: presentationSpec,
  [productionSpec.manifest.id]: productionSpec,
  [qaSpec.manifest.id]: qaSpec,
};

/** Manifests seuls — l'entrée attendue par validateScenarioV3. */
export const MECHANIC_SPEC_MANIFESTS: Record<string, MechanicSpecManifest> =
  Object.fromEntries(
    Object.values(MECHANIC_SPECS).map((s) => [s.manifest.id, s.manifest]),
  );
