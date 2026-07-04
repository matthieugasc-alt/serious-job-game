/**
 * Tests de l'API PUBLIQUE (api.ts) : les constructeurs rendent des
 * actions `tool_op` bien formées (ids/at explicites en test → replay
 * déterministe), et les sélecteurs purs lisent le Json brut de
 * toolStates["bibliotheque"] (dont la recherche plein texte).
 */

import { describe, it, expect } from "vitest";
import {
  addComment,
  addHighlight,
  applyLibraryOp,
  archiveMail,
  archiveThread,
  createFolder,
  indexScenarioDoc,
  linkEntries,
  searchEntries,
  selectAllTags,
  selectByFolder,
  selectByTag,
  selectCompare,
  selectFolders,
  selectLinks,
  selectOpenWindows,
  selectRecent,
  selectSorted,
  setCompare,
  toggleFavorite,
} from "../api";
import type { LibraryToolOp } from "../api";
import type { Json } from "@/app/lib/engine/mechanics";

const T = 5_000;

/** Rejoue une suite d'ops construites par l'API sur un état Json. */
function reduce(ops: LibraryToolOp[], start: Json = null): Json {
  return ops.reduce<Json>((s, o) => applyLibraryOp(s, o.op, o.payload), start);
}

describe("constructeurs d'ops — forme tool_op", () => {
  it("indexScenarioDoc porte document_id, title, entry_id, at", () => {
    const o = indexScenarioDoc("doc_1", "Data pack", { id: "e1", at: T });
    expect(o).toEqual({
      type: "tool_op",
      tool_id: "bibliotheque",
      op: "scenario_doc_indexed",
      payload: { entry_id: "e1", document_id: "doc_1", title: "Data pack", at: T },
    });
  });

  it("archiveMail/archiveThread portent le snapshot complet", () => {
    const m = archiveMail(
      { mail_id: "mail_9", snapshot: { from: "cfo", to: ["player"], subject: "S", body: "B", at: T }, tags: ["fin"] },
      { id: "m1", at: T },
    );
    expect(m.op).toBe("mail_archived");
    expect(m.payload.mail_id).toBe("mail_9");
    expect(m.payload.tags).toEqual(["fin"]);

    const t = archiveThread(
      { thread_id: "th_1", snapshot: { title: "Canal", messages: [{ from: "a", at: T, content: "hi" }] } },
      { id: "t1", at: T },
    );
    expect(t.op).toBe("thread_archived");
    expect(t.payload.thread_id).toBe("th_1");
  });

  it("setCompare sans argument construit un compare_set vide (effacement)", () => {
    expect(setCompare().payload).toEqual({});
    expect(setCompare("e1", "e2").payload).toEqual({ a: "e1", b: "e2" });
  });
});

describe("sélecteurs — dossiers, tags, favoris, tri, récents", () => {
  const boot = (): Json =>
    reduce([
      indexScenarioDoc("d1", "Zeta", { id: "e1", at: T + 1 }),
      indexScenarioDoc("d2", "Alpha", { id: "e2", at: T + 2 }),
      archiveMail({ mail_id: "m", snapshot: { from: "x", to: [], subject: "Mail", body: "corps", at: T } }, { id: "e3", at: T + 3 }),
      createFolder("Juridique", { id: "f1" }),
    ]);

  it("selectByFolder (dont non classés), selectByTag, selectAllTags, selectFolders", () => {
    const s = reduce(
      [
        { type: "tool_op", tool_id: "bibliotheque", op: "entry_moved_to_folder", payload: { entry_id: "e1", folder_id: "f1" } },
        { type: "tool_op", tool_id: "bibliotheque", op: "tag_added", payload: { entry_id: "e1", tag: "nda" } },
        { type: "tool_op", tool_id: "bibliotheque", op: "tag_added", payload: { entry_id: "e2", tag: "nda" } },
      ],
      boot(),
    );
    expect(selectByFolder(s, "f1").map((e) => e.id)).toEqual(["e1"]);
    expect(selectByFolder(s, null).map((e) => e.id).sort()).toEqual(["e2", "e3"]);
    expect(selectByTag(s, "nda").map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(selectAllTags(s)).toEqual([{ tag: "nda", count: 2 }]);
    expect(selectFolders(s).map((f) => f.name)).toEqual(["Juridique"]);
  });

  it("selectSorted alpha/type/favorites et selectRecent (dernier ouvert d'abord)", () => {
    const s = reduce(
      [
        toggleFavorite("e3"),
        { type: "tool_op", tool_id: "bibliotheque", op: "entry_opened", payload: { entry_id: "e1", at: T + 50 } },
      ],
      boot(),
    );
    expect(selectSorted(s, "alpha").map((e) => e.title)).toEqual(["Alpha", "Mail", "Zeta"]);
    expect(selectSorted(s, "favorites")[0].id).toBe("e3");
    // type : archived_mail avant scenario_doc (ordre alpha des kinds)
    expect(selectSorted(s, "type")[0].source.kind).toBe("archived_mail");
    expect(selectRecent(s, 1)[0].id).toBe("e1"); // ouvert le plus récemment
  });
});

describe("sélecteurs — bureau, comparaison, liens", () => {
  it("selectOpenWindows respecte l'ordre, selectCompare résout la paire", () => {
    const s = reduce([
      indexScenarioDoc("d1", "A", { id: "e1", at: T }),
      indexScenarioDoc("d2", "B", { id: "e2", at: T }),
      setCompare("e1", "e2"),
    ]);
    expect(selectOpenWindows(s).map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    const pair = selectCompare(s);
    expect(pair?.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("selectLinks renvoie les entrées liées", () => {
    const s = reduce([
      indexScenarioDoc("d1", "A", { id: "e1", at: T }),
      indexScenarioDoc("d2", "B", { id: "e2", at: T }),
      linkEntries("e1", "e2", "annexe"),
    ]);
    expect(selectLinks(s, "e1").map((e) => e.id)).toEqual(["e2"]);
    expect(selectLinks(s, "e2").map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("searchEntries — recherche plein texte (sélecteur pur)", () => {
  const s = reduce([
    indexScenarioDoc("doc_budget", "Budget prévisionnel", { id: "e1", at: T + 1 }),
    archiveMail(
      { mail_id: "m1", snapshot: { from: "cfo@acme.fr", to: ["player"], subject: "Trésorerie", body: "runway 9 mois", at: T } },
      { id: "e2", at: T + 2 },
    ),
    archiveThread(
      { thread_id: "th1", snapshot: { title: "Canal juridique", messages: [{ from: "avocat", at: T, content: "clause de non-concurrence" }] } },
      { id: "e3", at: T + 3 },
    ),
  ]);
  // Contenu des scenario_doc résolu par un callback fourni par l'hôte.
  const resolve = (id: string) => (id === "doc_budget" ? "EBITDA marge churn" : "");

  it("requête vide → toutes les entrées (récent d'abord)", () => {
    expect(searchEntries(s, "").map((e) => e.id)).toEqual(["e3", "e2", "e1"]);
  });

  it("cherche dans titre, corps de mail, contenu de fil et contenu résolu", () => {
    expect(searchEntries(s, "budget").map((e) => e.id)).toEqual(["e1"]);
    expect(searchEntries(s, "runway").map((e) => e.id)).toEqual(["e2"]);
    expect(searchEntries(s, "non-concurrence").map((e) => e.id)).toEqual(["e3"]);
    // contenu résolu (scenario_doc) uniquement si le callback est fourni
    expect(searchEntries(s, "churn").map((e) => e.id)).toEqual([]);
    expect(searchEntries(s, "churn", resolve).map((e) => e.id)).toEqual(["e1"]);
  });

  it("tous les mots doivent apparaître (AND) et la recherche couvre les annotations", () => {
    const s2 = reduce(
      [
        addHighlight("e1", { anchor: "1:2", excerpt: "hypothèse optimiste" }, { id: "a1", at: T }),
        addComment("e1", { text: "creuser le scénario pessimiste" }, { id: "a2", at: T }),
      ],
      s,
    );
    expect(searchEntries(s2, "budget prévisionnel").map((e) => e.id)).toEqual(["e1"]);
    expect(searchEntries(s2, "budget introuvable").map((e) => e.id)).toEqual([]);
    expect(searchEntries(s2, "pessimiste").map((e) => e.id)).toEqual(["e1"]); // via annotation
  });
});
