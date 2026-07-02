"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { validateParams } from "./Runtime";
import { DecisionComponent } from "./Component";

export const DecisionMechanic: MechanicModule = {
  manifest,
  validateParams,
  Component: DecisionComponent,
};

export default DecisionMechanic;
