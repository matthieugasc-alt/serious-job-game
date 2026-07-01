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
  it("resolveEventId prefers explicit id, falls back to hash of content", () => {
    expect(resolveEventId({ id: "custom" }, 0)).toBe("custom");
    expect(resolveEventId({ event_id: "alt" }, 0)).toBe("alt");
    // Fallback : le tracker construit un fallback stable basé sur l'index.
    const fallback = resolveEventId({ content: "hi" }, 3);
    expect(typeof fallback).toBe("string");
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("buildEntryEventKey formats phaseId::eventId consistently", () => {
    expect(buildEntryEventKey("phase_2", "evt_1")).toBe("phase_2::evt_1");
    expect(buildEntryEventKey("phase_3_pacte", "briefing")).toBe("phase_3_pacte::briefing");
  });

  it("computeEntryEventKey combines phaseId + resolved event id", () => {
    const key = computeEntryEventKey("phase_2", { id: "greet" }, 0);
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
    const k1 = computeEntryEventKey("phase_1", { id: "intro" }, 0);
    const k2 = computeEntryEventKey("phase_2", { id: "intro" }, 0);
    expect(k1).not.toBe(k2);
  });
});
