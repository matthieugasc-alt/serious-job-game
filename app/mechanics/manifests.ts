/**
 * MECHANIC_REGISTRY — source de vérité des manifests (pur, node-safe).
 *
 * Règle : une mécanique = un dossier app/mechanics/<id>/ avec
 * manifest.ts (pur) + index.tsx (module React). Ce fichier importe
 * chaque manifest ; le garde-fou registry.gardefou.test.ts vérifie
 * la triple cohérence dossiers ↔ manifests ↔ schema/mechanics.json.
 */

import type { MechanicManifest } from "@/app/lib/engine/mechanics";
import { manifest as noop } from "./_noop/manifest";
import { manifest as entretien } from "./entretien/manifest";
import { manifest as qa } from "./qa/manifest";
import { manifest as presentation } from "./presentation/manifest";
import { manifest as analyse } from "./analyse/manifest";
import { manifest as production } from "./production/manifest";
import { manifest as decision } from "./decision/manifest";
import { manifest as negociation } from "./negociation/manifest";
import { manifest as diagnostic } from "./diagnostic/manifest";
import { manifest as feedback } from "./feedback/manifest";
import { manifest as formation } from "./formation/manifest";
import { manifest as mediation } from "./mediation/manifest";

export const MECHANIC_MANIFESTS: Record<string, MechanicManifest> = {
  [noop.id]: noop,
  [entretien.id]: entretien,
  [qa.id]: qa,
  [presentation.id]: presentation,
  [analyse.id]: analyse,
  [production.id]: production,
  [decision.id]: decision,
  [negociation.id]: negociation,
  [diagnostic.id]: diagnostic,
  [feedback.id]: feedback,
  [formation.id]: formation,
  [mediation.id]: mediation,
};
