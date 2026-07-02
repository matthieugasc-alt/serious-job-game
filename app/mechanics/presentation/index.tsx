"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { PresentationComponent } from "./Component";
import { validateParams } from "./Runtime";

export const PresentationMechanic: MechanicModule = {
  manifest,
  Component: PresentationComponent,
  validateParams,
};

export default PresentationMechanic;
