/**
 * Pièces jointes « artefact » d'un mail — côté reducer :
 *  - artifact_attached_to_mail insère le lien dans le brouillon + dédup,
 *  - mail_draft_saved persiste les références,
 *  - mail_sent grave les snapshots dans le mail envoyé.
 */

import { describe, it, expect } from "vitest";
import type { ArtifactRef, WorkspaceAction } from "../workspace";
import { buildArtifactHref } from "../artifactLink";
import { initializeSessionV3 } from "../sessionV3";
import type { SessionV3State } from "../sessionV3";
import { applyWorkspaceAction, enterStep } from "../workspaceReducer";
import { FAKE_DIRECTIVES, makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;
const REF: ArtifactRef = { tool: "decision-engine", id: "bd1", kind: "board", title: "Roadmap" };

function boot(): SessionV3State {
  const scenario = makeScenario([makeStep({ step_id: "s1" }), makeStep({ step_id: "s2" })]);
  const session = initializeSessionV3(scenario, T0);
  enterStep(session, { now: T0 });
  return session;
}

const dispatch = (s: SessionV3State, a: WorkspaceAction, now = T0 + 1) =>
  applyWorkspaceAction(s, a, { now, specs: FAKE_DIRECTIVES });

describe("artifact_attached_to_mail", () => {
  it("insère le lien cliquable dans le corps + enregistre la référence", () => {
    const s = boot();
    dispatch(s, { type: "artifact_attached_to_mail", ref: REF });
    const draft = s.workspace.mailbox.drafts.compose;
    expect(draft.body).toContain(buildArtifactHref(REF));
    expect(draft.body).toContain("Roadmap");
    expect(draft.artifact_refs).toEqual([REF]);
  });

  it("dédup : joindre deux fois le même artefact n'ajoute qu'un lien et une référence", () => {
    const s = boot();
    dispatch(s, { type: "artifact_attached_to_mail", ref: REF });
    dispatch(s, { type: "artifact_attached_to_mail", ref: REF });
    const draft = s.workspace.mailbox.drafts.compose;
    expect(draft.artifact_refs).toHaveLength(1);
    expect(draft.body.split(buildArtifactHref(REF))).toHaveLength(2); // une seule occurrence
  });
});

describe("mail_sent — snapshots figés", () => {
  it("grave attachment_artifacts (snapshot inclus) dans le mail envoyé", () => {
    const s = boot();
    const artifact = { ...REF, snapshot: "TABLEAU (kanban) : Roadmap\n1 élément(s)" };
    dispatch(s, {
      type: "mail_sent",
      to: ["alex"],
      subject: "Mon plan",
      body: "Voici.",
      attachment_artifacts: [artifact],
    });
    const sent = s.workspace.mailbox.sent.at(-1)!;
    expect(sent.attachment_artifacts).toEqual([artifact]);
  });
});
