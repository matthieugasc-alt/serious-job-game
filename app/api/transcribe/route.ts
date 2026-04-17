import OpenAI from "openai";
import { requireAuth } from "@/app/lib/auth";
import { checkRateLimit, getRateLimitId, RATE_LIMITS } from "@/app/lib/rateLimit";

/**
 * Backend fallback transcription via OpenAI Whisper.
 * Used whenever the browser's native SpeechRecognition is unavailable
 * (Firefox, some mobile browsers) OR failed to produce a transcript.
 *
 * Accepts multipart/form-data:
 *   - audio  (File/Blob)  — the recording (webm/ogg/mp4/mp3, <25 MB)
 *   - lang   (string)     — BCP-47 tag like "fr-FR" (used as language hint)
 *
 * Returns JSON: { transcript: string }
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // ── Auth guard ──
    const auth = requireAuth(req);
    if (auth.error) return auth.error;

    // ── Rate limit ──
    const rlId = getRateLimitId(req, auth.user.id);
    const rl = checkRateLimit(rlId, "transcribe", RATE_LIMITS.transcribe);
    if (rl.blocked) return Response.json(rl.body, { status: 429 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY manquante côté serveur" },
        { status: 500 }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json(
        { error: "Corps de requête invalide (FormData attendu)" },
        { status: 400 }
      );
    }

    const audio = form.get("audio");
    const langRaw = form.get("lang");
    const lang = typeof langRaw === "string" ? langRaw : "";

    if (!audio || !(audio instanceof Blob)) {
      return Response.json({ error: "Champ 'audio' manquant" }, { status: 400 });
    }

    // Guard: reject empty or suspiciously short recordings upfront
    if (audio.size < 500) {
      return Response.json(
        { error: "Audio trop court (< 500 octets) — aucun son exploitable" },
        { status: 400 }
      );
    }

    // Whisper API limit is 25 MB
    if (audio.size > 25 * 1024 * 1024) {
      return Response.json(
        { error: "Audio trop volumineux (> 25 MB)" },
        { status: 413 }
      );
    }

    const client = new OpenAI({ apiKey });

    // Whisper expects an ISO 639-1 code (e.g. "fr", "en"). Extract from BCP-47.
    const whisperLang = lang ? lang.split("-")[0].toLowerCase() : undefined;

    // OpenAI SDK accepts a File-like object. Ensure we have one with a filename.
    // `audio` may already be a File when coming from FormData in Node 18+.
    const audioBlob: Blob = audio;
    const mimeType = audioBlob.type || "";
    const ext = mimeType.includes("webm")
      ? "webm"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("mpeg")
            ? "mp3"
            : "webm";
    const fileToSend: File =
      typeof File !== "undefined" && audioBlob instanceof File
        ? audioBlob
        : new File([audioBlob], `recording.${ext}`, {
            type: mimeType || "audio/webm",
          });

    const transcription: any = await client.audio.transcriptions.create({
      file: fileToSend,
      model: "whisper-1",
      language: whisperLang,
      response_format: "json",
    } as any);

    const text =
      typeof transcription?.text === "string" ? transcription.text.trim() : "";

    return Response.json({ transcript: text }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.error("[/api/transcribe] error:", err);
    const status =
      err?.status && typeof err.status === "number" ? err.status : 500;
    return Response.json(
      { error: err?.message || "Erreur serveur de transcription" },
      { status }
    );
  }
}
