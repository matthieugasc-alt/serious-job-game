import { describe, it, expect } from "vitest";
import type { WorkspaceState } from "@/app/lib/engine/workspace";
import { collectDebrief } from "../collect";

function ws(over: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    threads: {},
    mailbox: { inbox: [], sent: [], drafts: {} },
    documents: {},
    toolStates: {},
    notifications: [],
    stepStartedAt: 0,
    scenarioStartedAt: 0,
    ...over,
  } as WorkspaceState;
}

const scenario = {
  meta: { title: "Mission test", description: "Objectif de la mission" },
  competencies: ["Analyse", "Décision"],
  actors: [{ actor_id: "a1", name: "Léa" }],
  documents: [{ id: "d1", title: "Rapport" }],
  sequence: [],
};

describe("collectDebrief — signaux présents / absents (non-transparence)", () => {
  it("session vide → aucun signal (rien à pénaliser)", () => {
    const b = collectDebrief(scenario, ws(), []);
    expect(b.scenario.title).toBe("Mission test");
    expect(b.scenario.competencies).toEqual(["Analyse", "Décision"]);
    expect(Object.keys(b.signals)).toHaveLength(0);
  });

  it("une conversation présente → signal conversation (avec parts de parole)", () => {
    const b = collectDebrief(
      scenario,
      ws({
        threads: {
          t1: {
            thread_id: "t1",
            participants: ["a1"],
            messages: [
              { from: "player", content: "Quel est le besoin principal ?", at: 1 },
              { from: "actor", actor_id: "a1", content: "Migrer notre stack.", at: 2 },
            ],
            unread: 0,
          },
        },
      }),
      [],
    );
    const conv = b.signals.conversation as { speakers: unknown[]; questionsAsked: number } | undefined;
    expect(conv).toBeDefined();
    expect(conv!.speakers).toHaveLength(2);
    expect(conv!.questionsAsked).toBe(1);
    // Les autres facettes sans donnée restent absentes.
    expect(b.signals.deliverable).toBeUndefined();
    expect(b.signals.negotiation).toBeUndefined();
  });

  it("un document ouvert → signal documents", () => {
    const b = collectDebrief(scenario, ws({ documents: { d1: { opened: true, annotations: [] } } }), []);
    const docs = b.signals.documents as { opened: number; total: number } | undefined;
    expect(docs).toBeDefined();
    expect(docs!.opened).toBe(1);
    expect(docs!.total).toBe(1);
  });
});
