"use client";

/**
 * UI de la mécanique "presentation" :
 *   phase 1 — préparation : brief + documents + chrono de préparation ;
 *   phase 2 — exposé : chrono (timeLimitS), micro + transcription si la
 *   capability voix est utilisable (pattern voiceCapture, route
 *   /api/transcribe), textarea en fallback et toujours éditable.
 * À l'expiration ou sur "Terminer" : record(voice) → observe → onComplete.
 * Reprise après refresh via scratch (phase, horodatages, brouillon).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  JsonObject,
  MechanicProps,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";
import { CountdownTimer } from "@/app/player/primitives/CountdownTimer";
import { DocumentViewer } from "@/app/player/primitives/DocumentViewer";
import {
  probeVoiceCapability,
  humanReasonMessage,
  type VoiceCapabilityStatus,
} from "@/app/lib/capabilities";
import {
  startVoiceCapture,
  type VoiceCaptureSession,
} from "@/app/lib/voiceCapture";
import {
  buildOutput,
  computeDurationS,
  remainingSeconds,
  resolveLang,
  resolvePreparationS,
  resolveTimeLimitS,
} from "./Runtime";

type Phase = "prepare" | "speak";

export function PresentationComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const brief = typeof params.brief === "string" ? params.brief : "";
  const preparationS = resolvePreparationS(params);
  const timeLimitS = resolveTimeLimitS(context.timeLimitS);
  const lang = resolveLang(params);

  // ── Reprise depuis le scratch ──
  const scratch = context.scratch;
  const initialPhase: Phase =
    scratch.phase === "speak" || preparationS === 0 ? "speak" : "prepare";
  const prepareStartedAtRef = useRef<number>(
    typeof scratch.prepare_started_at === "number"
      ? scratch.prepare_started_at
      : Date.now(),
  );
  const speakStartedAtRef = useRef<number | null>(
    typeof scratch.speak_started_at === "number"
      ? scratch.speak_started_at
      : initialPhase === "speak"
        ? Date.now()
        : null,
  );

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [speech, setSpeech] = useState<string>(
    typeof scratch.speech === "string" ? scratch.speech : "",
  );
  const speechRef = useRef(speech);
  speechRef.current = speech;

  const [capability, setCapability] = useState<VoiceCapabilityStatus | null>(
    null,
  );
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const voiceSessionRef = useRef<VoiceCaptureSession | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const doneRef = useRef(false);

  const persistScratch = useCallback(
    (patch: JsonObject = {}) => {
      context.io.saveScratch({
        phase,
        prepare_started_at: prepareStartedAtRef.current,
        speak_started_at: speakStartedAtRef.current,
        speech: speechRef.current,
        ...patch,
      });
    },
    [context.io, phase],
  );

  // Boot : probe capability voix + persistance du départ de phase.
  useEffect(() => {
    let mounted = true;
    void probeVoiceCapability().then((status) => {
      if (mounted) setCapability(status);
    });
    persistScratch();
    return () => {
      mounted = false;
      // Libère le micro si le composant est démonté en cours de capture.
      void voiceSessionRef.current?.cancel();
      voiceSessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSpeak = useCallback(() => {
    if (speakStartedAtRef.current === null) {
      speakStartedAtRef.current = Date.now();
    }
    setPhase("speak");
    context.io.saveScratch({
      phase: "speak",
      prepare_started_at: prepareStartedAtRef.current,
      speak_started_at: speakStartedAtRef.current,
      speech: speechRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.io]);

  // ── Micro (pattern voiceCapture : natif → backend → fallback texte) ──

  const startMic = async () => {
    setMicError(null);
    try {
      const session = await startVoiceCapture({
        lang,
        onInterim: setInterim,
        onFinal: setInterim,
      });
      voiceSessionRef.current = session;
      setRecording(true);
    } catch (err) {
      setMicError(
        (err as { message?: string })?.message ??
          "Micro indisponible — utilisez la zone de texte.",
      );
    }
  };

  /** Arrête la capture et rapatrie le transcript dans la zone de texte. */
  const stopMic = async (): Promise<string> => {
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    setRecording(false);
    setInterim("");
    if (!session) return speechRef.current;
    try {
      const result = await session.stop();
      if (result.source === "error") {
        setMicError(result.errorMessage ?? "La transcription a échoué — complétez en texte.");
      }
      const merged = [speechRef.current, result.transcript]
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
      speechRef.current = merged;
      setSpeech(merged);
      return merged;
    } catch {
      setMicError("La transcription a échoué — complétez en texte.");
      return speechRef.current;
    }
  };

  // ── Fin d'exposé (bouton "Terminer" ou expiration du chrono) ──

  const finalize = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFinishing(true);
    setError(null);
    try {
      const finalSpeech = (
        voiceSessionRef.current ? await stopMic() : speechRef.current
      ).trim();
      const durationS = computeDurationS(
        speakStartedAtRef.current,
        Date.now(),
        timeLimitS,
      );
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "voice",
        role: "player",
        content: finalSpeech,
      };
      context.io.record(event);
      transcriptRef.current = [
        ...transcriptRef.current,
        { ...event, at: Date.now() },
      ];
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript: [...transcriptRef.current],
        artifacts: { speech: finalSpeech, duration_s: durationS },
      });
      onComplete({ observation, output: buildOutput(finalSpeech, durationS) });
    } catch {
      doneRef.current = false;
      setFinishing(false);
      setError("L'observation a échoué. Cliquez à nouveau sur « Terminer »." );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.io, context.criteria, onComplete, timeLimitS]);

  const onSpeakExpire = useCallback(() => {
    void finalize();
  }, [finalize]);

  // ── Rendu ──

  if (phase === "prepare") {
    const remaining = remainingSeconds(
      prepareStartedAtRef.current,
      Date.now(),
      preparationS,
    );
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-3">
          <p className="text-sm font-medium">Préparation de votre présentation</p>
          <div className="flex items-center gap-3">
            <CountdownTimer
              key="prepare"
              seconds={remaining}
              running
              onExpire={startSpeak}
            />
            <button
              className="rounded bg-black px-4 py-2 text-sm text-white"
              onClick={startSpeak}
            >
              Commencer l'exposé
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-50">
            Brief
          </p>
          <p className="whitespace-pre-wrap text-sm">{brief}</p>
        </div>
        {context.documents.length > 0 && (
          <div className="max-h-[45%] min-h-0 border-t">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
      </div>
    );
  }

  const speakRemaining = remainingSeconds(
    speakStartedAtRef.current,
    Date.now(),
    timeLimitS,
  );
  const voiceUsable = capability?.usable === true;
  const fallbackMessage = capability && !capability.usable
    ? humanReasonMessage(capability.reason)
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-50">
            Votre présentation
          </p>
          <p className="truncate text-sm font-medium">{brief}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CountdownTimer
            key="speak"
            seconds={speakRemaining}
            running={!finishing}
            onExpire={onSpeakExpire}
          />
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={finishing}
            onClick={() => void finalize()}
          >
            {finishing ? "Observation…" : "Terminer"}
          </button>
        </div>
      </div>

      {(error || micError || fallbackMessage) && (
        <div className="space-y-1 border-b bg-amber-50 px-4 py-2">
          {error && <p className="text-xs text-red-700">{error}</p>}
          {micError && <p className="text-xs text-amber-900">{micError}</p>}
          {!micError && fallbackMessage && (
            <p className="text-xs text-amber-900">{fallbackMessage}</p>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {voiceUsable && (
          <div className="flex items-center gap-3">
            <button
              className={`rounded px-4 py-2 text-sm text-white ${
                recording ? "bg-red-600" : "bg-black"
              }`}
              disabled={finishing}
              onClick={() => (recording ? void stopMic() : void startMic())}
            >
              {recording ? "■ Arrêter le micro" : "● Parler au micro"}
            </button>
            {recording && (
              <p className="min-w-0 flex-1 truncate text-xs italic opacity-60">
                {interim || "Enregistrement en cours…"}
              </p>
            )}
          </div>
        )}
        <textarea
          className="min-h-0 flex-1 resize-none rounded border px-3 py-2 text-sm"
          placeholder="Prononcez votre présentation… (le texte dicté au micro s'ajoute ici)"
          value={speech}
          disabled={finishing}
          onChange={(e) => setSpeech(e.target.value)}
          onBlur={() => persistScratch()}
        />
      </div>
    </div>
  );
}
