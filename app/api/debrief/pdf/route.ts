/** ═══════════════════════════════════════════════════════════════════
 *  /api/debrief/pdf — Generate a PDF from debrief data
 *
 *  POST body: full debrief data (same shape as DebriefResponse +
 *  scenario_title, player_name, game_date).
 *
 *  Returns the PDF as application/pdf binary.
 *  Uses a Python script (reportlab) under the hood.
 * ═══════════════════════════════════════════════════════════════════ */

// Force Node.js runtime (child_process is unavailable in Edge)
export const runtime = "nodejs";

import { spawn } from "child_process";
import { readFile, unlink, access } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Create a temp file path for the PDF
    const tempPath = join(tmpdir(), `debrief_${Date.now()}.pdf`);

    // Resolve the script path — try multiple locations
    const cwd = process.cwd();
    const candidates = [
      join(cwd, "scripts", "generate_debrief_pdf.py"),
      resolve(cwd, "..", "scripts", "generate_debrief_pdf.py"),
      resolve(__dirname, "..", "..", "..", "..", "scripts", "generate_debrief_pdf.py"),
    ];

    let scriptPath = candidates[0];
    for (const p of candidates) {
      try {
        await access(p);
        scriptPath = p;
        break;
      } catch {
        // try next
      }
    }

    console.log("[PDF] cwd:", cwd, "scriptPath:", scriptPath, "tempPath:", tempPath);

    // Run the Python script
    const pdf = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn("python3", [scriptPath, tempPath], {
        timeout: 30000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      let stderr = "";

      // Write JSON data to stdin
      child.stdin.write(JSON.stringify(body));
      child.stdin.end();

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", async (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Python script exited with code ${code}: ${stderr || "(no stderr)"}`
            )
          );
          return;
        }
        try {
          const buffer = await readFile(tempPath);
          await unlink(tempPath).catch(() => {});
          resolve(buffer);
        } catch (readErr: any) {
          reject(new Error(`Failed to read PDF: ${readErr.message}`));
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to spawn python3: ${err.message}`));
      });
    });

    // Build a filename from scenario title
    const scenarioSlug = (body.scenario_title || "debrief")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);
    const fileName = `debrief-${scenarioSlug}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    const msg = error?.message || "Erreur inconnue";
    console.error("Erreur PDF generation:", msg);
    return Response.json(
      { error: `PDF generation error: ${msg}` },
      { status: 500 }
    );
  }
}
