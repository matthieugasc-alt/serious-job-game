/**
 * Injection des artefacts joints dans l'analyse : sentMails / formatMail /
 * lastFormalisation exposent le snapshot exhaustif du mail — sans qu'aucun
 * Tool ne soit lu (le snapshot voyage dans l'action mail_sent).
 */

import { describe, it, expect } from "vitest";
import type { LoggedAction, StepInvocationV3, WorkspaceState } from "@/app/lib/engine/workspace";
import { sentMails, formatMail, lastFormalisation } from "../specHelpers";

const step = { step_id: "s1" } as StepInvocationV3;

const log: LoggedAction[] = [
  {
    at: 10,
    step_id: "s1",
    action: {
      type: "mail_sent",
      to: ["emma"],
      subject: "Mon plan",
      body: "Voici le plan.",
      attachment_artifacts: [
        { tool: "decision-engine", id: "bd1", kind: "board", title: "Roadmap", snapshot: "TABLEAU (kanban) : Roadmap\n• Livrer OAuth [statut=todo]" },
      ],
    },
  },
];

const ws = { mailbox: { sent: [] } } as unknown as WorkspaceState;

describe("specHelpers — artefacts joints dans l'analyse", () => {
  it("sentMails remonte les artefacts", () => {
    const m = sentMails(log, step)[0];
    expect(m.artifacts).toHaveLength(1);
    expect(m.artifacts![0].snapshot).toContain("Livrer OAuth");
  });

  it("formatMail concatène le contenu intégral des artefacts", () => {
    const out = formatMail(sentMails(log, step)[0]);
    expect(out).toContain("Artefacts joints");
    expect(out).toContain("Roadmap");
    expect(out).toContain("statut=todo");
  });

  it("lastFormalisation inclut le snapshot (vue exhaustive pour l'IA)", () => {
    const out = lastFormalisation(ws, log, step);
    expect(out).toContain("Voici le plan.");
    expect(out).toContain("Livrer OAuth");
  });

  it("un mail sans artefact ne produit pas de section artefacts", () => {
    const bare: LoggedAction[] = [
      { at: 5, step_id: "s1", action: { type: "mail_sent", to: ["x"], subject: "s", body: "corps" } },
    ];
    expect(formatMail(sentMails(bare, step)[0])).not.toContain("Artefacts joints");
  });
});
