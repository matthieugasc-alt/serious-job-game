"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { FeedbackComponent } from "./Component";
import { validateParams } from "./Runtime";

export const FeedbackMechanic: MechanicModule = {
  manifest,
  Component: FeedbackComponent,
  validateParams,
};

export default FeedbackMechanic;
