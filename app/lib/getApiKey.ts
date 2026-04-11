/**
 * Robustly retrieve an env variable, with a fallback that reads
 * .env.local directly from disk when process.env doesn't have it
 * (can happen when Next.js 16 hot-reloads and new routes miss env injection).
 */

import { readFileSync } from "fs";
import { join } from "path";

const envCache: Record<string, string> = {};

function loadEnvLocal(): Record<string, string> {
  if (Object.keys(envCache).length > 0) return envCache;

  try {
    const envPath = join(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      envCache[key] = value;
    }
  } catch {
    // .env.local doesn't exist or can't be read — that's fine
  }

  return envCache;
}

export function getEnvVar(name: string): string | undefined {
  // First try the standard way
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;

  // Fallback: read from .env.local directly
  const locals = loadEnvLocal();
  return locals[name];
}
