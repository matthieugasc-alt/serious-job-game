"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { QaComponent } from "./Component";
import { validateParams } from "./Runtime";

export const QaMechanic: MechanicModule = {
  manifest,
  Component: QaComponent,
  validateParams,
};

export default QaMechanic;
