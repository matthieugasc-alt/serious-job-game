/**
 * Tests unit — probeVoiceCapability() (V1).
 *
 * Runs in node (vitest env=node), so we mock the browser globals we need.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  probeVoiceCapability,
  humanReasonMessage,
} from "../voiceCapability";

// ─── Utilities ──────────────────────────────────────────────────

interface MockNavigator {
  mediaDevices?: { getUserMedia?: unknown };
  permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> };
}

function setBrowserGlobals(opts: {
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  hasSpeechRecognition: boolean;
  permissionState?: "granted" | "denied" | "prompt" | null | "throw";
}) {
  const nav: MockNavigator = {};
  if (opts.hasGetUserMedia) {
    nav.mediaDevices = { getUserMedia: () => Promise.resolve() };
  }
  if (opts.permissionState !== null && opts.permissionState !== undefined) {
    if (opts.permissionState === "throw") {
      nav.permissions = { query: () => Promise.reject(new Error("nope")) };
    } else {
      nav.permissions = {
        query: () => Promise.resolve({ state: opts.permissionState as string }),
      };
    }
  }

  (globalThis as unknown as { window: object }).window = {
    isSecureContext: opts.isSecureContext,
    MediaRecorder: opts.hasMediaRecorder ? function () {} : undefined,
    SpeechRecognition: opts.hasSpeechRecognition ? function () {} : undefined,
  };
  (globalThis as unknown as { navigator: MockNavigator }).navigator = nav;
}

function clearBrowserGlobals() {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { navigator?: unknown }).navigator;
}

// ─── Tests ───────────────────────────────────────────────────────

describe("probeVoiceCapability — SSR", () => {
  beforeEach(() => clearBrowserGlobals());
  afterEach(() => clearBrowserGlobals());

  it("renvoie un status non-usable et reason=no_api en SSR", async () => {
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(false);
    expect(status.reason).toBe("no_api");
    expect(status.probed).toBe(false);
  });
});

describe("probeVoiceCapability — browser scenarios", () => {
  afterEach(() => clearBrowserGlobals());

  it("insecure_context: HTTP non-localhost → usable=false", async () => {
    setBrowserGlobals({
      isSecureContext: false,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: "granted",
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(false);
    expect(status.reason).toBe("insecure_context");
  });

  it("no_api: pas de getUserMedia → usable=false", async () => {
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: false,
      hasMediaRecorder: false,
      hasSpeechRecognition: false,
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(false);
    expect(status.reason).toBe("no_api");
  });

  it("permission_denied: Permissions API renvoie 'denied' → usable=false", async () => {
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: "denied",
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(false);
    expect(status.reason).toBe("permission_denied");
  });

  it("permission_prompt: Permissions API renvoie 'prompt' → usable=true", async () => {
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: "prompt",
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(true);
    expect(status.reason).toBe("permission_prompt");
  });

  it("ready: permission granted → usable=true, reason=ready", async () => {
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: "granted",
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(true);
    expect(status.reason).toBe("ready");
  });

  it("ready: Permissions API absente → usable=true, probed=false", async () => {
    // Safari <16 case: no permissions API for microphone.
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: null,
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(true);
    expect(status.reason).toBe("ready");
    expect(status.probed).toBe(false);
  });

  it("ready: Permissions API throw (descriptor inconnu) → traité comme null", async () => {
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: "throw",
    });
    const status = await probeVoiceCapability();
    expect(status.usable).toBe(true);
    expect(status.reason).toBe("ready");
    expect(status.probed).toBe(false);
  });

  it("le status est bien frozen (immutable)", async () => {
    setBrowserGlobals({
      isSecureContext: true,
      hasGetUserMedia: true,
      hasMediaRecorder: true,
      hasSpeechRecognition: true,
      permissionState: "granted",
    });
    const status = await probeVoiceCapability();
    expect(Object.isFrozen(status)).toBe(true);
  });
});

describe("humanReasonMessage", () => {
  it("ready et permission_prompt → chaîne vide (mode voix tenté)", () => {
    expect(humanReasonMessage("ready")).toBe("");
    expect(humanReasonMessage("permission_prompt")).toBe("");
  });

  it("chaque reason non-usable a un message non-vide", () => {
    const reasons = [
      "permission_denied",
      "no_device",
      "insecure_context",
      "no_api",
      "unknown_error",
    ] as const;
    for (const r of reasons) {
      const msg = humanReasonMessage(r);
      expect(msg.length).toBeGreaterThan(10);
      expect(msg.toLowerCase()).toContain("texte");
    }
  });

  it("exhaustif : tous les VoiceCapabilityReason sont couverts", () => {
    // Si un nouveau reason est ajouté sans update ici, le switch renverra undefined.
    // Ce test vérifie qu'aucun cas ne renvoie undefined.
    const reasons = [
      "ready",
      "permission_prompt",
      "permission_denied",
      "no_device",
      "insecure_context",
      "no_api",
      "unknown_error",
    ] as const;
    for (const r of reasons) {
      expect(typeof humanReasonMessage(r)).toBe("string");
    }
  });
});
