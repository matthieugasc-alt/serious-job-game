/**
 * Tests PURS de model.ts (applyNotebookOp) — chaque op du contrat §4 :
 * mutations immutables, défensives, updated_at et tagIndex maintenus,
 * hiérarchie de blocs (children, déplacement), annotate (3 SourceRef),
 * kanban (transitions de statut), sérialisation JSON round-trip.
 */

import { describe, it, expect } from "vitest";
import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { Block, NotebookState, SourceRef } from "../spec";
import {
  applyNotebookOp,
  emptyNotebookState,
  normalizeNotebookState,
  sanitizeBlocks,
  parseSourceRef,
  NOTEBOOK_OPS,
} from "../model";

const T0 = 1_000;

/** Applique une op et rend l'état normalisé (lisible en assertions). */
function apply(state: Json, op: string, payload: JsonObject): NotebookState {
  return normalizeNotebookState(applyNotebookOp(state, op, payload));
}

function withNote(id = "n1", at = T0): Json {
  return applyNotebookOp(emptyNotebookState() as Json, "note_created", {
    note_id: id,
    title: `Note ${id}`,
    at,
  });
}

const SOURCES: Record<string, SourceRef> = {
  message: { kind: "message", thread_id: "th_alex", actor_id: "alex", at: 42, excerpt: "extrait fil" },
  mail: { kind: "mail", mail_id: "mail_in_1", subject: "Devis", from: "thomas", at: 43, excerpt: "extrait mail" },
  document: { kind: "document", document_id: "doc_pack", excerpt: "extrait doc" },
};

// ═══ Création / renommage / suppression de notes ═══════════════════

describe("note_created", () => {
  it("crée une note vide horodatée, en TÊTE de l'ordre manuel", () => {
    let s = withNote("n1", T0);
    s = applyNotebookOp(s, "note_created", { note_id: "n2", title: "  Deux  ", at: T0 + 5 });
    const n = normalizeNotebookState(s);
    expect(n.order).toEqual(["n2", "n1"]);
    expect(n.notes.n2).toMatchObject({
      id: "n2",
      title: "Deux",
      blocks: [],
      tags: [],
      created_at: T0 + 5,
      updated_at: T0 + 5,
    });
  });

  it("défensif : id manquant, vide ou dupliqué → no-op strict (même référence)", () => {
    const s = withNote("n1");
    expect(applyNotebookOp(s, "note_created", { at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "note_created", { note_id: "", at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "note_created", { note_id: "n1", at: T0 })).toBe(s);
  });

  it("op inconnue → no-op strict journalisable (même référence)", () => {
    const s = withNote("n1");
    expect(applyNotebookOp(s, "note_exploded", { note_id: "n1" })).toBe(s);
  });

  it("immutabilité : l'état d'origine n'est jamais muté", () => {
    const s = withNote("n1");
    const snapshot = JSON.stringify(s);
    applyNotebookOp(s, "note_created", { note_id: "n2", at: T0 + 1 });
    applyNotebookOp(s, "note_renamed", { note_id: "n1", title: "X", at: T0 + 1 });
    applyNotebookOp(s, "note_deleted", { note_id: "n1", at: T0 + 1 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("note_renamed", () => {
  it("renomme et maintient updated_at (created_at intact)", () => {
    const n = apply(withNote("n1", T0), "note_renamed", { note_id: "n1", title: "Renommée", at: T0 + 9 });
    expect(n.notes.n1.title).toBe("Renommée");
    expect(n.notes.n1.created_at).toBe(T0);
    expect(n.notes.n1.updated_at).toBe(T0 + 9);
  });

  it("défensif : note inconnue ou title absent → no-op", () => {
    const s = withNote("n1");
    expect(applyNotebookOp(s, "note_renamed", { note_id: "nx", title: "X", at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "note_renamed", { note_id: "n1", at: T0 })).toBe(s);
  });
});

describe("note_deleted", () => {
  it("retire la note de notes, order ET tagIndex (entrées vides purgées)", () => {
    let s = withNote("n1");
    s = applyNotebookOp(s, "note_created", { note_id: "n2", at: T0 + 1 });
    s = applyNotebookOp(s, "tag_added", { note_id: "n1", tag: "mvp", at: T0 + 2 });
    s = applyNotebookOp(s, "tag_added", { note_id: "n2", tag: "mvp", at: T0 + 3 });
    const before = normalizeNotebookState(s);
    expect(before.tagIndex.mvp).toEqual(["n2", "n1"]);

    const after = apply(s, "note_deleted", { note_id: "n1", at: T0 + 4 });
    expect(after.notes.n1).toBeUndefined();
    expect(after.order).toEqual(["n2"]);
    expect(after.tagIndex.mvp).toEqual(["n2"]);

    const none = apply(applyNotebookOp(s, "note_deleted", { note_id: "n1", at: T0 + 4 }), "note_deleted", {
      note_id: "n2",
      at: T0 + 5,
    });
    expect(none.tagIndex.mvp).toBeUndefined(); // plus aucune note → entrée purgée
  });

  it("les tâches liées survivent, leur note_id orphelin est retiré", () => {
    let s = withNote("n1");
    s = applyNotebookOp(s, "task_created", { task_id: "t1", title: "Relire", note_id: "n1", at: T0 + 1 });
    const after = apply(s, "note_deleted", { note_id: "n1", at: T0 + 2 });
    expect(after.tasks.t1).toBeDefined();
    expect(after.tasks.t1.note_id).toBeUndefined();
    expect(after.tasks.t1.updated_at).toBe(T0 + 1); // pas de bump : la tâche n'a pas changé de fond
  });

  it("défensif : note inconnue → no-op", () => {
    const s = withNote("n1");
    expect(applyNotebookOp(s, "note_deleted", { note_id: "nx", at: T0 })).toBe(s);
  });
});

// ═══ Blocs : hiérarchie, todo, sanitisation ════════════════════════

describe("blocks_updated — hiérarchie de blocs", () => {
  const tree: Block[] = [
    { id: "b1", kind: "heading1", text: "Plan" },
    {
      id: "b2",
      kind: "bullet",
      text: "Contexte",
      children: [
        { id: "b21", kind: "bullet", text: "Marché", marks: { bold: true } },
        { id: "b22", kind: "todo", text: "Vérifier les chiffres", checked: false },
      ],
    },
    { id: "b3", kind: "quote", text: "extrait cité" },
  ];

  it("remplace la hiérarchie complète (children imbriqués conservés)", () => {
    const n = apply(withNote("n1"), "blocks_updated", {
      note_id: "n1",
      blocks: tree as unknown as Json,
      at: T0 + 2,
    });
    expect(n.notes.n1.blocks).toEqual(tree);
    expect(n.notes.n1.updated_at).toBe(T0 + 2);
  });

  it("conserve les 5 marques (gras/italique/souligné/barré/surligné)", () => {
    const marked: Block[] = [
      { id: "m1", kind: "paragraph", text: "riche", marks: { bold: true, italic: true, underline: true, strikethrough: true, highlight: "yellow" } },
    ];
    const n = apply(withNote("n1"), "blocks_updated", { note_id: "n1", blocks: marked as unknown as Json, at: T0 + 2 });
    expect((n.notes.n1.blocks[0] as { marks?: unknown }).marks).toEqual({ bold: true, italic: true, underline: true, strikethrough: true, highlight: "yellow" });
  });

  it("déplacement d'un bloc (Tab = enfant → racine) : nouvel arbre appliqué tel quel", () => {
    let s = applyNotebookOp(withNote("n1"), "blocks_updated", {
      note_id: "n1",
      blocks: tree as unknown as Json,
      at: T0 + 2,
    });
    const moved: Block[] = [
      tree[0],
      { id: "b2", kind: "bullet", text: "Contexte", children: [{ id: "b21", kind: "bullet", text: "Marché", marks: { bold: true } }] },
      { id: "b22", kind: "todo", text: "Vérifier les chiffres", checked: false }, // remonté à la racine
      tree[2],
    ];
    s = applyNotebookOp(s, "blocks_updated", { note_id: "n1", blocks: moved as unknown as Json, at: T0 + 3 });
    const n = normalizeNotebookState(s);
    expect(n.notes.n1.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b22", "b3"]);
    expect((n.notes.n1.blocks[1] as { children?: Block[] }).children?.map((b) => b.id)).toEqual(["b21"]);
  });

  it("sanitise : blocs invalides écartés (kind inconnu, id manquant), récursivement", () => {
    const dirty = [
      { id: "ok", kind: "paragraph", text: "gardé" },
      { kind: "paragraph", text: "sans id" },
      { id: "bad", kind: "tableau", text: "kind inconnu" },
      { id: "p", kind: "numbered", text: "parent", children: [{ id: "c", kind: "image" }, { id: "c2", kind: "todo", text: "ok", checked: "oui" }] },
      "pas un objet",
    ] as unknown as Json;
    const n = apply(withNote("n1"), "blocks_updated", { note_id: "n1", blocks: dirty, at: T0 + 2 });
    expect(n.notes.n1.blocks.map((b) => b.id)).toEqual(["ok", "p"]);
    const parent = n.notes.n1.blocks[1] as { children?: Block[] };
    expect(parent.children?.map((b) => b.id)).toEqual(["c2"]);
    expect((parent.children?.[0] as { checked?: boolean }).checked).toBe(false); // coercition sûre
  });

  it("défensif : note inconnue ou blocks non-tableau → no-op", () => {
    const s = withNote("n1");
    expect(applyNotebookOp(s, "blocks_updated", { note_id: "nx", blocks: [], at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "blocks_updated", { note_id: "n1", blocks: "oops", at: T0 })).toBe(s);
  });
});

describe("todo_toggled", () => {
  const blocks: Block[] = [
    { id: "b1", kind: "todo", text: "racine", checked: false },
    {
      id: "b2",
      kind: "bullet",
      text: "parent",
      children: [{ id: "b21", kind: "todo", text: "imbriqué", checked: true }],
    },
  ];
  const base = () =>
    applyNotebookOp(withNote("n1"), "blocks_updated", { note_id: "n1", blocks: blocks as unknown as Json, at: T0 + 1 });

  it("bascule un todo à la racine puis le re-bascule", () => {
    let s = applyNotebookOp(base(), "todo_toggled", { note_id: "n1", block_id: "b1", at: T0 + 2 });
    let n = normalizeNotebookState(s);
    expect((n.notes.n1.blocks[0] as { checked: boolean }).checked).toBe(true);
    expect(n.notes.n1.updated_at).toBe(T0 + 2);
    s = applyNotebookOp(s, "todo_toggled", { note_id: "n1", block_id: "b1", at: T0 + 3 });
    n = normalizeNotebookState(s);
    expect((n.notes.n1.blocks[0] as { checked: boolean }).checked).toBe(false);
  });

  it("bascule un todo IMBRIQUÉ (children) sans toucher au reste", () => {
    const n = apply(base(), "todo_toggled", { note_id: "n1", block_id: "b21", at: T0 + 2 });
    const parent = n.notes.n1.blocks[1] as { children: Block[] };
    expect((parent.children[0] as { checked: boolean }).checked).toBe(false);
    expect((n.notes.n1.blocks[0] as { checked: boolean }).checked).toBe(false); // intact
  });

  it("défensif : bloc introuvable ou non-todo → no-op", () => {
    const s = base();
    expect(applyNotebookOp(s, "todo_toggled", { note_id: "n1", block_id: "b2", at: T0 })).toBe(s); // bullet
    expect(applyNotebookOp(s, "todo_toggled", { note_id: "n1", block_id: "zz", at: T0 })).toBe(s);
  });
});

// ═══ Tags et tagIndex ══════════════════════════════════════════════

describe("tag_added / tag_removed — tagIndex maintenu", () => {
  it("ajoute un tag : note.tags ET tagIndex synchrones, updated_at bump", () => {
    const n = apply(withNote("n1"), "tag_added", { note_id: "n1", tag: "mvp", at: T0 + 2 });
    expect(n.notes.n1.tags).toEqual(["mvp"]);
    expect(n.tagIndex).toEqual({ mvp: ["n1"] });
    expect(n.notes.n1.updated_at).toBe(T0 + 2);
  });

  it("l'ordre du tagIndex suit l'ordre MANUEL des notes", () => {
    let s = withNote("n1", T0);
    s = applyNotebookOp(s, "note_created", { note_id: "n2", at: T0 + 1 }); // n2 passe en tête
    s = applyNotebookOp(s, "tag_added", { note_id: "n1", tag: "mvp", at: T0 + 2 });
    s = applyNotebookOp(s, "tag_added", { note_id: "n2", tag: "mvp", at: T0 + 3 });
    expect(normalizeNotebookState(s).tagIndex.mvp).toEqual(["n2", "n1"]);
  });

  it("retire un tag ; l'entrée d'index vide disparaît", () => {
    let s = applyNotebookOp(withNote("n1"), "tag_added", { note_id: "n1", tag: "mvp", at: T0 + 1 });
    s = applyNotebookOp(s, "tag_removed", { note_id: "n1", tag: "mvp", at: T0 + 2 });
    const n = normalizeNotebookState(s);
    expect(n.notes.n1.tags).toEqual([]);
    expect(n.tagIndex.mvp).toBeUndefined();
  });

  it("défensif : tag vide, doublon, tag absent, note inconnue → no-op", () => {
    const tagged = applyNotebookOp(withNote("n1"), "tag_added", { note_id: "n1", tag: "mvp", at: T0 });
    expect(applyNotebookOp(tagged, "tag_added", { note_id: "n1", tag: "mvp", at: T0 })).toBe(tagged);
    expect(applyNotebookOp(tagged, "tag_added", { note_id: "n1", tag: "   ", at: T0 })).toBe(tagged);
    expect(applyNotebookOp(tagged, "tag_added", { note_id: "nx", tag: "x", at: T0 })).toBe(tagged);
    expect(applyNotebookOp(tagged, "tag_removed", { note_id: "n1", tag: "absent", at: T0 })).toBe(tagged);
  });
});

// ═══ Annotations (les 3 SourceRef) ═════════════════════════════════

describe("annotation_added — quote + commentaire + source + heure", () => {
  for (const [kindName, source] of Object.entries(SOURCES)) {
    it(`source "${kindName}" : note quote+commentaire, SourceRef conservée`, () => {
      const n = apply(emptyNotebookState() as Json, "annotation_added", {
        note_id: "a1",
        source: source as unknown as Json,
        excerpt: "Le churn vient des vétérinaires équins.",
        comment: "À recouper avec le data pack.",
        at: T0 + 10,
      });
      const note = n.notes.a1;
      expect(note.source).toEqual(source);
      expect(note.created_at).toBe(T0 + 10);
      expect(note.updated_at).toBe(T0 + 10);
      expect(note.title).toBe("Le churn vient des vétérinaires équins.");
      expect(note.blocks).toEqual([
        { id: "a1_quote", kind: "quote", text: "Le churn vient des vétérinaires équins." },
        { id: "a1_comment", kind: "paragraph", text: "À recouper avec le data pack." },
      ]);
      expect(n.order[0]).toBe("a1");
    });
  }

  it("sans commentaire : la note ne contient que la citation", () => {
    const n = apply(emptyNotebookState() as Json, "annotation_added", {
      note_id: "a1",
      source: SOURCES.document as unknown as Json,
      excerpt: "extrait",
      comment: "  ",
      at: T0,
    });
    expect(n.notes.a1.blocks).toEqual([{ id: "a1_quote", kind: "quote", text: "extrait" }]);
  });

  it("titre tronqué à 60 caractères (extrait long, espaces compactés)", () => {
    const long = `Un   extrait ${"très ".repeat(30)}long`;
    const n = apply(emptyNotebookState() as Json, "annotation_added", {
      note_id: "a1",
      source: SOURCES.message as unknown as Json,
      excerpt: long,
      at: T0,
    });
    expect(n.notes.a1.title.length).toBeLessThanOrEqual(60);
    expect(n.notes.a1.title.endsWith("…")).toBe(true);
    expect(n.notes.a1.title.startsWith("Un extrait très")).toBe(true);
  });

  it("défensif : source mal formée ou extrait vide → no-op", () => {
    const s = emptyNotebookState() as Json;
    expect(
      applyNotebookOp(s, "annotation_added", { note_id: "a1", source: { kind: "pigeon" }, excerpt: "x", at: T0 }),
    ).toBe(s);
    expect(
      applyNotebookOp(s, "annotation_added", {
        note_id: "a1",
        source: SOURCES.mail as unknown as Json,
        excerpt: "   ",
        at: T0,
      }),
    ).toBe(s);
  });

  it("parseSourceRef valide strictement les 3 formes", () => {
    for (const source of Object.values(SOURCES)) {
      expect(parseSourceRef(source as unknown as Json)).toEqual(source);
    }
    expect(parseSourceRef({ kind: "message", excerpt: "x" })).toBeUndefined(); // thread_id/at manquants
    expect(parseSourceRef({ kind: "mail", mail_id: "m", subject: "s", from: "f", excerpt: "x" })).toBeUndefined();
    expect(parseSourceRef("mail")).toBeUndefined();
  });
});

// ═══ Tâches / kanban ═══════════════════════════════════════════════

describe("task_created / task_updated / task_moved / task_from_selection", () => {
  it("crée une tâche complète (statut, priorité, due, tags, source, note liée)", () => {
    const s = withNote("n1");
    const n = apply(s, "task_created", {
      task_id: "t1",
      title: "  Relancer Thomas  ",
      description: "avant vendredi",
      status: "doing",
      priority: "high",
      due: "2026-07-10",
      tags: ["mvp", "mvp", "négo"],
      source: SOURCES.mail as unknown as Json,
      note_id: "n1",
      at: T0 + 1,
    });
    expect(n.tasks.t1).toEqual({
      id: "t1",
      title: "Relancer Thomas",
      description: "avant vendredi",
      status: "doing",
      priority: "high",
      due: "2026-07-10",
      tags: ["mvp", "négo"],
      source: SOURCES.mail,
      note_id: "n1",
      created_at: T0 + 1,
      updated_at: T0 + 1,
    });
  });

  it("valeurs invalides neutralisées : statut inconnu → todo, note inconnue → lien ignoré", () => {
    const n = apply(emptyNotebookState() as Json, "task_created", {
      task_id: "t1",
      title: "X",
      status: "peut-être",
      priority: "urgentissime",
      note_id: "fantome",
      at: T0,
    });
    expect(n.tasks.t1.status).toBe("todo");
    expect(n.tasks.t1.priority).toBeUndefined();
    expect(n.tasks.t1.note_id).toBeUndefined();
  });

  it("kanban : transitions de statut via task_moved, updated_at maintenu", () => {
    let s = applyNotebookOp(emptyNotebookState() as Json, "task_created", { task_id: "t1", title: "X", at: T0 });
    s = applyNotebookOp(s, "task_moved", { task_id: "t1", status: "doing", at: T0 + 1 });
    expect(normalizeNotebookState(s).tasks.t1).toMatchObject({ status: "doing", updated_at: T0 + 1 });
    s = applyNotebookOp(s, "task_moved", { task_id: "t1", status: "done", at: T0 + 2 });
    expect(normalizeNotebookState(s).tasks.t1).toMatchObject({ status: "done", updated_at: T0 + 2 });
    // Retour arrière autorisé (done → todo).
    s = applyNotebookOp(s, "task_moved", { task_id: "t1", status: "todo", at: T0 + 3 });
    expect(normalizeNotebookState(s).tasks.t1.status).toBe("todo");
  });

  it("task_moved défensif : même statut, statut inconnu, tâche inconnue → no-op", () => {
    const s = applyNotebookOp(emptyNotebookState() as Json, "task_created", { task_id: "t1", title: "X", at: T0 });
    expect(applyNotebookOp(s, "task_moved", { task_id: "t1", status: "todo", at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "task_moved", { task_id: "t1", status: "archived", at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "task_moved", { task_id: "tx", status: "done", at: T0 })).toBe(s);
  });

  it("task_updated : patch partiel, clés null retirées, updated_at bump", () => {
    let s = applyNotebookOp(emptyNotebookState() as Json, "task_created", {
      task_id: "t1",
      title: "X",
      description: "desc",
      priority: "low",
      due: "2026-07-10",
      at: T0,
    });
    s = applyNotebookOp(s, "task_updated", {
      task_id: "t1",
      patch: { title: "Y", description: null, priority: null, due: null, tags: ["a"], status: "doing" },
      at: T0 + 5,
    });
    const t = normalizeNotebookState(s).tasks.t1;
    expect(t.title).toBe("Y");
    expect(t.description).toBeUndefined();
    expect(t.priority).toBeUndefined();
    expect(t.due).toBeUndefined();
    expect(t.tags).toEqual(["a"]);
    expect(t.status).toBe("doing");
    expect(t.updated_at).toBe(T0 + 5);
  });

  it("task_updated défensif : tâche inconnue, patch absent ou vide → no-op", () => {
    const s = applyNotebookOp(emptyNotebookState() as Json, "task_created", { task_id: "t1", title: "X", at: T0 });
    expect(applyNotebookOp(s, "task_updated", { task_id: "tx", patch: { title: "Y" }, at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "task_updated", { task_id: "t1", at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "task_updated", { task_id: "t1", patch: {}, at: T0 })).toBe(s);
  });

  it("task_from_selection : titre compacté/tronqué, statut todo, note et source liées", () => {
    const s = withNote("n1");
    const n = apply(s, "task_from_selection", {
      task_id: "t1",
      text: "  Vérifier   le churn\néquin  ",
      note_id: "n1",
      source: SOURCES.document as unknown as Json,
      at: T0 + 1,
    });
    expect(n.tasks.t1).toMatchObject({
      title: "Vérifier le churn équin",
      status: "todo",
      note_id: "n1",
      source: SOURCES.document,
    });
    const long = apply(s, "task_from_selection", { task_id: "t2", text: "x".repeat(300), at: T0 });
    expect(long.tasks.t2.title.length).toBeLessThanOrEqual(120);
  });

  it("task_from_selection défensif : texte vide ou id dupliqué → no-op", () => {
    const s = applyNotebookOp(emptyNotebookState() as Json, "task_created", { task_id: "t1", title: "X", at: T0 });
    expect(applyNotebookOp(s, "task_from_selection", { task_id: "t2", text: "   ", at: T0 })).toBe(s);
    expect(applyNotebookOp(s, "task_from_selection", { task_id: "t1", text: "ok", at: T0 })).toBe(s);
  });
});

// ═══ Réordonnancement ══════════════════════════════════════════════

describe("notes_reordered", () => {
  function three(): Json {
    let s = withNote("n1", T0);
    s = applyNotebookOp(s, "note_created", { note_id: "n2", at: T0 + 1 });
    s = applyNotebookOp(s, "note_created", { note_id: "n3", at: T0 + 2 });
    return s; // ordre : n3, n2, n1
  }

  it("applique l'ordre manuel demandé", () => {
    const n = apply(three(), "notes_reordered", { order: ["n1", "n3", "n2"], at: T0 + 3 });
    expect(n.order).toEqual(["n1", "n3", "n2"]);
  });

  it("défensif : ids inconnus écartés, notes omises rattrapées en fin", () => {
    const n = apply(three(), "notes_reordered", { order: ["n2", "fantome"], at: T0 + 3 });
    expect(n.order).toEqual(["n2", "n3", "n1"]); // aucune note perdue
  });

  it("défensif : payload sans tableau → no-op", () => {
    const s = three();
    expect(applyNotebookOp(s, "notes_reordered", { order: "n1,n2", at: T0 })).toBe(s);
  });
});

// ═══ Normalisation, round-trip JSON, robustesse ════════════════════

describe("normalizeNotebookState / sérialisation", () => {
  it("état null / corrompu → carnet vide bien formé", () => {
    expect(normalizeNotebookState(null)).toEqual(emptyNotebookState());
    expect(normalizeNotebookState("pouet")).toEqual(emptyNotebookState());
    expect(normalizeNotebookState({ notes: "x", tasks: 3, order: {} })).toEqual(emptyNotebookState());
  });

  it("reconstruit le tagIndex et complète l'ordre (dérivés cohérents)", () => {
    const dirty = {
      notes: {
        n1: { id: "n1", title: "Un", blocks: [], tags: ["a"], created_at: 1, updated_at: 1 },
        n2: { id: "n2", title: "Deux", blocks: [], tags: ["a", "b"], created_at: 2, updated_at: 2 },
        nx: { id: "AUTRE", title: "id incohérent → écartée" },
      },
      tasks: { t1: { id: "t1", title: "T", status: "doing", tags: [], created_at: 1, updated_at: 1 } },
      tagIndex: { a: ["n2", "n1", "fantome"], zombie: ["n1"] }, // index mensonger : ignoré, reconstruit
      order: ["n2", "fantome"], // n1 manquante
    } as unknown as Json;
    const n = normalizeNotebookState(dirty);
    expect(n.order).toEqual(["n2", "n1"]);
    expect(n.tagIndex).toEqual({ a: ["n2", "n1"], b: ["n2"] });
    expect(n.notes.nx).toBeUndefined();
    expect(n.tasks.t1.status).toBe("doing");
  });

  it("round-trip JSON : l'état survit intact à stringify/parse", () => {
    let s = withNote("n1");
    s = applyNotebookOp(s, "tag_added", { note_id: "n1", tag: "mvp", at: T0 + 1 });
    s = applyNotebookOp(s, "annotation_added", {
      note_id: "a1",
      source: SOURCES.message as unknown as Json,
      excerpt: "extrait",
      comment: "note",
      at: T0 + 2,
    });
    s = applyNotebookOp(s, "task_created", { task_id: "t1", title: "Relire", note_id: "n1", at: T0 + 3 });
    const revived = JSON.parse(JSON.stringify(s)) as Json;
    expect(revived).toEqual(s);
    expect(normalizeNotebookState(revived)).toEqual(normalizeNotebookState(s));
    // Et on peut continuer à opérer sur l'état relu.
    const n = apply(revived, "task_moved", { task_id: "t1", status: "done", at: T0 + 4 });
    expect(n.tasks.t1.status).toBe("done");
  });

  it("sanitizeBlocks accepte l'absence de children/marks et écarte le reste", () => {
    expect(sanitizeBlocks([{ id: "s", kind: "separator", text: "" }] as unknown as Json)).toEqual([
      { id: "s", kind: "separator", text: "" },
    ]);
    expect(sanitizeBlocks(undefined)).toEqual([]);
  });

  it("toutes les ops déclarées sont couvertes par le reducer (union fermée)", () => {
    expect([...NOTEBOOK_OPS].sort()).toEqual(
      [
        "note_created",
        "note_renamed",
        "note_deleted",
        "blocks_updated",
        "tag_added",
        "tag_removed",
        "todo_toggled",
        "annotation_added",
        "task_created",
        "task_updated",
        "task_moved",
        "task_from_selection",
        "notes_reordered",
      ].sort(),
    );
  });
});
