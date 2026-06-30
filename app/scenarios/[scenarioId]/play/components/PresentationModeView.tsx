/**
 * PresentationModeView — full-bleed view shown when the current phase
 * runs in "presentation" or "voice_qa" interaction mode.
 *
 * Two modes inside one component (they swap at the top level):
 *   - "presentation": solo recording with mic + live transcription
 *                     + spinner / explicit error states once done
 *   - "voice_qa":     jury / children panel + spoken chat history
 *                     + push-to-talk mic with optional pitch timer
 *
 * Pure presentation. All state and side-effects live in page.tsx and
 * are passed in as a single `deps` bag — the surface is big but every
 * field is named so adding a new control means editing one place only.
 */

import React from "react";
import { Avatar, TypingDots } from "./Avatars";
import { getInitials } from "../lib/playerUtils";

export type PresentationMode = "presentation" | "voice_qa";

export type VoiceCapabilitiesLite = {
  recommendedMode: "native" | "backend" | "unavailable" | string;
};

export type VoiceFatalErrorLite = {
  category: "permission_denied" | "mic_missing" | "mic_busy" | string;
  message: string;
};

export type PresentationErrorLite = {
  category: "empty_transcript" | "timeout" | "network" | "invalid_response" | "server_error";
  message: string;
};

export type ActorInfo = {
  name: string;
  color: string;
  initials: string;
  status: string;
};

export type PresentationModeViewProps = {
  mode: PresentationMode;

  // ── PRESENTATION mode ──
  voiceCapabilities: VoiceCapabilitiesLite | null;
  voiceFatalError: VoiceFatalErrorLite | null;
  presentationDone: boolean;
  presentationError: PresentationErrorLite | null;
  voiceTranscript: string;
  interimText: string;
  isRecording: boolean;
  recordingElapsed: number;
  voiceTranscribing: boolean;
  instructions: string;
  maxDurationSec: number;
  recordingLang: string;
  onStartPresentation: (lang: string) => void;
  onStopPresentation: () => void; // endPresentation("manual")
  onRetryPresentation: () => void;

  // ── VOICE_QA mode ──
  childrenNames: string[] | null;
  raisedHands: string[];
  qaWaiting: boolean;
  isSpeakingTTS: boolean;
  speakingActorId: string | null;
  currentPhaseAiActors: string[];
  conversation: any[];
  actors: any[];
  isSending: boolean;
  displayPlayerName: string;
  getActorInfo: (actorId: string) => ActorInfo;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  pitchTimerActive: boolean;
  pitchCutoff: boolean;
  pitchSecondsLeft: number;
  onChildRaiseClick: (childName: string) => void;
  onMicToggle: () => void;
};

const CHILD_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
];

export function PresentationModeView(props: PresentationModeViewProps) {
  if (props.mode === "presentation") return <PresentationRecording {...props} />;
  if (props.mode === "voice_qa") return <VoiceQAPanel {...props} />;
  return null;
}

// ════════════════════════════════════════════════════════════════════
// PRESENTATION MODE — solo recording
// ════════════════════════════════════════════════════════════════════

function PresentationRecording({
  voiceCapabilities,
  voiceFatalError,
  presentationDone,
  presentationError,
  voiceTranscript,
  interimText,
  isRecording,
  recordingElapsed,
  voiceTranscribing,
  instructions,
  maxDurationSec,
  recordingLang,
  onStartPresentation,
  onStopPresentation,
  onRetryPresentation,
}: PresentationModeViewProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
        background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
        padding: 40,
      }}
    >
      {!presentationDone ? (
        <div style={{ textAlign: "center", maxWidth: 700, width: "100%" }}>
          {voiceCapabilities?.recommendedMode === "unavailable" && (
            <ErrorBanner color="#ffb4b4" border="rgba(233,75,60,0.4)" bg="rgba(233,75,60,0.15)">
              ⚠️ <strong>Capture audio indisponible sur ce navigateur.</strong> Utilisez
              une version récente de Chrome, Firefox, Safari ou Edge (HTTPS requis).
            </ErrorBanner>
          )}
          {voiceCapabilities?.recommendedMode === "backend" && (
            <ErrorBanner color="#ffd28a" border="rgba(245,166,35,0.35)" bg="rgba(245,166,35,0.12)" fontSize={12}>
              ℹ️ Votre navigateur ne propose pas la transcription temps réel (Firefox, etc.).
              Pas de souci : l&apos;audio sera enregistré puis transcrit côté serveur quand vous cliquerez sur stop.
            </ErrorBanner>
          )}
          {voiceFatalError && (
            <ErrorBanner color="#ffb4b4" border="rgba(233,75,60,0.4)" bg="rgba(233,75,60,0.15)">
              ⚠️ {voiceFatalError.message}
            </ErrorBanner>
          )}

          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "24px 32px",
              marginBottom: 32,
              textAlign: "left",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <h2 style={{ color: "#7b7fff", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
              🎤 Présentation orale
            </h2>
            <p style={{ color: "#e0e0e0", fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: "pre-line" }}>
              {instructions}
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => (isRecording ? onStopPresentation() : onStartPresentation(recordingLang))}
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: isRecording ? "#e94b3c" : "#5b5fc7",
                border: isRecording ? "4px solid rgba(233,75,60,0.3)" : "4px solid rgba(91,95,199,0.3)",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
                transition: "all .2s",
                boxShadow: isRecording ? "0 0 40px rgba(233,75,60,0.4)" : "0 0 30px rgba(91,95,199,0.3)",
              }}
            >
              {isRecording ? "⏹" : "🎙️"}
            </button>
          </div>

          <div style={{ color: isRecording ? "#ff8a80" : "#7b7fff", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {isRecording ? "Cliquez sur le micro pour terminer votre présentation" : "Cliquez sur le micro pour commencer"}
          </div>

          {isRecording && (
            <div style={{ color: "#fff", fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginBottom: 24 }}>
              {Math.floor(recordingElapsed / 60).toString().padStart(2, "0")}:
              {(recordingElapsed % 60).toString().padStart(2, "0")}
              <span style={{ fontSize: 14, color: "#888", marginLeft: 12 }}>
                / {Math.floor(maxDurationSec / 60)}:00
              </span>
            </div>
          )}

          {(voiceTranscript || interimText) && (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: 12,
                padding: "16px 20px",
                maxHeight: 200,
                overflowY: "auto",
                textAlign: "left",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "#7b7fff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Transcription en direct
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>
                {voiceTranscript}
                {interimText && <span style={{ color: "#888", fontStyle: "italic" }}>{interimText}</span>}
              </p>
            </div>
          )}
        </div>
      ) : presentationError ? (
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h3 style={{ color: "#ffb4b4", fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
            {presentationError.category === "empty_transcript"
              ? "Aucun audio détecté"
              : presentationError.category === "timeout"
                ? "Analyse expirée"
                : presentationError.category === "network"
                  ? "Problème de connexion"
                  : presentationError.category === "invalid_response"
                    ? "Réponse invalide du serveur"
                    : "Erreur serveur"}
          </h3>
          <p style={{ color: "#e0e0e0", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            {presentationError.message}
          </p>
          <button
            onClick={onRetryPresentation}
            style={{
              padding: "12px 28px",
              borderRadius: 10,
              background: "#5b5fc7",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            🔄 Réessayer la présentation
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: "4px solid rgba(255,255,255,0.2)",
              borderTopColor: "#7b7fff",
              borderRadius: "50%",
              animation: "spin .8s linear infinite",
              margin: "0 auto 20px",
            }}
          />
          <p style={{ color: "#e0e0e0", fontSize: 16, fontWeight: 600 }}>
            {voiceTranscribing
              ? "Transcription de votre présentation en cours..."
              : "Transition en cours..."}
          </p>
          {voiceTranscribing && (
            <p style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
              Envoi au service de transcription (jusqu&apos;à 60 s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorBanner({
  children,
  color,
  border,
  bg,
  fontSize = 13,
}: {
  children: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 16,
        color,
        fontSize,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// VOICE_QA MODE — children CMJ / jury panel + push-to-talk + timer
// ════════════════════════════════════════════════════════════════════

function VoiceQAPanel(props: PresentationModeViewProps) {
  const {
    childrenNames, raisedHands, qaWaiting, isSpeakingTTS, speakingActorId,
    currentPhaseAiActors, conversation, actors, isSending, displayPlayerName,
    getActorInfo, chatEndRef, pitchTimerActive, pitchCutoff, pitchSecondsLeft,
    voiceFatalError, voiceTranscript, interimText, voiceTranscribing, isRecording,
    onChildRaiseClick, onMicToggle,
  } = props;

  const isPitchPhase = currentPhaseAiActors.length === 0;
  const micDisabled = isPitchPhase && pitchCutoff;
  const yukiActor = actors.find((a: any) => a.actor_id === "yuki_tanaka");
  const timerColor = pitchSecondsLeft <= 5 ? "#e94b3c" : pitchSecondsLeft <= 15 ? "#f5a623" : "#4ade80";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "linear-gradient(180deg, #f8f9fc 0%, #eef0f5 100%)" }}>

      {/* Participants row */}
      {childrenNames && childrenNames.length > 0 ? (
        <div style={{ padding: "20px 24px 12px", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            🏫 Les enfants du CMJ
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {childrenNames.map((childName) => {
              const hasHand = raisedHands.includes(childName);
              const colorIdx = childName.charCodeAt(0) % CHILD_COLORS.length;
              return (
                <button
                  key={childName}
                  onClick={() => {
                    if (!hasHand || qaWaiting || isSpeakingTTS) return;
                    onChildRaiseClick(childName);
                  }}
                  disabled={!hasHand || qaWaiting || isSpeakingTTS}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    padding: "8px 12px", borderRadius: 12,
                    background: hasHand ? "#fff" : "#f0f0f0",
                    border: hasHand ? "2px solid #5b5fc7" : "2px solid transparent",
                    cursor: hasHand && !qaWaiting ? "pointer" : "default",
                    opacity: hasHand ? 1 : 0.5,
                    transition: "all .2s",
                    boxShadow: hasHand ? "0 2px 8px rgba(91,95,199,0.15)" : "none",
                    transform: hasHand ? "translateY(-2px)" : "none",
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: CHILD_COLORS[colorIdx],
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, position: "relative",
                  }}>
                    <span style={{ fontWeight: 700, color: "#fff", fontSize: 16 }}>{childName[0]}</span>
                    {hasHand && (
                      <span style={{ position: "absolute", top: -8, right: -8, fontSize: 20, animation: "handWave 1s ease-in-out infinite" }}>
                        🙋
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: hasHand ? "#333" : "#999" }}>{childName}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : currentPhaseAiActors.length > 0 ? (
        <div style={{ padding: "16px 24px 12px", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            🎙️ Le jury
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {currentPhaseAiActors.map((actorId) => {
              const info = getActorInfo(actorId);
              const lastNpc = [...conversation].reverse().find((m: any) => m.role === "npc" && currentPhaseAiActors.includes(m.actor));
              const isLastSpeaker = lastNpc?.actor === actorId;
              const isActivelySpeaking = speakingActorId === actorId && isSpeakingTTS;
              const isHighlighted = isActivelySpeaking || isLastSpeaker;
              return (
                <div
                  key={actorId}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    padding: "8px 14px", borderRadius: 12,
                    background: isHighlighted ? "#fff" : "#f5f5f5",
                    border: isHighlighted ? "2px solid " + info.color : "2px solid transparent",
                    transition: "all .2s",
                    boxShadow: isHighlighted ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  <Avatar initials={info.initials} color={info.color} size={40} status={info.status} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: isHighlighted ? "#333" : "#888" }}>
                    {info.name.split(" ")[0]}
                  </span>
                  {isActivelySpeaking ? (
                    <span style={{ fontSize: 9, color: info.color, fontWeight: 700 }}>🔊 En train de parler</span>
                  ) : isSending && isLastSpeaker ? (
                    <span style={{ fontSize: 9, color: "#999", fontWeight: 600 }}>Réflexion...</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Chat history */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 24px", overflow: "auto" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "16px 0" }}>
          {conversation.filter((m: any) => m.role !== "system").slice(-8).map((msg: any) => {
            const isPlayer = msg.role === "player";
            const actor = !isPlayer ? getActorInfo(msg.actor || "npc") : null;
            const isCurrentlySpeaking = speakingActorId === msg.actor && isSpeakingTTS;
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  flexDirection: isPlayer ? "row-reverse" : "row",
                  maxWidth: "85%", alignSelf: isPlayer ? "flex-end" : "flex-start",
                  opacity: isCurrentlySpeaking ? 1 : 0.8,
                }}
              >
                {!isPlayer && actor && (
                  <Avatar initials={actor.initials} color={actor.color} size={36} status={actor.status} />
                )}
                {isPlayer && (
                  <Avatar
                    initials={displayPlayerName ? getInitials(displayPlayerName) : "CEO"}
                    color="#5b5fc7"
                    size={36}
                  />
                )}
                <div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 3, textAlign: isPlayer ? "right" : "left" }}>
                    {isPlayer ? (displayPlayerName || "CEO") : actor?.name}
                    {isCurrentlySpeaking && <span style={{ marginLeft: 8, color: "#5b5fc7" }}>🔊 En train de parler...</span>}
                  </div>
                  <div style={{
                    background: isPlayer ? "#5b5fc7" : msg.actor === "yuki_tanaka" ? "#C62828" : "#fff",
                    color: isPlayer || msg.actor === "yuki_tanaka" ? "#fff" : "#333",
                    padding: "10px 16px", borderRadius: 16,
                    borderTopRightRadius: isPlayer ? 4 : 16,
                    borderTopLeftRadius: isPlayer ? 16 : 4,
                    fontSize: 14, lineHeight: 1.5,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    border: !isPlayer && msg.actor !== "yuki_tanaka" ? "1px solid #e8e8e8" : "none",
                  }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}
          {qaWaiting && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
              <div style={{ background: "#f0f0f0", borderRadius: 16, padding: "10px 16px" }}>
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Mic area */}
      <div style={{ padding: "12px 24px 20px", borderTop: "1px solid #e0e0e0", background: "#fff", flexShrink: 0 }}>

        {isPitchPhase && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>
                ⏱️ Elevator pitch
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: timerColor, transition: "color .3s" }}>
                {pitchTimerActive || pitchCutoff
                  ? `${String(Math.floor(pitchSecondsLeft / 60)).padStart(1, "0")}:${String(pitchSecondsLeft % 60).padStart(2, "0")}`
                  : "0:40"}
              </span>
            </div>
            <div style={{ width: "100%", height: 6, borderRadius: 3, background: "#f0f0f0", overflow: "hidden" }}>
              <div style={{
                width: `${((40 - pitchSecondsLeft) / 40) * 100}%`,
                height: "100%", borderRadius: 3,
                background: timerColor,
                transition: "width .25s linear, background .3s",
              }} />
            </div>
            {pitchCutoff && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#e94b3c", textAlign: "center" }}>
                ⏰ Temps écoulé — Passage aux questions du jury
              </div>
            )}
            {!pitchTimerActive && !pitchCutoff && !isRecording && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#888", textAlign: "center" }}>
                Appuyez sur 🎙️ pour démarrer votre pitch (40 secondes)
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>

          {yukiActor && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar
                initials={yukiActor.avatar?.initials || "YT"}
                color={yukiActor.avatar?.color || "#C62828"}
                size={40}
                status={speakingActorId === "yuki_tanaka" ? "busy" : "available"}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Yuki Tanaka</div>
                <div style={{ fontSize: 10, color: speakingActorId === "yuki_tanaka" ? "#C62828" : "#999" }}>
                  {speakingActorId === "yuki_tanaka" ? "🔊 Speaking..." : "Ready"}
                </div>
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: micDisabled ? "#f5f5f5" : isRecording ? "#fef2f2" : "#f0f0f0",
              padding: "8px 16px", borderRadius: 20,
              border: micDisabled ? "1px solid #e0e0e0" : isRecording ? "1px solid #fca5a5" : "1px solid #ddd",
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%",
                background: micDisabled ? "#ccc" : isRecording ? "#e94b3c" : "#999",
                animation: isRecording && !micDisabled ? "micBlink 1s ease-in-out infinite" : "none",
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: micDisabled ? "#bbb" : isRecording ? "#e94b3c" : "#999" }}>
                {micDisabled
                  ? "⏰ Pitch terminé"
                  : voiceTranscribing
                    ? "Transcription..."
                    : isRecording
                      ? (isSending ? "Analyse en cours..." : "🎤 Parlez puis appuyez sur 🔇 pour envoyer")
                      : isSpeakingTTS
                        ? "🔊 Écoutez le jury..."
                        : "Micro coupé — Appuyez sur 🎙️ pour parler"}
              </span>
            </div>
            {voiceFatalError && (
              <span style={{ fontSize: 11, color: "#c62828", fontWeight: 600 }} title={voiceFatalError.message}>
                ⚠️ {voiceFatalError.category === "permission_denied" ? "Micro refusé"
                   : voiceFatalError.category === "mic_missing" ? "Aucun micro"
                   : voiceFatalError.category === "mic_busy" ? "Micro occupé"
                   : "Indisponible"}
              </span>
            )}
            <button
              disabled={micDisabled || isSending}
              onClick={onMicToggle}
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: micDisabled ? "#ccc" : isRecording ? "#e94b3c" : "#5b5fc7",
                border: "none", color: "#fff",
                cursor: micDisabled || isSending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, transition: "all .2s",
                opacity: micDisabled ? 0.5 : 1,
              }}
            >
              {micDisabled ? "🚫" : isRecording ? "🔇" : "🎙️"}
            </button>
          </div>
        </div>

        {(voiceTranscript || interimText) && isRecording && !micDisabled && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8f8ff", borderRadius: 8, border: "1px solid #e8e8ff" }}>
            <span style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>
              {voiceTranscript}
              {interimText && <span style={{ color: "#aaa", fontStyle: "italic" }}>{interimText}</span>}
            </span>
            {voiceTranscript && !isSending && isRecording && (
              <span style={{ fontSize: 10, color: "#7b7fff", marginLeft: 8 }}>
                (appuyez sur 🔇 pour envoyer)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
