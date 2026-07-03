/**
 * Garde-fou des mécaniques HEADLESS v3 (contrat §1 & §4) :
 *  (a) chaque spec.ts est PUR : importable en node, aucun import react,
 *      aucun import de composant (.tsx / Component) ;
 *  (b) MECHANIC_SPECS ↔ schema/mechanics-v3.json synchrones (ids, version,
 *      output_keys, required_params, default_tools ⊆ tools du registre) ;
 *  (c) contrat comportemental minimal : directive() non vide,
 *      validateParams (rejette {} / accepte des params valides),
 *      buildArtifacts / buildOutput purs, output conforme aux output_keys.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import type {
  LoggedAction,
  StepInvocationV3,
  WorkspaceState,
} from "@/app/lib/engine/workspace";
import { MECHANIC_SPECS } from "../specs";

const mechanicsDir = join(__dirname, "..");
const registry = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "schema", "mechanics-v3.json"), "utf8"),
) as {
  tools: string[];
  mechanics: {
    id: string;
    version: string;
    title: string;
    output_keys: string[];
    required_params: string[];
    default_tools: string[];
  }[];
};

/** Params minimaux VALIDES par mécanique (pour le smoke comportemental). */
const VALID_PARAMS: Record<string, JsonObject> = {
  analyse: { instructions: "Analyse les pièces." },
  decision: {
    instructions: "Tranche le scope.",
    options: [
      { id: "a", label: "Option A", description: "…" },
      { id: "b", label: "Option B", description: "…" },
    ],
  },
  negociation: {
    actor_id: "acteur_test",
    instructions: "Négocie le devis.",
    terms: [{ id: "prix", label: "Prix", type: "number", opening: 21000 }],
    directive: "Plancher : 11 000 €.",
  },
  production: { deliverable_type: "mail", instructions: "Rédige le mail." },
};

function makeWorkspace(): WorkspaceState {
  return {
    threads: {
      th_test: {
        thread_id: "th_test",
        participants: ["acteur_test"],
        messages: [
          { at: 1, from: "actor", actor_id: "acteur_test", content: "Bonjour." },
          { at: 2, from: "player", content: "Voici mes conclusions : X, Y, Z." },
        ],
        unread: 0,
      },
    },
    mailbox: { inbox: [], sent: [], drafts: {} },
    documents: { doc_a: { opened: true, annotations: [] } },
    toolStates: {
      notes: { content: "hypothèse : annulations = pain point" },
      contrat: {
        values: { prix: 12000 },
        proposals: [{ at: 3, values: { prix: 14000 } }],
        status: "signed",
      },
    },
    notifications: [],
    stepStartedAt: 0,
    scenarioStartedAt: 0,
  };
}

function makeStep(mechanic: string): StepInvocationV3 {
  return {
    step_id: "s_test",
    mechanic,
    params: VALID_PARAMS[mechanic],
    completion: { trigger: { type: "manual", label: "ok" } },
    evaluation: { observed_criteria: [{ id: "c1", description: "…" }] },
    completion_rules: { required_criteria: ["c1"] },
    document_ids: ["doc_a"],
  };
}

function makeLog(): LoggedAction[] {
  return [
    {
      at: 2,
      step_id: "s_test",
      action: { type: "message_sent", thread_id: "th_test", content: "Voici mes conclusions : X, Y, Z." },
    },
    {
      at: 4,
      step_id: "s_test",
      action: {
        type: "mail_sent",
        to: ["acteur_test"],
        subject: "Cadrage",
        body: "Scope retenu : A + B. Budget : 12 000 €.",
      },
    },
    {
      at: 5,
      step_id: "s_test",
      action: { type: "contract_signed", tool_id: "contrat", terms: { prix: 12000 } },
    },
    {
      at: 6,
      step_id: "autre_step",
      action: { type: "mail_sent", to: ["x"], subject: "hors step", body: "…" },
    },
  ];
}

describe("(a) pureté des specs headless", () => {
  for (const id of Object.keys(MECHANIC_SPECS)) {
    it(`app/mechanics/${id}/spec.ts existe et n'importe ni react ni composant`, () => {
      const file = join(mechanicsDir, id, "spec.ts");
      expect(existsSync(file), `spec.ts manquant pour "${id}"`).toBe(true);
      const src = readFileSync(file, "utf8");
      expect(/from\s+["']react["']|require\(["']react["']\)/.test(src)).toBe(false);
      expect(/from\s+["'][^"']*(Component|\.tsx)["']/.test(src)).toBe(false);
      expect(src.includes('"use client"')).toBe(false);
    });
  }

  it("le helper partagé specHelpers.ts est pur lui aussi", () => {
    const src = readFileSync(join(mechanicsDir, "specHelpers.ts"), "utf8");
    expect(/from\s+["']react["']/.test(src)).toBe(false);
    expect(/\.tsx["']/.test(src)).toBe(false);
  });
});

describe("(b) synchro MECHANIC_SPECS ↔ schema/mechanics-v3.json", () => {
  const fromSchema = Object.fromEntries(registry.mechanics.map((m) => [m.id, m]));

  it("mêmes mécaniques des deux côtés", () => {
    expect(Object.keys(MECHANIC_SPECS).sort()).toEqual(Object.keys(fromSchema).sort());
  });

  for (const [id, spec] of Object.entries(MECHANIC_SPECS)) {
    it(`${id} : manifest synchrone avec le schéma`, () => {
      const s = fromSchema[id];
      expect(spec.manifest.id).toBe(id);
      expect(spec.manifest.version).toBe(s.version);
      expect(spec.manifest.title).toBe(s.title);
      expect([...spec.manifest.output_keys].sort()).toEqual([...s.output_keys].sort());
      expect([...spec.manifest.required_params].sort()).toEqual(
        [...s.required_params].sort(),
      );
      expect([...spec.manifest.default_tools].sort()).toEqual(
        [...s.default_tools].sort(),
      );
      for (const tool of spec.manifest.default_tools) {
        expect(registry.tools, `default_tool inconnu "${tool}"`).toContain(tool);
      }
    });
  }
});

describe("(c) contrat comportemental minimal", () => {
  for (const [id, spec] of Object.entries(MECHANIC_SPECS)) {
    it(`${id} : directive/validateParams/buildArtifacts/buildOutput`, () => {
      const params = VALID_PARAMS[id];
      expect(params, `VALID_PARAMS manquant pour "${id}"`).toBeDefined();

      // validateParams : {} refusé, params valides acceptés.
      expect(spec.validateParams({}).length).toBeGreaterThan(0);
      expect(spec.validateParams(params)).toEqual([]);

      // directive : cadrage non vide, jamais de throw.
      const directive = spec.directive(params);
      expect(typeof directive).toBe("string");
      expect(directive.length).toBeGreaterThan(10);

      // buildArtifacts / buildOutput : purs (l'état n'est pas muté).
      const ws = makeWorkspace();
      const step = makeStep(id);
      const log = makeLog();
      const snapshot = JSON.stringify(ws);

      const artifacts = spec.buildArtifacts(ws, step, log);
      expect(artifacts && typeof artifacts).toBe("object");

      const output = spec.buildOutput(ws, step, { criteria: { c1: true } }, log);
      for (const key of spec.manifest.output_keys) {
        expect(output[key], `${id} : output_key "${key}" absente`).not.toBeUndefined();
      }
      expect(JSON.stringify(ws), `${id} : buildArtifacts/buildOutput a muté l'état`).toBe(
        snapshot,
      );
    });
  }

  it("negociation : l'agreement reflète le journal (contract_signed.terms fait foi)", () => {
    const spec = MECHANIC_SPECS.negociation;
    const output = spec.buildOutput(
      makeWorkspace(),
      makeStep("negociation"),
      { criteria: {} },
      makeLog(),
    );
    expect(output.agreement).toEqual({ concluded: true, terms: { prix: 12000 } });
    expect(output.proposals_count).toBe(1);
  });

  it("production : le livrable est le dernier mail envoyé au destinataire", () => {
    const spec = MECHANIC_SPECS.production;
    const step = makeStep("production");
    step.params = { ...step.params, recipient_actor: "acteur_test" };
    const output = spec.buildOutput(makeWorkspace(), step, { criteria: {} }, makeLog());
    expect(output.body).toContain("Scope retenu");
    expect((output.deliverable as JsonObject).subject).toBe("Cadrage");
  });
});
