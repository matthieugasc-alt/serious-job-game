"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { validateParams } from "./Runtime";
import { NegociationComponent } from "./Component";

export const NegociationMechanic: MechanicModule = {
  manifest,
  validateParams,
  Component: NegociationComponent,
};

export default NegociationMechanic;
