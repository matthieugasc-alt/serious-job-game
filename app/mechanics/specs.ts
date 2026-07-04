/**
 * MECHANIC_SPECS — registre des mécaniques HEADLESS v3 (workspace).
 * Même pattern garde-fou que MECHANIC_MANIFESTS (v2) : toute mécanique v3
 * ajoutée sans être enregistrée ici + dans schema/mechanics-v3.json casse
 * le test app/mechanics/__tests__/specs.headless.test.ts.
 *
 * Ne PAS confondre avec app/mechanics/index.ts (registre v2 UI, intact
 * jusqu'au jalon 3) : ce module est PUR (importable en node, zéro React).
 */

import type { MechanicSpec, MechanicSpecManifest } from "@/app/lib/engine/workspace";
import { analyseSpec } from "./analyse/spec";
import { decisionSpec } from "./decision/spec";
import { diagnosticSpec } from "./diagnostic/spec";
import { entretienSpec } from "./entretien/spec";
import { feedbackSpec } from "./feedback/spec";
import { formationSpec } from "./formation/spec";
import { mediationSpec } from "./mediation/spec";
import { negociationSpec } from "./negociation/spec";
import { presentationSpec } from "./presentation/spec";
import { productionSpec } from "./production/spec";
import { qaSpec } from "./qa/spec";

export const MECHANIC_SPECS: Record<string, MechanicSpec> = {
  [analyseSpec.manifest.id]: analyseSpec,
  [decisionSpec.manifest.id]: decisionSpec,
  [diagnosticSpec.manifest.id]: diagnosticSpec,
  [entretienSpec.manifest.id]: entretienSpec,
  [feedbackSpec.manifest.id]: feedbackSpec,
  [formationSpec.manifest.id]: formationSpec,
  [mediationSpec.manifest.id]: mediationSpec,
  [negociationSpec.manifest.id]: negociationSpec,
  [presentationSpec.manifest.id]: presentationSpec,
  [productionSpec.manifest.id]: productionSpec,
  [qaSpec.manifest.id]: qaSpec,
};

/** Manifests seuls — l'entrée attendue par validateScenarioV3. */
export const MECHANIC_SPEC_MANIFESTS: Record<string, MechanicSpecManifest> =
  Object.fromEntries(
    Object.values(MECHANIC_SPECS).map((s) => [s.manifest.id, s.manifest]),
  );
