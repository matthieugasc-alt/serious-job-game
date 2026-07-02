"use client";

import type { MechanicModule } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { validateParams } from "./Runtime";
import { ProductionComponent } from "./Component";

export const ProductionMechanic: MechanicModule = {
  manifest,
  validateParams,
  Component: ProductionComponent,
};

export default ProductionMechanic;
