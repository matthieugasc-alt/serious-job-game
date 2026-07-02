"use client";

import type { MechanicModule, JsonObject } from "@/app/lib/engine/mechanics";
import { manifest } from "./manifest";
import { buildNoopResult } from "./Runtime";

export const NoopMechanic: MechanicModule = {
  manifest,
  validateParams(params: JsonObject): string[] {
    return typeof params.echo === "string"
      ? []
      : ['params.echo doit être une string'];
  },
  Component: ({ context, onComplete }) => (
    <div className="p-8 text-center">
      <p className="text-sm opacity-60">Mécanique de test — {context.stepId}</p>
      <button
        className="mt-4 rounded bg-black px-4 py-2 text-white"
        onClick={() =>
          onComplete(
            buildNoopResult({
              params: context.params,
              inputs: context.inputs,
              criteria: context.criteria,
            }),
          )
        }
      >
        Terminer le step
      </button>
    </div>
  ),
};

export default NoopMechanic;
