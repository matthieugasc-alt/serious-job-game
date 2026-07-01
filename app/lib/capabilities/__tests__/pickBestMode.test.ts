/**
 * Tests unit — pickBestMode, normalizePhaseModes, adjustTimerForMode (V3).
 */

import { describe, it, expect } from "vitest";
import {
  pickBestMode,
  normalizePhaseModes,
  adjustTimerForMode,
  isVoiceMode,
} from "../pickBestMode";
import type { VoiceCapabilityStatus } from "../voiceCapability";

// ─── Fixtures ────────────────────────────────────────────────────

const READY: VoiceCapabilityStatus = Object.freeze({
  usable: true,
  reason: "ready",
  api: {
    hasGetUserMedia: true,
    hasMediaRecorder: true,
    hasSpeechRecognition: true,
    recommendedMode: "native" as const,
  },
  probed: true,
});

const DENIED: VoiceCapabilityStatus = Object.freeze({
  usable: false,
  reason: "permission_denied",
  api: {
    hasGetUserMedia: true,
    hasMediaRecorder: true,
    hasSpeechRecognition: true,
    recommendedMode: "native" as const,
  },
  probed: true,
});

// ─── normalizePhaseModes ────────────────────────────────────────

describe("normalizePhaseModes", () => {
  it("préserve interaction_modes: array", () => {
    expect(normalizePhaseModes({ interaction_modes: ["voice", "text"] }))
      .toEqual(["voice", "text"]);
  });

  it("wrap legacy interaction_mode: string en array + append text", () => {
    expect(normalizePhaseModes({ interaction_mode: "voice_qa" }))
      .toEqual(["voice_qa", "text"]);
  });

  it("interaction_modes gagne sur interaction_mode si les deux", () => {
    expect(
      normalizePhaseModes({
        interaction_modes: ["chat_mail"],
        interaction_mode: "voice_qa",
      }),
    ).toEqual(["chat_mail", "text"]);
  });

  it("phase absent / null / vide → default ['text']", () => {
    expect(normalizePhaseModes(null)).toEqual(["text"]);
    expect(normalizePhaseModes(undefined)).toEqual(["text"]);
    expect(normalizePhaseModes({})).toEqual(["text"]);
    expect(normalizePhaseModes({ interaction_modes: [] })).toEqual(["text"]);
  });

  it("text déjà présent → pas de doublon", () => {
    expect(normalizePhaseModes({ interaction_modes: ["text", "voice"] }))
      .toEqual(["text", "voice"]);
  });

  it("filtre les entrées non-string dans interaction_modes", () => {
    expect(
      normalizePhaseModes({
        interaction_modes: ["voice", 42 as unknown as string, null as unknown as string, "text"],
      }),
    ).toEqual(["voice", "text"]);
  });
});

// ─── isVoiceMode ─────────────────────────────────────────────────

describe("isVoiceMode", () => {
  it("classifie correctement voice + voice_qa comme voice", () => {
    expect(isVoiceMode("voice")).toBe(true);
    expect(isVoiceMode("voice_qa")).toBe(true);
  });

  it("text, chat_mail, presentation ne sont PAS des voice modes", () => {
    expect(isVoiceMode("text")).toBe(false);
    expect(isVoiceMode("chat_mail")).toBe(false);
    expect(isVoiceMode("presentation")).toBe(false);
  });
});

// ─── pickBestMode ────────────────────────────────────────────────

describe("pickBestMode", () => {
  it("READY + [voice, text] → voice sans downgrade", () => {
    const r = pickBestMode({ interaction_modes: ["voice", "text"] }, READY);
    expect(r.mode).toBe("voice");
    expect(r.preferred).toBe("voice");
    expect(r.downgraded).toBe(false);
    expect(r.downgradeReason).toBe("");
  });

  it("DENIED + [voice, text] → text AVEC downgrade", () => {
    const r = pickBestMode({ interaction_modes: ["voice", "text"] }, DENIED);
    expect(r.mode).toBe("text");
    expect(r.preferred).toBe("voice");
    expect(r.downgraded).toBe(true);
    expect(r.downgradeReason).toBe("permission_denied");
  });

  it("DENIED + [voice_qa] seul (via legacy) → text AVEC downgrade", () => {
    const r = pickBestMode({ interaction_mode: "voice_qa" }, DENIED);
    expect(r.mode).toBe("text");
    expect(r.preferred).toBe("voice_qa");
    expect(r.downgraded).toBe(true);
  });

  it("READY + [chat_mail] → chat_mail sans downgrade (mode non-voix)", () => {
    const r = pickBestMode({ interaction_modes: ["chat_mail"] }, READY);
    expect(r.mode).toBe("chat_mail");
    expect(r.downgraded).toBe(false);
  });

  it("phase vide → default text sans downgrade", () => {
    const r = pickBestMode({}, READY);
    expect(r.mode).toBe("text");
    expect(r.preferred).toBe("text");
    expect(r.downgraded).toBe(false);
  });

  it("préserve l'ordre des préférences (premier compatible gagne)", () => {
    const r = pickBestMode(
      { interaction_modes: ["voice", "voice_qa", "text"] },
      DENIED,
    );
    // Les deux premiers sont voice, DENIED → skip les deux → text.
    expect(r.mode).toBe("text");
  });
});

// ─── adjustTimerForMode ──────────────────────────────────────────

describe("adjustTimerForMode", () => {
  it("pas de max_duration_sec → null partout", () => {
    const r = adjustTimerForMode({ interaction_modes: ["text"] }, "text");
    expect(r.effectiveMaxDurationSec).toBe(null);
    expect(r.baseMaxDurationSec).toBe(null);
    expect(r.disabled).toBe(false);
  });

  it("max_duration_sec sans mode_config → passe tel quel (mult=1)", () => {
    const r = adjustTimerForMode({ max_duration_sec: 120 }, "text");
    expect(r.effectiveMaxDurationSec).toBe(120);
    expect(r.baseMaxDurationSec).toBe(120);
    expect(r.appliedMultiplier).toBe(1);
  });

  it("mode_config.text.timer_multiplier=3 → 120*3=360", () => {
    const r = adjustTimerForMode(
      {
        max_duration_sec: 120,
        mode_config: { text: { timer_multiplier: 3 } },
      },
      "text",
    );
    expect(r.effectiveMaxDurationSec).toBe(360);
    expect(r.appliedMultiplier).toBe(3);
  });

  it("mode_config.text.disable_timer=true → null + disabled", () => {
    const r = adjustTimerForMode(
      {
        max_duration_sec: 120,
        mode_config: { text: { disable_timer: true } },
      },
      "text",
    );
    expect(r.effectiveMaxDurationSec).toBe(null);
    expect(r.disabled).toBe(true);
    expect(r.baseMaxDurationSec).toBe(120);
  });

  it("timer_multiplier=0 est équivalent à disable_timer", () => {
    const r = adjustTimerForMode(
      {
        max_duration_sec: 120,
        mode_config: { text: { timer_multiplier: 0 } },
      },
      "text",
    );
    expect(r.effectiveMaxDurationSec).toBe(null);
    expect(r.disabled).toBe(true);
  });

  it("mode_config d'un autre mode n'affecte pas celui pické", () => {
    const r = adjustTimerForMode(
      {
        max_duration_sec: 120,
        mode_config: { text: { timer_multiplier: 3 } },
      },
      "voice",
    );
    expect(r.effectiveMaxDurationSec).toBe(120);
    expect(r.appliedMultiplier).toBe(1);
  });

  it("multiplier négatif est ignoré (défaut = 1)", () => {
    const r = adjustTimerForMode(
      {
        max_duration_sec: 100,
        mode_config: { text: { timer_multiplier: -5 } },
      },
      "text",
    );
    expect(r.effectiveMaxDurationSec).toBe(100);
    expect(r.appliedMultiplier).toBe(1);
  });

  it("arrondit correctement (Math.round)", () => {
    const r = adjustTimerForMode(
      {
        max_duration_sec: 100,
        mode_config: { text: { timer_multiplier: 2.5 } },
      },
      "text",
    );
    expect(r.effectiveMaxDurationSec).toBe(250);
  });
});
