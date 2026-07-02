/**
 * MECHANIC_MODULES — registre des modules complets (React, client-only).
 * Le Shell résout la mécanique d'un step ici. Toute mécanique présente
 * dans MECHANIC_MANIFESTS doit l'être ici (garde-fou automatique).
 */

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import NoopMechanic from "./_noop";

export const MECHANIC_MODULES: Record<string, MechanicModule> = {
  [NoopMechanic.manifest.id]: NoopMechanic,
};

export { MECHANIC_MANIFESTS } from "./manifests";
