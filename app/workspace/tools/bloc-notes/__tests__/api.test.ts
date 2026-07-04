/**
 * Tests PURS de api.ts — la façade publique du carnet :
 *   - chaque constructeur rend une action tool_op bien formée (tool_id
 *     "bloc-notes", op de l'union, payload complet), directement
 *     applicable par applyNotebookOp ;
 *   - les sélecteurs lisent le Json brut de toolStates (null compris) ;
 *   - describeForObservation (spec.ts) : résumé lisible pour l'IA.
 */

import { describe, it, expect } from "vitest";
import type { Json } from "@/app/lib/engine/mechanics";
import type { Block, SourceRef } from "../spec";
import { blocNotesSpec, describeNotebookForObservation, initialNotebookState, BLOC_NOTES_TOOL_ID } from "../spec";
import {
  applyNotebookOp,
  NOTEBOOK_OPS,
  type NotebookToolOp,
  // constructeurs (contrat §4)
  createNote,
  updateBlocks,
  renameNote,
  deleteNote,
  addTag,
  removeTag,
  toggleTodo,
  annotate,
  createTask,
  updateTask,
  moveTask,
  taskFromSelection,
  reorderNotes,
  // sélecteurs
  selectAll,
  selectRecent,
  selectByTag,
  selectChronological,
  selectTasksByStatus,
  selectNote,
  selectTask,
  selectTags,
  selectAllTasks,
  selectNotebook,
} from "../api";

const T0 = 1_000;

const DOC_SOURCE: SourceRef = { kind: "document", document_id: "doc_pack", excerpt: "extrait" };

/** Rejoue une liste d'ops sur l'état initial (comme le moteur). */
function play(ops: NotebookToolOp[]): Json {
  let state: Json = initialNotebookState({}) as Json;
  for (const action of ops) {
    expect(action.type).toBe("tool_op");
    expect(action.tool_id).toBe(BLOC_NOTES_TOOL_ID);
    expect(NOTEBOOK_OPS).toContain(action.op);
    state = applyNotebookOp(state, action.op, action.payload);
  }
  return state;
}

describe("constructeurs d'ops — chaque appel = un tool_op journalisable", () => {
  it("createNote : id et horodatage générés, surchargables pour les tests", () => {
    const explicit = createNote("Ma note", { id: "n1", at: T0 });
    expect(explicit).toEqual({
      type: "tool_op",
      tool_id: "bloc-notes",
      op: "note_created",
      payload: { note_id: "n1", title: "Ma note", at: T0 },
    });
    const generated = createNote();
    expect(typeof generated.payload.note_id).toBe("string");
    expect((generated.payload.note_id as string).length).toBeGreaterThan(4);
    expect(typeof generated.payload.at).toBe("number");
    // Deux appels ne partagent jamais un id (journal sans collision).
    expect(createNote().payload.note_id).not.toBe(createNote().payload.note_id);
  });

  it("le cycle complet contrat §4 se rejoue sur applyNotebookOp", () => {
    const blocks: Block[] = [
      { id: "b1", kind: "heading1", text: "Plan" },
      { id: "b2", kind: "todo", text: "vérifier churn", checked: false },
    ];
    const state = play([
      createNote("Analyse", { id: "n1", at: T0 }),
      renameNote("n1", "Analyse churn", { at: T0 + 1 }),
      updateBlocks("n1", blocks, { at: T0 + 2 }),
      addTag("n1", "mvp", { at: T0 + 3 }),
      addTag("n1", "churn", { at: T0 + 4 }),
      removeTag("n1", "churn", { at: T0 + 5 }),
      toggleTodo("n1", "b2", { at: T0 + 6 }),
      annotate(
        { source: DOC_SOURCE, excerpt: "les vétos équins partent", comment: "creuser" },
        { id: "a1", at: T0 + 7 },
      ),
      createTask({ title: "Recouper les chiffres", priority: "high", note_id: "n1" }, { id: "t1", at: T0 + 8 }),
      updateTask("t1", { description: "avec le data pack" }, { at: T0 + 9 }),
      moveTask("t1", "doing", { at: T0 + 10 }),
      taskFromSelection("appeler Thomas", "a1", DOC_SOURCE, { id: "t2", at: T0 + 11 }),
      createNote("Brouillon", { id: "n2", at: T0 + 12 }),
      deleteNote("n2", { at: T0 + 13 }),
      reorderNotes(["n1", "a1"], { at: T0 + 14 }),
    ]);

    const s = selectNotebook(state);
    expect(s.order).toEqual(["n1", "a1"]);
    expect(s.notes.n1.title).toBe("Analyse churn");
    expect(s.notes.n1.tags).toEqual(["mvp"]);
    expect((s.notes.n1.blocks[1] as { checked: boolean }).checked).toBe(true);
    expect(s.notes.a1.source).toEqual(DOC_SOURCE);
    expect(s.tagIndex).toEqual({ mvp: ["n1"] });
    expect(s.tasks.t1).toMatchObject({ status: "doing", description: "avec le data pack", note_id: "n1" });
    expect(s.tasks.t2).toMatchObject({ title: "appeler Thomas", note_id: "a1", source: DOC_SOURCE });
    expect(s.notes.n2).toBeUndefined();
  });
});

// ═══ Sélecteurs ════════════════════════════════════════════════════

function fixtureState(): Json {
  return play([
    createNote("Ancienne", { id: "n1", at: T0 }),
    createNote("Moyenne", { id: "n2", at: T0 + 10 }),
    createNote("Récente", { id: "n3", at: T0 + 20 }),
    addTag("n1", "mvp", { at: T0 + 21 }),
    addTag("n3", "mvp", { at: T0 + 22 }),
    addTag("n2", "budget", { at: T0 + 23 }),
    renameNote("n1", "Ancienne (retouchée)", { at: T0 + 30 }), // n1 devient la + récemment modifiée
    createTask({ title: "T-a" }, { id: "ta", at: T0 + 1 }),
    createTask({ title: "T-b", status: "doing" }, { id: "tb", at: T0 + 2 }),
    createTask({ title: "T-c" }, { id: "tc", at: T0 + 3 }),
    moveTask("tc", "done", { at: T0 + 40 }),
  ]);
}

describe("sélecteurs purs", () => {
  it("selectAll : ordre MANUEL (nouvelles notes en tête)", () => {
    expect(selectAll(fixtureState()).map((n) => n.id)).toEqual(["n3", "n2", "n1"]);
  });

  it("selectRecent : updated_at desc, limite respectée", () => {
    const state = fixtureState();
    // n1 renommée (T0+30) > n2 taggée (T0+23) > n3 taggée (T0+22).
    expect(selectRecent(state).map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(selectRecent(state, 2).map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(selectRecent(state, 0)).toEqual([]);
  });

  it("selectByTag : via le tagIndex maintenu, ordre manuel", () => {
    const state = fixtureState();
    expect(selectByTag(state, "mvp").map((n) => n.id)).toEqual(["n3", "n1"]);
    expect(selectByTag(state, "budget").map((n) => n.id)).toEqual(["n2"]);
    expect(selectByTag(state, "absent")).toEqual([]);
  });

  it("selectChronological : created_at desc (plus récentes créées d'abord)", () => {
    expect(selectChronological(fixtureState()).map((n) => n.id)).toEqual(["n3", "n2", "n1"]);
  });

  it("selectTasksByStatus : colonnes kanban, plus anciennes d'abord", () => {
    const state = fixtureState();
    expect(selectTasksByStatus(state, "todo").map((t) => t.id)).toEqual(["ta"]);
    expect(selectTasksByStatus(state, "doing").map((t) => t.id)).toEqual(["tb"]);
    expect(selectTasksByStatus(state, "done").map((t) => t.id)).toEqual(["tc"]);
  });

  it("sélecteurs complémentaires : selectNote/selectTask/selectTags/selectAllTasks", () => {
    const state = fixtureState();
    expect(selectNote(state, "n2")?.title).toBe("Moyenne");
    expect(selectNote(state, "zz")).toBeNull();
    expect(selectTask(state, "tb")?.status).toBe("doing");
    expect(selectTask(state, "zz")).toBeNull();
    expect(selectTags(state)).toEqual([
      { tag: "budget", count: 1 },
      { tag: "mvp", count: 2 },
    ]);
    expect(selectAllTasks(state).map((t) => t.id)).toEqual(["tc", "tb", "ta"]);
  });

  it("tous les sélecteurs tolèrent null / état corrompu (toolStates naissant)", () => {
    for (const state of [null, "pouet", 42, { notes: "x" }] as Json[]) {
      expect(selectAll(state)).toEqual([]);
      expect(selectRecent(state)).toEqual([]);
      expect(selectByTag(state, "mvp")).toEqual([]);
      expect(selectChronological(state)).toEqual([]);
      expect(selectTasksByStatus(state, "todo")).toEqual([]);
      expect(selectTags(state)).toEqual([]);
      expect(selectAllTasks(state)).toEqual([]);
      expect(selectNote(state, "n1")).toBeNull();
    }
  });

  it("pureté : les sélecteurs n'altèrent jamais l'état", () => {
    const state = fixtureState();
    const snapshot = JSON.stringify(state);
    selectAll(state);
    selectRecent(state, 1);
    selectByTag(state, "mvp");
    selectChronological(state);
    selectTasksByStatus(state, "done");
    selectTags(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

// ═══ describeForObservation (spec.ts) ══════════════════════════════

describe("describeForObservation — résumé lisible pour l'observateur IA", () => {
  it("carnet vide", () => {
    expect(describeNotebookForObservation(initialNotebookState({}) as Json)).toBe(
      "Bloc-notes universel vide : aucune note, aucune tâche.",
    );
    expect(describeNotebookForObservation(null)).toContain("vide");
  });

  it("titres, tags, contenu, tâches par statut — tout y est", () => {
    let state = fixtureState();
    state = applyNotebookOp(state, "blocks_updated", {
      note_id: "n3",
      blocks: [{ id: "b1", kind: "paragraph", text: "le churn vient des équins" }] as unknown as Json,
      at: T0 + 50,
    });
    state = applyNotebookOp(
      state,
      "annotation_added",
      annotate({ source: DOC_SOURCE, excerpt: "citation clé" }, { id: "a1", at: T0 + 51 }).payload,
    );
    const described = describeNotebookForObservation(state);
    expect(described).toContain("4 note(s), 3 tâche(s)");
    expect(described).toContain("« Récente »");
    expect(described).toContain("[tags : mvp]");
    expect(described).toContain("le churn vient des équins");
    expect(described).toContain("annotation depuis document");
    expect(described).toContain("budget (1)");
    expect(described).toContain("mvp (2)");
    expect(described).toContain("à faire (1) : « T-a »");
    expect(described).toContain("en cours (1) : « T-b »");
    expect(described).toContain("terminées (1) : « T-c »");
  });

  it("pur et déterministe : état intact, deux appels identiques", () => {
    const state = fixtureState();
    const snapshot = JSON.stringify(state);
    const once = describeNotebookForObservation(state);
    expect(describeNotebookForObservation(state)).toBe(once);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

// ═══ Contrat Tool (spec) ═══════════════════════════════════════════

describe("blocNotesSpec — contrat Tool complet", () => {
  it("expose id/title/icon/initialState/describeForObservation/applyOp", () => {
    expect(blocNotesSpec.id).toBe("bloc-notes");
    expect(blocNotesSpec.icon).toBe("📓");
    expect(blocNotesSpec.title.length).toBeGreaterThan(0);
    expect(blocNotesSpec.initialState({})).toEqual({ notes: {}, tasks: {}, tagIndex: {}, order: [] });
    expect(typeof blocNotesSpec.describeForObservation).toBe("function");
    expect(blocNotesSpec.applyOp).toBe(applyNotebookOp);
  });
});
