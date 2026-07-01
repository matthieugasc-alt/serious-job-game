/**
 * Tests unit — phaseEventTracker.
 *
 * Vérifie la construction des clés d'idempotence des entry_events
 * (format `${phaseId}::${eventId}`) qui empêche la double-injection
 * du bug S0 Alex (task #81).
 */

import { describe, it, expect } from "vitest";
import {
  resolveEventId,
  computeEntryEventKey,
  buildEntryEventKey,
  hasInjectedKey,
  markInjectedKey,
} from "../phaseEventTracker";

describe("phaseEventTracker", () => {
  it("resolveEventId picks message_id > event_id > id > content-fallback", () => {
    expect(resolveEventId({ message_id: "m1", event_id: "e1", id: "i1" }, "phase_1")).toBe("m1");
    expect(resolveEventId({ event_id: "e1", id: "i1" }, "phase_1")).toBe("e1");
    expect(resolveEventId({ id: "i1" }, "phase_1")).toBe("i1");
    // Fallback content-based: "phaseId::content"
    expect(resolveEventId({ content: "hello" }, "phase_1")).toBe("phase_1::hello");
    // Empty content fallback still stable
    expect(resolveEventId({}, "phase_1")).toBe("phase_1::");
  });

  it("buildEntryEventKey formats phaseId::eventId consistently", () => {
    expect(buildEntryEventKey("phase_2", "evt_1")).toBe("phase_2::evt_1");
    expect(buildEntryEventKey("phase_3_pacte", "briefing")).toBe("phase_3_pacte::briefing");
  });

  it("computeEntryEventKey combines phaseId + resolved event id", () => {
    const key = computeEntryEventKey("phase_2", { id: "greet" });
    expect(key).toBe("phase_2::greet");
  });

  it("hasInjectedKey + markInjectedKey — pure array API", () => {
    const arr: string[] = [];
    expect(hasInjectedKey(arr, "phase_1::x")).toBe(false);
    markInjectedKey(arr, "phase_1::x");
    expect(hasInjectedKey(arr, "phase_1::x")).toBe(true);
    // Idempotent : ré-appeler mark ne duplique pas.
    markInjectedKey(arr, "phase_1::x");
    expect(arr.filter((k) => k === "phase_1::x")).toHaveLength(1);
  });

  it("keys are unique across phases (bug S0 Alex regression guard)", () => {
    // Deux phases différentes avec un event_id identique ne doivent PAS
    // partager la même clé d'injection — c'est ce qui fixait le bug S0.
    const k1 = computeEntryEventKey("phase_1", { id: "intro" });
    const k2 = computeEntryEventKey("phase_2", { id: "intro" });
    expect(k1).not.toBe(k2);
  });
});
