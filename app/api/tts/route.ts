import { NextRequest } from "next/server";
import OpenAI from "openai";

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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY manquante" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const text: string = (body.text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "text requis" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Cap text at 4096 chars (OpenAI TTS limit)
    const truncated = text.length > 4096 ? text.slice(0, 4096) : text;

    const voice = VALID_VOICES.has(body.voice) ? body.voice : "nova";
    const speed = typeof body.speed === "number"
      ? Math.max(0.25, Math.min(4.0, body.speed))
      : 1.0;

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
