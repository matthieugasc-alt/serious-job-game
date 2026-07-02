"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { EntretienComponent } from "./Component";
import { validateParams } from "./Runtime";

export const EntretienMechanic: MechanicModule = {
  manifest,
  Component: EntretienComponent,
  validateParams,
};

export default EntretienMechanic;
