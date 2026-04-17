import { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireAuth } from "@/app/lib/auth";
import { checkRateLimit, getRateLimitId, RATE_LIMITS } from "@/app/lib/rateLimit";
import { parseBody, ttsSchema } from "@/app/lib/validation";

/**
 * POST /api/tts
 * Converts text to speech using OpenAI TTS API.
 * Returns audio/mpeg binary stream.
 *
 * Body: { text: string; voice?: string; speed?: number }
 *   - voice: one of "alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer"
 *   - speed: 0.25 – 4.0 (default 1.0)
 */

const VALID_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "nova", "onyx", "sage", "shimmer",
]);

export async function POST(req: NextRequest) {
  try {
    // ── Auth guard ──
    const auth = requireAuth(req);
    if (auth.error) return auth.error;

    // ── Rate limit ──
    const rlId = getRateLimitId(req, auth.user.id);
    const rl = checkRateLimit(rlId, "tts", RATE_LIMITS.tts);
    if (rl.blocked) return Response.json(rl.body, { status: 429 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY manquante" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // ── Input validation ──
    const parsed = parseBody(body, ttsSchema);
    if (parsed.error) {
      return new Response(JSON.stringify(parsed.error), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { text: truncated, voice, speed } = parsed.data;

    const client = new OpenAI({ apiKey });

    const mp3 = await client.audio.speech.create({
      model: "tts-1",
      voice,
      input: truncated,
      speed,
      response_format: "mp3",
    });

    // Stream the response as audio
    const arrayBuffer = await mp3.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    console.error("TTS error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "TTS generation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
