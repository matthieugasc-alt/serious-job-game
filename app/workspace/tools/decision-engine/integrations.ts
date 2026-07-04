/**
 * integrations.ts — couplages Tool→Tool du Decision Engine, PAR FAÇADE
 * PUBLIQUE uniquement (contrat §6/§8). Fichier NON-pur (hors whitelist des
 * garde-fous spec/model/api/presets) : il peut importer d'autres Tools.
 *   - exportDecisionToNotebook : synthèse d'une décision → note Bloc-notes ;
 *   - createTaskFromDecision : décision → tâche Bloc-notes ;
 *   - reviseDecision : révision append-only (nouvelle décision `supersedes`
 *     qui recopie options/critères/scores/risques) ;
 *   - buildEntryDecisionLink : SourceLink depuis une entrée hôte.
 *
 * Ne lit JAMAIS l'état interne d'un autre Tool : ne produit que des ops
 * via les API publiques (decision-engine + bloc-notes).
 */

import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { createNote, updateBlocks, createTask } from "@/app/workspace/tools/bloc-notes/api";
import type { Block } from "@/app/workspace/tools/bloc-notes/spec";
import {
  addCriterion,
  addOption,
  createDecision,
  createRisk,
  rankedOptions,
  scoreOption,
} from "./api";
import { weightedScoreOf } from "./spec";
import type { DecisionObject, SourceLink } from "./spec";

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_679_616;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
const block = (kind: Block["kind"], text: string): Block =>
  kind === "todo"
    ? { id: uid("b"), kind: "todo", text, checked: false }
    : ({ id: uid("b"), kind, text } as Block);

/**
 * Compose une note de synthèse dans le Bloc-notes (contexte, décision,
 * options classées, risques, justification) et rend les 2 ops
 * (note_created + blocks_updated) à dispatcher.
 */
export function exportDecisionToNotebook(decision: DecisionObject): WorkspaceAction[] {
  const noteId = uid("note");
  const blocks: Block[] = [
    block("heading1", decision.title || "Décision"),
  ];
  if (decision.context) blocks.push(block("paragraph", `Contexte : ${decision.context}`));
  if (decision.final_decision) blocks.push(block("paragraph", `Décision retenue : ${decision.final_decision}`));

  if (decision.options.length > 0) {
    blocks.push(block("heading2", "Options évaluées"));
    for (const { option, score } of rankedOptions(decision)) {
      blocks.push(block("bullet", `${option.label} — score ${score}`));
    }
  }
  if (decision.risks.length > 0) {
    blocks.push(block("heading2", "Risques"));
    for (const r of decision.risks) {
      blocks.push(block("bullet", `${r.label} (P${r.probability}·I${r.impact})${r.mitigation ? ` — ${r.mitigation}` : ""}`));
    }
  }
  if (decision.justification) {
    blocks.push(block("heading2", "Justification"));
    blocks.push(block("paragraph", decision.justification));
  }

  return [
    createNote(decision.title || "Décision", { id: noteId }),
    updateBlocks(noteId, blocks),
  ];
}

/** Décision → tâche de suivi dans le Bloc-notes. */
export function createTaskFromDecision(decision: DecisionObject): WorkspaceAction {
  const top = rankedOptions(decision)[0];
  return createTask({
    title: `Décision : ${decision.title || "(sans titre)"}`,
    description:
      decision.final_decision ??
      (top && weightedScoreOf(decision, top.option.id) > 0 ? `Piste en tête : ${top.option.label}` : decision.context),
    tags: ["décision"],
  });
}

/**
 * Révision APPEND-ONLY : nouvelle décision qui `supersedes` l'ancienne et
 * recopie sa structure (options/critères/scores/risques). Rend la liste
 * d'ops à dispatcher, et l'id de la nouvelle décision.
 */
export function reviseDecision(decision: DecisionObject): { newId: string; actions: WorkspaceAction[] } {
  const newId = uid("dec");
  const actions: WorkspaceAction[] = [
    createDecision(
      { title: `${decision.title || "Décision"} (révisée)`, context: decision.context, supersedes: decision.id },
      { id: newId },
    ),
  ];
  const optMap = new Map<string, string>();
  const critMap = new Map<string, string>();
  for (const o of decision.options) {
    const nid = uid("opt");
    optMap.set(o.id, nid);
    actions.push(addOption(newId, o.label, { id: nid }));
  }
  for (const c of decision.criteria) {
    const nid = uid("crit");
    critMap.set(c.id, nid);
    actions.push(addCriterion(newId, { label: c.label, weight: c.weight }, { id: nid }));
  }
  for (const [optId, row] of Object.entries(decision.scores)) {
    const no = optMap.get(optId);
    if (!no) continue;
    for (const [critId, cell] of Object.entries(row)) {
      const nc = critMap.get(critId);
      if (nc) actions.push(scoreOption(newId, no, nc, cell.value, cell.justification));
    }
  }
  for (const r of decision.risks) {
    actions.push(createRisk(newId, { label: r.label, probability: r.probability, impact: r.impact, mitigation: r.mitigation, owner: r.owner }, { id: uid("risk") }));
  }
  return { newId, actions };
}

/** SourceLink universel depuis une entrée hôte (document/mail/fil/bibliothèque). */
export function buildEntryDecisionLink(
  kind: "document" | "mail" | "message" | "library",
  id: string,
  label?: string,
): SourceLink {
  switch (kind) {
    case "document":
      return { kind: "document", document_id: id, ...(label ? { label } : {}) };
    case "mail":
      return { kind: "mail", mail_id: id, ...(label ? { label } : {}) };
    case "message":
      return { kind: "message", thread_id: id, ...(label ? { label } : {}) };
    default:
      return { kind: "library", entry_id: id, ...(label ? { label } : {}) };
  }
}
