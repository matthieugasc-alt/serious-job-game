"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { FormationComponent } from "./Component";
import { validateParams } from "./Runtime";

export const FormationMechanic: MechanicModule = {
  manifest,
  Component: FormationComponent,
  validateParams,
};

export default FormationMechanic;
