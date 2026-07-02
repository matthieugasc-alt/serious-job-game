"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { DiagnosticComponent } from "./Component";
import { validateParams } from "./Runtime";

export const DiagnosticMechanic: MechanicModule = {
  manifest,
  Component: DiagnosticComponent,
  validateParams,
};

export default DiagnosticMechanic;
