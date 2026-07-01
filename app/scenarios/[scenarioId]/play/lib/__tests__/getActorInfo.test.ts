/**
 * Tests unit — getActorInfo.
 *
 * Vérifie la résolution du placeholder chosen_cto et le fallback quand
 * l'actor n'existe pas dans la liste.
 */

import { describe, it, expect } from "vitest";
import { getActorInfo } from "../getActorInfo";

const ACTORS = [
  {
    actor_id: "sofia_renault",
    name: "Sofia Renault",
    avatar: { color: "#5b5fc7", initials: "SR" },
    contact_status: "available",
  },
  {
    actor_id: "thomas_vidal",
    name: "Thomas Vidal",
    avatar: { color: "#e94b3c", initials: "TV" },
    contact_status: "busy",
  },
];

describe("getActorInfo", () => {
  it("returns full info for a known actor", () => {
    const info = getActorInfo("sofia_renault", ACTORS, null);
    expect(info).toEqual({
      name: "Sofia Renault",
      color: "#5b5fc7",
      initials: "SR",
      status: "available",
    });
  });

  it("resolves chosen_cto → actual actor when chosenCtoId is set", () => {
    const info = getActorInfo("chosen_cto", ACTORS, "thomas_vidal");
    expect(info.name).toBe("Thomas Vidal");
    expect(info.status).toBe("busy");
  });

  it("returns raw actorId as name when unknown", () => {
    const info = getActorInfo("unknown_id", ACTORS, null);
    expect(info.name).toBe("unknown_id");
    expect(info.color).toBe("#666"); // fallback color
    expect(info.status).toBe("offline"); // fallback status
    // Initials fallback = uppercase du premier char.
    expect(info.initials.length).toBeGreaterThan(0);
  });

  it("does not resolve chosen_cto when chosenCtoId is null", () => {
    const info = getActorInfo("chosen_cto", ACTORS, null);
    // Reste sur "chosen_cto" comme actor_id à chercher → fallback name.
    expect(info.name).toBe("chosen_cto");
  });

  it("derives initials from name when actor.avatar.initials missing", () => {
    const info = getActorInfo("plain", [{ actor_id: "plain", name: "Jean Dupont" }], null);
    // "Jean Dupont" → "JD"
    expect(info.initials).toBe("JD");
    expect(info.name).toBe("Jean Dupont");
  });
});
