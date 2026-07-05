/**
 * Feature « joindre un artefact à un mail » — sérialisation, lien
 * interne, action reducer, et injection dans l'analyse (specHelpers).
 */

import { describe, it, expect } from "vitest";
import type { Json } from "@/app/lib/engine/mechanics";
import {
  buildArtifactHref,
  parseArtifactHref,
  artifactLinkMarkdown,
} from "@/app/lib/engine/artifactLink";
import type { ArtifactRef } from "@/app/lib/engine/workspace";
import { serializeArtifact } from "../serialize";

// ─── États de Tool minimaux (les sélecteurs normalisent) ──────────

const notebook: Json = {
  notes: {
    n1: {
      id: "n1",
      title: "Plan de lancement",
      blocks: [
        { id: "b1", kind: "heading1", text: "Objectif" },
        {
          id: "b2",
          kind: "bullet",
          text: "Étape A",
          children: [{ id: "b3", kind: "todo", text: "sous-tâche", checked: true }],
        },
      ],
      tags: ["plan"],
      created_at: 0,
      updated_at: 0,
    },
  },
  tasks: {},
  tagIndex: {},
  order: ["n1"],
};

const decisionEngine: Json = {
  decisions: {
    d1: {
      id: "d1",
      title: "Choix du fournisseur",
      context: "Deux candidats.",
      options: [{ id: "o1", label: "Alpha", links: [] }],
      criteria: [{ id: "c1", label: "Coût", weight: 2 }],
      scores: { o1: { c1: { value: 4, justification: "moins cher" } } },
      hypotheses: [],
      risks: [
        {
          id: "r1",
          label: "Rupture d'appro",
          probability: 3,
          impact: 4,
          prevention: "double sourcing",
          status: "open",
          links: [],
        },
      ],
      sources: [],
      status: "draft",
      board_ids: [],
      created_at: 0,
      updated_at: 0,
    },
  },
  boards: {
    bd1: {
      id: "bd1",
      title: "Roadmap",
      engine: "kanban",
      config: {},
      data: { items: [{ id: "i1", label: "Livrer OAuth", fields: {}, tags: [], links: [], status: "todo" }] },
      created_at: 0,
      updated_at: 0,
    },
  },
  dependencies: [],
};

const whiteboard: Json = {
  notes: {
    s1: { id: "s1", text: "Idée 1", color: "yellow", x: 0, y: 0, author: "player", created_at: 0, updated_at: 0 },
  },
};

describe("artifactLink — schéma d'URL interne", () => {
  it("round-trip build → parse", () => {
    const ref: ArtifactRef = { tool: "decision-engine", id: "bd1", kind: "board", title: "Roadmap" };
    const parsed = parseArtifactHref(buildArtifactHref(ref));
    expect(parsed).toEqual({ tool: "decision-engine", id: "bd1", kind: "board" });
  });

  it("ignore les liens non-artefact", () => {
    expect(parseArtifactHref("https://exemple.fr")).toBeNull();
    expect(parseArtifactHref("mailto:x@y.z")).toBeNull();
  });

  it("le lien markdown contient le titre et le href", () => {
    const md = artifactLinkMarkdown({ tool: "bloc-notes", id: "n1", kind: "note", title: "Plan" });
    expect(md).toContain("[📎 Plan]");
    expect(md).toContain("artifact://bloc-notes/n1?kind=note");
  });
});

describe("serializeArtifact — snapshot exhaustif par type", () => {
  it("note : titre, tags, hiérarchie de blocs, cases à cocher", () => {
    const s = serializeArtifact("bloc-notes", "note", notebook, "n1")!;
    expect(s).toContain("Plan de lancement");
    expect(s).toContain("# Objectif");
    expect(s).toContain("- Étape A");
    expect(s).toContain("[x] sous-tâche");
  });

  it("mindmap : même source de vérité que la note", () => {
    expect(serializeArtifact("bloc-notes", "mindmap", notebook, "n1")).toContain("Plan de lancement");
  });

  it("décision : options, critères, scores, risques (prévention)", () => {
    const s = serializeArtifact("decision-engine", "decision", decisionEngine, "d1")!;
    expect(s).toContain("Choix du fournisseur");
    expect(s).toContain("Alpha");
    expect(s).toContain("Coût");
    expect(s).toContain("moins cher");
    expect(s).toContain("Rupture d'appro");
    expect(s).toContain("prévenir: double sourcing");
  });

  it("tableau : moteur + éléments avec statut", () => {
    const s = serializeArtifact("decision-engine", "board", decisionEngine, "bd1")!;
    expect(s).toContain("TABLEAU (kanban) : Roadmap");
    expect(s).toContain("Livrer OAuth");
    expect(s).toContain("statut=todo");
  });

  it("tableau blanc : tous les post-it", () => {
    const s = serializeArtifact("whiteboard", "whiteboard", whiteboard, "whiteboard")!;
    expect(s).toContain("1 post-it");
    expect(s).toContain("Idée 1");
  });

  it("artefact introuvable → null", () => {
    expect(serializeArtifact("bloc-notes", "note", notebook, "inconnu")).toBeNull();
    expect(serializeArtifact("decision-engine", "board", decisionEngine, "inconnu")).toBeNull();
  });
});
