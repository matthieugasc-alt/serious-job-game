import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * GET /api/version — identité vérifiable du build servi.
 *
 * Répond : { commit, build_id, started_at }. Utilisé par deploy.sh
 * comme gate final : si le commit servi ≠ HEAD du serveur, le deploy
 * ÉCHOUE explicitement. Plus jamais de « est-ce que la prod sert bien
 * mes modifs ? » — on interroge, on ne devine pas.
 */

const startedAt = new Date().toISOString();

function readGitHead(root: string): string {
  try {
    const head = readFileSync(join(root, ".git", "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return head; // HEAD détaché : sha direct
    const ref = head.slice(4).trim();
    return readFileSync(join(root, ".git", ref), "utf8").trim();
  } catch {
    return "unknown";
  }
}

function readBuildId(root: string): string {
  try {
    return readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

export async function GET() {
  const root = process.cwd();
  return NextResponse.json({
    commit: readGitHead(root),
    build_id: readBuildId(root),
    started_at: startedAt,
  });
}
