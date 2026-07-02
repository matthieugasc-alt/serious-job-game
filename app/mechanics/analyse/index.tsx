"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { validateParams } from "./Runtime";
import { AnalyseComponent } from "./Component";

export const AnalyseMechanic: MechanicModule = {
  manifest,
  validateParams,
  Component: AnalyseComponent,
};

export default AnalyseMechanic;
