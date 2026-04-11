/** ═══════════════════════════════════════════════════════════════════
 *  /api/admin/convert — Convert a scenario PDF to JSON using Claude
 *
 *  POST: multipart/form-data with a "file" field (PDF).
 *  Extracts text from the PDF, sends it to Claude for conversion,
 *  and returns the generated scenario JSON.
 * ═══════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ── Extract text from PDF using pdftotext ────────────────────────
async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const tmpPdf = join(tmpdir(), `scenario_${Date.now()}.pdf`);
  const tmpTxt = join(tmpdir(), `scenario_${Date.now()}.txt`);

  await writeFile(tmpPdf, pdfBuffer);

  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", tmpPdf, tmpTxt], {
      timeout: 15000,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("close", async (code) => {
      try {
        if (code !== 0) {
          // Fallback: try python
          const pyResult = await extractWithPython(tmpPdf);
          resolve(pyResult);
          return;
        }
        const text = await readFile(tmpTxt, "utf-8");
        await unlink(tmpPdf).catch(() => {});
        await unlink(tmpTxt).catch(() => {});
        resolve(text);
      } catch (err: any) {
        reject(new Error(`PDF text extraction failed: ${err.message}`));
      }
    });

    child.on("error", async () => {
      // pdftotext not available, try python
      try {
        const pyResult = await extractWithPython(tmpPdf);
        resolve(pyResult);
      } catch (err: any) {
        reject(new Error(`PDF extraction failed: ${err.message}`));
      }
    });
  });
}

async function extractWithPython(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = `
import sys
try:
    import pdfplumber
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pdfplumber', '--break-system-packages', '-q'])
    import pdfplumber

with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            print(text)
        print("---PAGE---")
`;
    const child = spawn("python3", ["-c", script, pdfPath], { timeout: 30000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", async (code) => {
      await unlink(pdfPath).catch(() => {});
      if (code !== 0) {
        reject(new Error(`Python PDF extraction failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    child.on("error", (err) => reject(err));
  });
}

// ── Call Claude to convert text to JSON ──────────────────────────
async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  return textBlock?.text || "";
}

function extractJson(raw: string): any {
  // Find the first { and last }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  const jsonStr = raw.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

// ── Reference scenario structure for the prompt ──────────────────
function getScenarioStructureReference(): string {
  return `
STRUCTURE JSON ATTENDUE (respecte EXACTEMENT ce format) :

{
  "scenario_id": "string (snake_case unique)",
  "version": "1.0.0",
  "locale": "fr-FR",

  "meta": {
    "title": "string",
    "subtitle": "string",
    "description": "string",
    "job_family": "string (snake_case)",
    "difficulty": "junior|intermediate|senior",
    "estimated_duration_min": number,
    "tags": ["string"],
    "show_objective": false,
    "show_background_fact": false,
    "pedagogical_goals": ["string"]
  },

  "introduction": {
    "header": { "tag": "Simulation metier", "title": "string", "subtitle": "string" },
    "cards": [
      { "title": "string", "content": "<p>HTML content</p>", "column": "left|right" }
    ]
  },

  "narrative": {
    "context": "string",
    "mission": "string",
    "initial_situation": "string",
    "trigger": "string",
    "background_fact": "string (optional)"
  },

  "timeline": {
    "scenario_start": "ISO 8601 datetime",
    "sim_speed_multiplier": number
    // + any custom deadline keys
  },

  "actors": [
    {
      "actor_id": "string (snake_case)",
      "name": "string",
      "role": "string",
      "personality": "string (for AI actors)",
      "interaction_modes": ["chat", "mail", "phone", "whatsapp", "in_person", "unreachable"],
      "controlled_by": "player|ai|system",
      "prompt_file": "string.md (optional, for AI actors)",
      "availability": "string (optional)",
      "email": "string (optional, for mail actors)",
      "avatar": { "color": "#hex", "initials": "1-2 chars" },
      "visible_in_contacts": true,
      "contact_status": "available|busy|away|offline",
      "contact_preview": "string (optional)"
    }
  ],

  "channels": [
    { "channel_id": "chat|mail", "type": "chat|mail", "label": "string", "enabled": true }
  ],

  "resources": {
    "documents": [
      {
        "doc_id": "string (snake_case)",
        "label": "string",
        "contains": ["keyword"],
        "usable_as_pj": true|false,
        "content": "string (optional, displayed content)"
      }
    ]
  },

  "constraints": {
    "time_pressure": true|false,
    "hierarchy_limit": "string",
    "diplomatic_tone_required": true|false,
    // any other custom constraints
  },

  "initial_events": [
    {
      "event_id": "string",
      "type": "phone_call|whatsapp_message|chat|mail",
      "actor": "actor_id",
      "content": "string (exact message text)",
      "language": "string (optional, e.g. 'es')"
    }
  ],

  "phases": [
    {
      "phase_id": "string (snake_case)",
      "title": "string",
      "duration_target_min": number,
      "objective": "string",
      "active_channels": ["chat", "mail"],
      "ai_actors": ["actor_id"],
      "player_input": { "type": "free_text|rich_text", "prompt": "string" },

      "competencies": [
        "Description de la competence evaluee (phrase complete)"
      ],

      "auto_advance": true|false,
      "next_phase": "phase_id|null (null for last phase)",
      "time_jump_minutes": number (optional),

      "entry_events": [
        {
          "event_id": "string",
          "type": "chat|mail",
          "channel": "chat|mail",
          "actor": "actor_id",
          "delay_ms": number,
          "subject": "string (for mail)",
          "content": "string"
        }
      ],

      "interruptions": [
        {
          "interrupt_id": "string",
          "actor": "actor_id",
          "content": "string",
          "channel": "chat|mail",
          "trigger": {
            "type": "after_delay|after_exchanges|on_phase_entry",
            "delay_ms": number (for after_delay),
            "min_player_messages": number (for after_exchanges)
          }
        }
      ],

      "mail_config": {
        "enabled": true,
        "kind": "string (unique identifier)",
        "defaults": { "to": "email", "cc": "email", "subject": "string" },
        "require_attachments": true|false,
        "on_send_flags": { "flag_name": true },
        "send_label": "string (button text)",
        "send_advances_phase": true|false
      }
    }
  ],

  "endings": [
    {
      "ending_id": "success|partial_success|failure",
      "label": "string",
      "content": "string (narrative text)"
    }
  ]
}`;
}

// ── Main handler ─────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const pdfText = await extractPdfText(pdfBuffer);

    if (!pdfText || pdfText.trim().length < 50) {
      return Response.json(
        { error: "Le PDF semble vide ou illisible. Verifiez son contenu." },
        { status: 400 }
      );
    }

    // Build prompt for Claude
    const prompt = `Tu es un expert en conception de serious games. On te fournit le contenu d'un document PDF decrivant un scenario de jeu serieux.

Ta mission : convertir ce document en un fichier JSON valide et jouable, en respectant EXACTEMENT la structure ci-dessous.

REGLES STRICTES :
1. Le JSON doit etre COMPLET et VALIDE (pas de commentaires, pas de trailing commas)
2. Tous les actor_id doivent etre en snake_case
3. Tous les phase_id doivent etre en snake_case
4. Les competencies sont des tableaux de strings (pas d'objets)
5. Les interaction_modes doivent correspondre aux canaux (chat, mail, phone, whatsapp, in_person, unreachable)
6. Le joueur doit toujours avoir un acteur avec actor_id "player" et controlled_by "player"
7. Si le document mentionne des emails, creer les acteurs avec interaction_modes incluant "mail" ET un champ "email"
8. Les evenements initiaux doivent avoir le texte EXACT des messages
9. Chaque phase DOIT avoir un tableau "competencies" avec 4-7 competences
10. Les endings doivent avoir des ending_id parmi : success, partial_success, failure
11. Genere des on_send_flags significatifs pour le mail_config (ex: email_sent, response_sent)
12. Si le document ne precise pas certains details, invente des valeurs coherentes

${getScenarioStructureReference()}

CONTENU DU DOCUMENT PDF :
---
${pdfText}
---

Reponds UNIQUEMENT avec le JSON valide, sans aucun texte avant ou apres. Pas de backticks markdown.`;

    const raw = await callClaude(prompt, apiKey);
    const json = extractJson(raw);

    return Response.json({
      success: true,
      scenario: json,
    });
  } catch (error: any) {
    console.error("Conversion error:", error);
    return Response.json(
      { error: error?.message || "Erreur lors de la conversion" },
      { status: 500 }
    );
  }
}
