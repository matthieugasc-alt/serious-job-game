#!/usr/bin/env node
/**
 * inject-schema-pointer.mjs
 *
 * Idempotent: ajoute (ou met à jour) le champ "$schema" en tête de
 * chaque scenario.json pour activer l'autocomplete IDE (VSCode, Cursor).
 *
 * Usage:
 *   node scripts/inject-schema-pointer.mjs
 *
 * Pointe vers le fichier local par path relatif (plus fiable en dev
 * que l'URL prod tant que schema/scenario.schema.json évolue vite).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(projectRoot, "scenarios");
const SCHEMA_REL = "../../schema/scenario.schema.json";

let touched = 0;
let skipped = 0;

for (const dir of fs.readdirSync(scenariosDir)) {
  const p = path.join(scenariosDir, dir, "scenario.json");
  if (!fs.existsSync(p)) continue;
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    continue;
  }
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    console.warn(`[skip] ${dir}: JSON parse failed`);
    continue;
  }
  if (s.$schema === SCHEMA_REL) {
    skipped++;
    continue;
  }
  // Re-ordre: mettre $schema en tête pour la découverte IDE.
  const reordered = { $schema: SCHEMA_REL, ...s };
  fs.writeFileSync(p, JSON.stringify(reordered, null, 2) + "\n", "utf8");
  touched++;
  console.log(`  ✓ ${dir}`);
}

console.log(`\nDone: ${touched} updated, ${skipped} already OK.`);
