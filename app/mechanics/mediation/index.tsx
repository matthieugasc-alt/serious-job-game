"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { MediationComponent } from "./Component";
import { validateParams } from "./Runtime";

export const MediationMechanic: MechanicModule = {
  manifest,
  Component: MediationComponent,
  validateParams,
};

export default MediationMechanic;
