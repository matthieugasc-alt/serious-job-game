// ═══════════════════════════════════════════════════════════════════
// VOICE CAPTURE — unified cross-browser capture with fallback chain
// ═══════════════════════════════════════════════════════════════════
//
// STRATEGY (3 levels, always tried in order):
//
//   Level 1  Native SpeechRecognition (Web Speech API)
//            → Chrome, Edge, Safari 14.1+, Opera.
//            → Gives real-time interim + final transcripts.
//            → NOT supported in Firefox, some mobile browsers.
//
//   Level 2  MediaRecorder + backend transcription (OpenAI Whisper)
//            → Works on any browser supporting getUserMedia + MediaRecorder
//              (Chrome, Firefox, Safari 14.1+, Edge).
//            → No real-time transcript during recording, but guaranteed
//              final transcript after stop.
//            → Used as a SAFETY NET even when native SR is active, so that
//              if native returns empty we still have a fallback.
//
//   Level 3  Explicit error with actionable message
//            → Neither native SR nor MediaRecorder available, OR permission
//              refused, OR mic missing, OR transcription failed.
//            → Caller decides how to present (no silent failure).
//
// The module always requests getUserMedia first so permission / device
// errors surface immediately (NotAllowedError, NotFoundError, …), before
// any transcription attempt. Both MediaRecorder and SpeechRecognition run
// in parallel when possible — MediaRecorder is the safety net.
// ═══════════════════════════════════════════════════════════════════

export type VoiceCaptureSource = "native" | "backend" | "empty" | "error";

export type VoiceCaptureErrorCategory =
  | "permission_denied"
  | "mic_missing"
  | "mic_busy"
  | "api_unsupported"
  | "recording_failed"
  | "transcribe_failed"
  | "transcribe_network"
  | "transcribe_timeout"
  | "transcribe_invalid_response";

export interface VoiceCaptureResult {
  /** Final transcript to use (from native OR backend, whichever worked). Empty if none. */
  transcript: string;
  /** Which path produced the transcript (or why there's none). */
  source: VoiceCaptureSource;
  /** Set when source = "error". */
  errorCategory?: VoiceCaptureErrorCategory;
  /** Human-readable French error message when source = "error". */
  errorMessage?: string;
  /** Raw audio blob (available whenever MediaRecorder worked, regardless of source). */
  audioBlob?: Blob;
  /** What native SR produced (for diagnostics). */
  nativeTranscript?: string;
  /** What backend produced (for diagnostics). */
  backendTranscript?: string;
}

export interface VoiceCaptureCapabilities {
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  hasSpeechRecognition: boolean;
  preferredMimeType: string | null;
  /**
   * Best mode the browser supports:
   *   "native"       → native SR + MediaRecorder safety net
   *   "backend"      → MediaRecorder + backend Whisper transcription
   *   "unavailable"  → no usable path (no getUserMedia)
   */
  recommendedMode: "native" | "backend" | "unavailable";
}

export function detectVoiceCapabilities(): VoiceCaptureCapabilities {
  const hasGetUserMedia =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  const hasMediaRecorder =
    typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined";

  const SR =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const hasSpeechRecognition = !!SR;

  const candidateMimes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
  ];
  let preferredMimeType: string | null = null;
  if (hasMediaRecorder && typeof (window as any).MediaRecorder.isTypeSupported === "function") {
    for (const t of candidateMimes) {
      try {
        if ((window as any).MediaRecorder.isTypeSupported(t)) {
          preferredMimeType = t;
          break;
        }
      } catch {
        // isTypeSupported can throw on some engines — ignore and continue
      }
    }
  }

  let recommendedMode: "native" | "backend" | "unavailable" = "unavailable";
  if (!hasGetUserMedia) recommendedMode = "unavailable";
  else if (hasSpeechRecognition) recommendedMode = "native";
  else if (hasMediaRecorder) recommendedMode = "backend";

  return {
    hasGetUserMedia,
    hasMediaRecorder,
    hasSpeechRecognition,
    preferredMimeType,
    recommendedMode,
  };
}

export interface StartCaptureOptions {
  /** BCP-47 language tag (e.g. "fr-FR", "en-US"). */
  lang: string;
  /** If false, skip native SpeechRecognition and go straight to MediaRecorder + backend. Default: true. */
  preferNative?: boolean;
  /** Called on interim (non-final) partial results from native SR. */
  onInterim?: (text: string) => void;
  /** Called when native SR emits a new final chunk. Receives full accumulated native transcript. */
  onFinal?: (fullAccumulated: string) => void;
  /** Called after `silenceTimeoutMs` of no new native results (voice_qa auto-send). */
  onSilence?: (accumulated: string) => void;
  silenceTimeoutMs?: number;
  /** Emitted only for fatal pre-start errors (mic access). Not for recoverable SR hiccups. */
  onError?: (category: VoiceCaptureErrorCategory, message: string) => void;
}

export interface VoiceCaptureSession {
  /** Stop capture and resolve with the best transcript we got (native or backend). */
  stop(): Promise<VoiceCaptureResult>;
  /** Cancel without transcribing. Releases mic. */
  cancel(): Promise<void>;
  /** What the browser supports. */
  capabilities: VoiceCaptureCapabilities;
  /** What mode the session is actually running in. */
  mode: "native" | "backend";
  /**
   * True if native SR ended up working at least once. Used by auto-send mode
   * to decide whether to trust onSilence (native-only) vs use chunked backend.
   */
  nativeWorking: () => boolean;
}

/**
 * Map a DOMException / MediaStream error onto a stable category + French message.
 */
function classifyMediaError(err: any): { category: VoiceCaptureErrorCategory; message: string } {
  const name = err?.name || "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        category: "permission_denied",
        message:
          "Permission micro refusée. Autorisez l'accès dans les paramètres du site, puis réessayez.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        category: "mic_missing",
        message: "Aucun micro détecté. Branchez un micro puis réessayez.",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        category: "mic_busy",
        message:
          "Le micro est occupé par une autre application. Fermez-la (visio, autre onglet) puis réessayez.",
      };
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return {
        category: "mic_missing",
        message: "Aucun micro ne correspond aux contraintes demandées.",
      };
    default:
      return {
        category: "api_unsupported",
        message: err?.message || "Impossible d'accéder au micro (erreur inconnue).",
      };
  }
}

export async function startVoiceCapture(
  opts: StartCaptureOptions
): Promise<VoiceCaptureSession> {
  const capabilities = detectVoiceCapabilities();

  if (!capabilities.hasGetUserMedia) {
    const msg =
      "Votre navigateur ne supporte pas la capture audio (getUserMedia). " +
      "Utilisez une version récente de Chrome, Firefox, Safari ou Edge en HTTPS.";
    opts.onError?.("api_unsupported", msg);
    const err: any = new Error(msg);
    err.category = "api_unsupported";
    throw err;
  }

  // ── 1. Request mic access ──
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (rawErr) {
    const { category, message } = classifyMediaError(rawErr);
    opts.onError?.(category, message);
    const err: any = new Error(message);
    err.category = category;
    throw err;
  }

  // ── 2. Always start MediaRecorder as safety net when supported ──
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  if (capabilities.hasMediaRecorder) {
    try {
      const RecorderCtor = (window as any).MediaRecorder;
      recorder = capabilities.preferredMimeType
        ? new RecorderCtor(stream, { mimeType: capabilities.preferredMimeType })
        : new RecorderCtor(stream);
      recorder!.ondataavailable = (e: any) => {
        if (e?.data && e.data.size > 0) chunks.push(e.data);
      };
      // Emit chunks every 1s so a mid-capture stop still has data
      recorder!.start(1000);
    } catch (err) {
      console.warn("[voiceCapture] MediaRecorder start failed — backend fallback disabled:", err);
      recorder = null;
    }
  }

  // ── 3. Start SpeechRecognition in parallel if available and requested ──
  const useNative = (opts.preferNative ?? true) && capabilities.hasSpeechRecognition;
  let recognition: any = null;
  let accumulatedNative = "";
  let nativeEverProducedResult = false;
  let silenceTimer: any = null;

  function startNativeRecognition() {
    if (!useNative) return;
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognition = new SR();
      recognition.lang = opts.lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interim = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalChunk += event.results[i][0].transcript + " ";
          else interim += event.results[i][0].transcript;
        }
        if (finalChunk) {
          nativeEverProducedResult = true;
          accumulatedNative += finalChunk;
          opts.onFinal?.(accumulatedNative);
        }
        if (interim) opts.onInterim?.(interim);

        if (opts.silenceTimeoutMs && opts.onSilence) {
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            opts.onSilence?.(accumulatedNative);
          }, opts.silenceTimeoutMs);
        }
      };

      recognition.onerror = (event: any) => {
        const errName = event?.error;
        // "no-speech", "aborted", "network" are recoverable — log and let auto-restart happen
        console.warn("[voiceCapture] SpeechRecognition error:", errName);
        // Don't surface — MediaRecorder is still running and will provide fallback
      };

      recognition.onend = () => {
        // Auto-restart while we're still the active session (Chrome stops after ~60s of silence)
        if (recognition && stream.active) {
          try {
            recognition.start();
          } catch {
            // Ignore — will fall back to MediaRecorder on stop
          }
        }
      };

      recognition.start();
    } catch (err) {
      console.warn("[voiceCapture] SR init failed — backend fallback only:", err);
      recognition = null;
    }
  }

  startNativeRecognition();

  const mode: "native" | "backend" = recognition ? "native" : "backend";

  // ── Public session object ──

  let stopped = false;

  async function stop(): Promise<VoiceCaptureResult> {
    if (stopped) {
      return { transcript: "", source: "empty" };
    }
    stopped = true;
    if (silenceTimer) clearTimeout(silenceTimer);

    // Stop SR first
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.stop();
      } catch {}
      recognition = null;
    }

    // Stop MediaRecorder and wait for final data
    let audioBlob: Blob | undefined;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const r = recorder!;
        const done = () => resolve();
        r.onstop = done;
        try {
          r.stop();
        } catch {
          resolve();
        }
        // Safety timeout — 3s max to produce final chunk
        setTimeout(resolve, 3000);
      });
      if (chunks.length > 0) {
        audioBlob = new Blob(chunks, {
          type: capabilities.preferredMimeType || "audio/webm",
        });
      }
    }

    // Always release mic
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}

    const nativeTranscript = accumulatedNative.trim();

    // ── Primary: native transcript if we got something substantive ──
    if (nativeTranscript.length >= 3) {
      return {
        transcript: nativeTranscript,
        source: "native",
        audioBlob,
        nativeTranscript,
      };
    }

    // ── Fallback: backend transcription if we have audio ──
    if (audioBlob && audioBlob.size > 2000) {
      try {
        const backendTranscript = await transcribeOnBackend(audioBlob, opts.lang);
        const trimmed = backendTranscript.trim();
        if (trimmed.length >= 1) {
          return {
            transcript: trimmed,
            source: "backend",
            audioBlob,
            nativeTranscript,
            backendTranscript: trimmed,
          };
        }
        // Backend OK but returned nothing usable
        return {
          transcript: "",
          source: "empty",
          audioBlob,
          nativeTranscript,
        };
      } catch (err: any) {
        const category: VoiceCaptureErrorCategory = err?.category || "transcribe_failed";
        const message =
          err?.userMessage ||
          (category === "transcribe_timeout"
            ? "Transcription serveur expirée (60 s). Réessayez."
            : category === "transcribe_network"
              ? "Transcription indisponible (réseau). Vérifiez votre connexion."
              : category === "transcribe_invalid_response"
                ? "Réponse de transcription invalide. Réessayez."
                : "Erreur du service de transcription. Réessayez.");
        return {
          transcript: "",
          source: "error",
          audioBlob,
          errorCategory: category,
          errorMessage: message,
          nativeTranscript,
        };
      }
    }

    // Nothing usable at all — true silence / audio too short
    return { transcript: "", source: "empty", audioBlob };
  }

  async function cancel() {
    if (stopped) return;
    stopped = true;
    if (silenceTimer) clearTimeout(silenceTimer);
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.stop();
      } catch {}
      recognition = null;
    }
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
    }
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
  }

  return {
    stop,
    cancel,
    capabilities,
    mode,
    nativeWorking: () => nativeEverProducedResult,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Backend transcription helper (Whisper via /api/transcribe)
// ═══════════════════════════════════════════════════════════════════

async function transcribeOnBackend(audioBlob: Blob, lang: string): Promise<string> {
  const ext = audioBlob.type.includes("webm")
    ? "webm"
    : audioBlob.type.includes("ogg")
      ? "ogg"
      : audioBlob.type.includes("mp4")
        ? "m4a"
        : audioBlob.type.includes("mpeg")
          ? "mp3"
          : "webm";
  const form = new FormData();
  form.append("audio", audioBlob, `recording.${ext}`);
  form.append("lang", lang);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    const headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: form,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const e: any = new Error(`transcribe_failed:${res.status}:${txt.slice(0, 200)}`);
      e.category = "transcribe_failed";
      e.userMessage = `Le service de transcription a répondu ${res.status}. Réessayez.`;
      throw e;
    }
    let data: any;
    try {
      data = await res.json();
    } catch {
      const e: any = new Error("transcribe_invalid_response");
      e.category = "transcribe_invalid_response";
      throw e;
    }
    if (!data || typeof data.transcript !== "string") {
      const e: any = new Error("transcribe_invalid_response");
      e.category = "transcribe_invalid_response";
      throw e;
    }
    return data.transcript;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      const e: any = new Error("transcribe_timeout");
      e.category = "transcribe_timeout";
      throw e;
    }
    if (err?.category) throw err;
    const e: any = new Error(err?.message || "transcribe_network");
    e.category = "transcribe_network";
    throw e;
  }
}
