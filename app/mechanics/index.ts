/**
 * MECHANIC_MODULES — registre des modules complets (React, client-only).
 * Le Shell résout la mécanique d'un step ici. Toute mécanique présente
 * dans MECHANIC_MANIFESTS doit l'être ici (garde-fou automatique).
 */

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import NoopMechanic from "./_noop";
import EntretienMechanic from "./entretien";
import QaMechanic from "./qa";
import PresentationMechanic from "./presentation";
import AnalyseMechanic from "./analyse";
import ProductionMechanic from "./production";
import DecisionMechanic from "./decision";
import NegociationMechanic from "./negociation";
import DiagnosticMechanic from "./diagnostic";
import FeedbackMechanic from "./feedback";
import FormationMechanic from "./formation";
import MediationMechanic from "./mediation";

export const MECHANIC_MODULES: Record<string, MechanicModule> = {
  [NoopMechanic.manifest.id]: NoopMechanic,
  [EntretienMechanic.manifest.id]: EntretienMechanic,
  [QaMechanic.manifest.id]: QaMechanic,
  [PresentationMechanic.manifest.id]: PresentationMechanic,
  [AnalyseMechanic.manifest.id]: AnalyseMechanic,
  [ProductionMechanic.manifest.id]: ProductionMechanic,
  [DecisionMechanic.manifest.id]: DecisionMechanic,
  [NegociationMechanic.manifest.id]: NegociationMechanic,
  [DiagnosticMechanic.manifest.id]: DiagnosticMechanic,
  [FeedbackMechanic.manifest.id]: FeedbackMechanic,
  [FormationMechanic.manifest.id]: FormationMechanic,
  [MediationMechanic.manifest.id]: MediationMechanic,
};

export { MECHANIC_MANIFESTS } from "./manifests";
