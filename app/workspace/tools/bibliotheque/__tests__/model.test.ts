/**
 * Tests PURS du reducer applyLibraryOp (model.ts) — invariants du contrat
 * (docs/TOOL_GESTIONNAIRE_DOC.md §3/§4) : dédup à l'entrée (§2), no-op
 * défensif, immutabilité, cohérence folder_id/links/desk, survie du
 * travail (annotations, entrées d'un dossier supprimé).
 */

import { describe, it, expect } from "vitest";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import {
  applyLibraryOp,
  emptyLibraryState,
  normalizeLibraryState,
} from "../model";
import type { LibraryState } from "../spec";

const T = 1_000;

const mailSnap = (over: Partial<Record<string, unknown>> = {}) => ({
  from: "cfo@acme.fr",
  to: ["player"],
  subject: "Budget Q3",
  body: "Voici le budget révisé.",
  at: T,
  ...over,
});

const threadSnap = () => ({
  title: "Canal produit",
  messages: [
    { from: "alex", at: T, content: "On décale la démo ?" },
    { from: "player", at: T + 1, content: "Oui, jeudi." },
  ],
});

/** Applique une suite d'ops [op, payload] sur un état de départ. */
function run(start: LibraryState, ops: [string, JsonObject][]): LibraryState {
  let s = start as unknown as LibraryState;
  for (const [op, payload] of ops) {
    s = applyLibraryOp(s as never, op, payload) as unknown as LibraryState;
  }
  return normalizeLibraryState(s as never);
}

describe("applyLibraryOp — entrée en bibliothèque (§2 : un CHOIX, dédupliqué)", () => {
  it("indexe un scenario_doc, puis l'indexer à nouveau est un no-op (idempotence)", () => {
    const s1 = run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "doc_pack", title: "Data pack", at: T }],
    ]);
    expect(Object.keys(s1.entries)).toEqual(["e1"]);
    expect(s1.entries.e1.source).toEqual({ kind: "scenario_doc", document_id: "doc_pack" });

    // Même document, autre entry_id → refusé (déjà indexé).
    const s2 = run(s1, [
      ["scenario_doc_indexed", { entry_id: "e2", document_id: "doc_pack", at: T + 1 }],
    ]);
    expect(Object.keys(s2.entries)).toEqual(["e1"]);
  });

  it("archive un mail puis un fil ; ré-archiver le même mail_id/thread_id est un no-op", () => {
    const s = run(emptyLibraryState(), [
      ["mail_archived", { entry_id: "m1", mail_id: "mail_7", snapshot: mailSnap(), at: T }],
      ["thread_archived", { entry_id: "t1", thread_id: "th_prod", snapshot: threadSnap(), at: T }],
      // doublons :
      ["mail_archived", { entry_id: "m2", mail_id: "mail_7", snapshot: mailSnap(), at: T + 1 }],
      ["thread_archived", { entry_id: "t2", thread_id: "th_prod", snapshot: threadSnap(), at: T + 1 }],
    ]);
    expect(Object.keys(s.entries).sort()).toEqual(["m1", "t1"]);
    expect(s.entries.m1.title).toBe("Budget Q3"); // titre par défaut = objet du mail
    expect(s.entries.t1.title).toBe("Canal produit");
  });

  it("refuse une entrée sans source valide (payload corrompu → no-op)", () => {
    const before = emptyLibraryState();
    const after = applyLibraryOp(before as never, "mail_archived", {
      entry_id: "x",
      mail_id: "m",
      snapshot: { subject: "sans from" },
    });
    expect(after).toBe(before); // même référence : no-op strict
  });
});

describe("applyLibraryOp — dossiers, tags, épingles, favoris", () => {
  const boot = () =>
    run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "d1", title: "A", at: T }],
      ["folder_created", { folder_id: "f1", name: "Juridique" }],
    ]);

  it("déplace dans un dossier, refuse un dossier inconnu, et à la suppression du dossier l'entrée survit", () => {
    let s = run(boot(), [["entry_moved_to_folder", { entry_id: "e1", folder_id: "f1" }]]);
    expect(s.entries.e1.folder_id).toBe("f1");

    // Dossier inconnu → no-op (folder_id inchangé).
    s = run(s, [["entry_moved_to_folder", { entry_id: "e1", folder_id: "fX" }]]);
    expect(s.entries.e1.folder_id).toBe("f1");

    // Suppression du dossier : l'entrée reste, son folder_id est retiré.
    s = run(s, [["folder_deleted", { folder_id: "f1" }]]);
    expect(s.folders.f1).toBeUndefined();
    expect(s.entries.e1).toBeDefined();
    expect(s.entries.e1.folder_id).toBeUndefined();
  });

  it("ajoute/retire des tags (dédup), bascule pin et favori", () => {
    const s = run(boot(), [
      ["tag_added", { entry_id: "e1", tag: "urgent" }],
      ["tag_added", { entry_id: "e1", tag: "urgent" }], // dédup
      ["tag_added", { entry_id: "e1", tag: "q3" }],
      ["tag_removed", { entry_id: "e1", tag: "urgent" }],
      ["pin_toggled", { entry_id: "e1" }],
      ["favorite_toggled", { entry_id: "e1" }],
      ["favorite_toggled", { entry_id: "e1" }], // re-bascule → false
    ]);
    expect(s.entries.e1.tags).toEqual(["q3"]);
    expect(s.entries.e1.pinned).toBe(true);
    expect(s.entries.e1.favorite).toBe(false);
  });
});

describe("applyLibraryOp — annotations, signets (le travail vit dans le Tool)", () => {
  const boot = () =>
    run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "d1", at: T }],
    ]);

  it("ajoute surlignage + commentaire + signet, refuse un doublon d'id, puis retire une annotation", () => {
    let s = run(boot(), [
      ["highlight_added", { entry_id: "e1", annotation_id: "a1", anchor: "10:20", excerpt: "clause 4", at: T }],
      ["comment_added", { entry_id: "e1", annotation_id: "a2", text: "à challenger", at: T + 1 }],
      ["highlight_added", { entry_id: "e1", annotation_id: "a1", anchor: "0:5", excerpt: "dup", at: T + 2 }], // id existant → no-op
      ["bookmark_added", { entry_id: "e1", bookmark_id: "b1", label: "Signature", anchor: "99:99" }],
    ]);
    expect(s.entries.e1.annotations.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(s.entries.e1.bookmarks.map((b) => b.id)).toEqual(["b1"]);

    s = run(s, [["annotation_removed", { entry_id: "e1", annotation_id: "a1" }]]);
    expect(s.entries.e1.annotations.map((a) => a.id)).toEqual(["a2"]);
  });

  it("refuse un surlignage sans excerpt et un commentaire vide", () => {
    const s = run(boot(), [
      ["highlight_added", { entry_id: "e1", annotation_id: "a1", anchor: "1:2", excerpt: "   ", at: T }],
      ["comment_added", { entry_id: "e1", annotation_id: "a2", text: "  ", at: T }],
    ]);
    expect(s.entries.e1.annotations).toEqual([]);
  });
});

describe("applyLibraryOp — liens doc↔doc (bidirectionnels)", () => {
  const boot = () =>
    run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "d1", at: T }],
      ["scenario_doc_indexed", { entry_id: "e2", document_id: "d2", at: T }],
    ]);

  it("lie deux entrées dans les deux sens, déduplique, puis délie des deux côtés", () => {
    let s = run(boot(), [
      ["entries_linked", { a: "e1", b: "e2", label: "annexe" }],
      ["entries_linked", { a: "e1", b: "e2" }], // déjà lié → no-op
    ]);
    expect(s.entries.e1.links).toEqual([{ entry_id: "e2", label: "annexe" }]);
    expect(s.entries.e2.links).toEqual([{ entry_id: "e1", label: "annexe" }]);

    s = run(s, [["entries_unlinked", { a: "e2", b: "e1" }]]);
    expect(s.entries.e1.links).toEqual([]);
    expect(s.entries.e2.links).toEqual([]);
  });

  it("supprimer une entrée retire les liens entrants et ferme sa fenêtre", () => {
    let s = run(boot(), [
      ["entries_linked", { a: "e1", b: "e2" }],
      ["entry_opened", { entry_id: "e2", at: T }],
      ["entry_removed", { entry_id: "e2" }],
    ]);
    expect(s.entries.e2).toBeUndefined();
    expect(s.entries.e1.links).toEqual([]);
    expect(s.desk.windows.some((w) => w.entry_id === "e2")).toBe(false);
  });
});

describe("applyLibraryOp — bureau (fenêtres, layout, comparaison)", () => {
  const boot = () =>
    run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "d1", at: T }],
      ["scenario_doc_indexed", { entry_id: "e2", document_id: "d2", at: T }],
      ["scenario_doc_indexed", { entry_id: "e3", document_id: "d3", at: T }],
    ]);

  it("ouvre des fenêtres (last_opened_at), règle le layout, réordonne", () => {
    let s = run(boot(), [
      ["entry_opened", { entry_id: "e1", at: T + 5 }],
      ["entry_opened", { entry_id: "e2", at: T + 6 }],
      ["entry_opened", { entry_id: "e1", at: T + 7 }], // déjà ouverte : maj last_opened_at, pas de doublon
      ["layout_set", { layout: "split-v" }],
      ["windows_reordered", { order: ["e2", "e1"] }],
    ]);
    expect(s.desk.windows.map((w) => w.entry_id)).toEqual(["e2", "e1"]);
    expect(s.desk.layout).toBe("split-v");
    expect(s.entries.e1.last_opened_at).toBe(T + 7);

    // Fermeture d'une fenêtre.
    s = run(s, [["entry_closed", { entry_id: "e2" }]]);
    expect(s.desk.windows.map((w) => w.entry_id)).toEqual(["e1"]);
  });

  it("comparaison : ouvre les deux entrées, refuse a==b, se vide si une entrée est fermée", () => {
    let s = run(boot(), [["compare_set", { a: "e1", b: "e2" }]]);
    expect(s.desk.compare).toEqual(["e1", "e2"]);
    // les deux sont ouvertes pour rendre la comparaison
    expect(s.desk.windows.map((w) => w.entry_id).sort()).toEqual(["e1", "e2"]);

    // a==b refusé
    const same = applyLibraryOp(s as never, "compare_set", { a: "e1", b: "e1" });
    expect(normalizeLibraryState(same as never).desk.compare).toEqual(["e1", "e2"]);

    // fermer une entrée en comparaison efface la comparaison
    s = run(s, [["entry_closed", { entry_id: "e1" }]]);
    expect(s.desk.compare).toBeUndefined();

    // effacer explicitement (compare_set sans a/b)
    let s2 = run(boot(), [["compare_set", { a: "e2", b: "e3" }]]);
    s2 = run(s2, [["compare_set", {}]]);
    expect(s2.desk.compare).toBeUndefined();
  });

  it("compare_set refuse une entrée inexistante", () => {
    const s = run(boot(), [["compare_set", { a: "e1", b: "eX" }]]);
    expect(s.desk.compare).toBeUndefined();
  });
});

describe("applyLibraryOp — robustesse", () => {
  it("op inconnue → même référence (no-op journalisable côté moteur)", () => {
    const s = run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "d1", at: T }],
    ]);
    const same = applyLibraryOp(s as never, "entry_teleported", { entry_id: "e1" });
    expect(same).toBe(s);
  });

  it("normalizeLibraryState relit un état corrompu : dossier orphelin, lien fantôme, fenêtre fantôme nettoyés", () => {
    const corrupt = {
      entries: {
        e1: {
          id: "e1",
          title: "A",
          source: { kind: "scenario_doc", document_id: "d1" },
          folder_id: "ghost", // dossier inexistant
          tags: ["x", "x"], // dédup
          pinned: true,
          favorite: "yes", // non-booléen → false
          added_at: T,
          annotations: [{ id: "a1", kind: "highlight", anchor: "1:2", excerpt: "e" }], // sans at → écartée
          bookmarks: [],
          links: [{ entry_id: "ghost_entry" }, { entry_id: "e1" }], // fantôme + auto-lien
        },
        bad: { id: "mismatch", source: { kind: "scenario_doc", document_id: "d2" } }, // id != clé → écarté
      },
      folders: {},
      desk: { windows: [{ entry_id: "ghost_win" }, { entry_id: "e1", order: 0 }], layout: "zigzag", compare: ["e1", "ghost"] },
    };
    const s = normalizeLibraryState(corrupt as never);
    expect(Object.keys(s.entries)).toEqual(["e1"]);
    expect(s.entries.e1.folder_id).toBeUndefined();
    expect(s.entries.e1.tags).toEqual(["x"]);
    expect(s.entries.e1.favorite).toBe(false);
    expect(s.entries.e1.annotations).toEqual([]); // annotation sans `at` écartée
    expect(s.entries.e1.links).toEqual([]); // fantôme + auto-lien retirés
    expect(s.desk.windows.map((w) => w.entry_id)).toEqual(["e1"]);
    expect(s.desk.layout).toBe("single"); // layout inconnu → défaut
    expect(s.desk.compare).toBeUndefined(); // paire invalide
  });

  it("l'immutabilité est respectée : l'état d'entrée n'est pas muté", () => {
    const s0 = run(emptyLibraryState(), [
      ["scenario_doc_indexed", { entry_id: "e1", document_id: "d1", at: T }],
    ]);
    const snapshot = JSON.stringify(s0);
    applyLibraryOp(s0 as never, "tag_added", { entry_id: "e1", tag: "z" });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});
