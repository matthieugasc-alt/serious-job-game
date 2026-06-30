/**
 * useTTS — text-to-speech with OpenAI primary + Web Speech API fallback.
 *
 * Owns:
 *   - isSpeakingTTS state (UI uses it to pulse the avatar)
 *   - speakingActorId state (which actor is currently speaking)
 *   - the audio ref (so we can interrupt with `cancel`)
 *
 * Exposes:
 *   - speakTTS(text, lang, actorId?)
 *   - cancel()  — stops both the audio element AND speechSynthesis
 *   - resolveVoice(actorId?) for non-TTS callers (e.g. transcript log)
 */

import { useCallback, useRef, useState } from "react";
import type { ScenarioDefinition } from "@/app/lib/types";

export function useTTS(args: {
  scenario: ScenarioDefinition | null;
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
}) {
  const { scenario, apiHeaders } = args;
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const [speakingActorId, setSpeakingActorId] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const resolveVoice = useCallback((actorId?: string): string => {
    if (actorId && scenario?.actors) {
      const actor = (scenario.actors as any[]).find((a: any) => a.actor_id === actorId);
      if (actor?.tts_voice) return actor.tts_voice;
    }
    const defaults: Record<string, string> = {
      yuki_tanaka: "nova",
      sophie_renard: "shimmer",
      nathalie_morel: "coral",
      enfants_cmj: "fable",
      player: "echo",
    };
    if (actorId && defaults[actorId]) return defaults[actorId];
    return "nova";
  }, [scenario]);

  const speakTTSFallback = useCallback((text: string, lang: string, actorId?: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        setIsSpeakingTTS(false);
        setSpeakingActorId(null);
        resolve();
        return;
      }
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      const voices = speechSynthesis.getVoices();
      const langPrefix = lang.split("-")[0];
      const preferred = voices.find(v => v.lang.startsWith(langPrefix) && (v.name.includes("Google") || v.name.includes("Microsoft")))
        || voices.find(v => v.lang.startsWith(langPrefix));
      if (preferred) utterance.voice = preferred;

      if (actorId) setSpeakingActorId(actorId);
      setIsSpeakingTTS(true);

      utterance.onend = () => { setIsSpeakingTTS(false); setSpeakingActorId(null); resolve(); };
      utterance.onerror = () => { setIsSpeakingTTS(false); setSpeakingActorId(null); resolve(); };
      speechSynthesis.speak(utterance);
    });
  }, []);

  const speakTTS = useCallback(async (text: string, _lang: string, actorId?: string): Promise<void> => {
    if (typeof window === "undefined") return;

    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }

    if (actorId) setSpeakingActorId(actorId);
    setIsSpeakingTTS(true);

    try {
      const voice = resolveVoice(actorId);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text, voice, speed: 1.15 }),
      });

      if (!res.ok) {
        console.warn("TTS API error, falling back to Web Speech API");
        await speakTTSFallback(text, _lang, actorId);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeakingTTS(false);
          setSpeakingActorId(null);
          ttsAudioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setIsSpeakingTTS(false);
          setSpeakingActorId(null);
          ttsAudioRef.current = null;
          resolve();
        };
        audio.play().catch(() => {
          setIsSpeakingTTS(false);
          setSpeakingActorId(null);
          ttsAudioRef.current = null;
          resolve();
        });
      });
    } catch (err) {
      console.warn("TTS fetch failed, falling back to Web Speech API:", err);
      await speakTTSFallback(text, _lang, actorId);
    }
  }, [resolveVoice, apiHeaders, speakTTSFallback]);

  const cancel = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingTTS(false);
    setSpeakingActorId(null);
  }, []);

  return {
    isSpeakingTTS,
    speakingActorId,
    speakTTS,
    speakTTSFallback,
    resolveVoice,
    cancel,
    ttsAudioRef,
  };
}
