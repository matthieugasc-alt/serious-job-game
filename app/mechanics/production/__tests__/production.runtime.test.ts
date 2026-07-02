import { describe, it, expect } from "vitest";
import {
  parseDeliverableType,
  validateDraft,
  buildDeliverable,
  formatDeliverableContent,
  buildOutput,
  restoreDraft,
  validateParams,
} from "../Runtime";

describe("production — parseDeliverableType", () => {
  it("accepte mail et document, refuse le reste", () => {
    expect(parseDeliverableType({ deliverable_type: "mail" })).toBe("mail");
    expect(parseDeliverableType({ deliverable_type: "document" })).toBe("document");
    expect(parseDeliverableType({ deliverable_type: "rapport" })).toBeNull();
    expect(parseDeliverableType({})).toBeNull();
  });
});

describe("production — validateDraft", () => {
  it("mail : exige objet et corps non vides", () => {
    expect(validateDraft("mail", { subject: "Objet", body: "Corps" })).toEqual([]);
    expect(validateDraft("mail", { subject: "  ", body: "Corps" })).toHaveLength(1);
    expect(validateDraft("mail", { subject: "Objet", body: " " })).toHaveLength(1);
    expect(validateDraft("mail", { body: "" })).toHaveLength(2);
  });

  it("document : exige titre et corps non vides", () => {
    expect(validateDraft("document", { title: "Titre", body: "Corps" })).toEqual([]);
    expect(validateDraft("document", { title: "", body: "Corps" })).toHaveLength(1);
    expect(validateDraft("document", { title: "Titre", body: "" })).toHaveLength(1);
  });

  it("document : n'exige pas d'objet ; mail : n'exige pas de titre", () => {
    expect(validateDraft("document", { title: "T", subject: "", body: "B" })).toEqual([]);
    expect(validateDraft("mail", { subject: "S", title: "", body: "B" })).toEqual([]);
  });
});

describe("production — buildDeliverable", () => {
  it("mail : {type, to, subject, body} trimmés, sans title", () => {
    const d = buildDeliverable("mail", {
      to: " Destinataire ",
      subject: " Objet ",
      title: "ignoré",
      body: " Corps ",
    });
    expect(d).toEqual({
      type: "mail",
      to: "Destinataire",
      subject: "Objet",
      body: "Corps",
    });
  });

  it("mail sans destinataire : la clé to est absente (pas de undefined)", () => {
    const d = buildDeliverable("mail", { subject: "S", body: "B" });
    expect(d).toEqual({ type: "mail", subject: "S", body: "B" });
    expect("to" in d).toBe(false);
  });

  it("document : {type, title, body}, sans to ni subject", () => {
    const d = buildDeliverable("document", {
      title: " Titre ",
      subject: "ignoré",
      body: "Corps",
    });
    expect(d).toEqual({ type: "document", title: "Titre", body: "Corps" });
  });

  it("le livrable est JSON-sérialisable", () => {
    const d = buildDeliverable("mail", { to: "X", subject: "S", body: "B" });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});

describe("production — formatDeliverableContent", () => {
  it("mail : en-têtes À/Objet puis corps", () => {
    const s = formatDeliverableContent({
      type: "mail",
      to: "Dest",
      subject: "Obj",
      body: "Corps",
    });
    expect(s).toBe("À : Dest\nObjet : Obj\n\nCorps");
  });

  it("mail sans to : pas de ligne À", () => {
    const s = formatDeliverableContent({ type: "mail", subject: "Obj", body: "B" });
    expect(s).toBe("Objet : Obj\n\nB");
  });

  it("document : titre puis corps", () => {
    expect(
      formatDeliverableContent({ type: "document", title: "T", body: "B" }),
    ).toBe("T\n\nB");
  });
});

describe("production — buildOutput", () => {
  it("expose deliverable et body (clés du manifest)", () => {
    const d = buildDeliverable("document", { title: "T", body: "B" });
    expect(buildOutput(d)).toEqual({ deliverable: d, body: "B" });
  });
});

describe("production — restoreDraft (scratch)", () => {
  it("restaure uniquement les champs string", () => {
    expect(
      restoreDraft({ subject: "S", title: "T", body: "B", autre: 1 }),
    ).toEqual({ subject: "S", title: "T", body: "B" });
    expect(restoreDraft({ body: 42 })).toEqual({});
    expect(restoreDraft({})).toEqual({});
  });
});

describe("production — validateParams", () => {
  const valid = { deliverable_type: "mail", instructions: "Rédigez le mail." };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({
        ...valid,
        recipient_actor: "a1",
        subject_hint: "Re:",
        template: "Bonjour,",
        document_ids: ["d1"],
      }),
    ).toEqual([]);
  });

  it("refuse un deliverable_type invalide ou absent", () => {
    expect(validateParams({ instructions: "x" })).not.toEqual([]);
    expect(validateParams({ ...valid, deliverable_type: "note" })).not.toEqual([]);
  });

  it("refuse instructions vides et optionnels mal typés", () => {
    expect(validateParams({ ...valid, instructions: " " })).not.toEqual([]);
    expect(validateParams({ ...valid, recipient_actor: 3 })).not.toEqual([]);
    expect(validateParams({ ...valid, template: [] })).not.toEqual([]);
    expect(validateParams({ ...valid, document_ids: [2] })).not.toEqual([]);
  });
});
