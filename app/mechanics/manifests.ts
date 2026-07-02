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

export const MECHANIC_MANIFESTS: Record<string, MechanicManifest> = {
  [noop.id]: noop,
};
