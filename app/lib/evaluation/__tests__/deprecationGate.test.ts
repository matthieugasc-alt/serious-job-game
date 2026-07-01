/**
 * ⚠ GARDE-FOU AUTOMATIQUE — E8 deprecation gate.
 *
 * Vérifie 3 propriétés critiques pour éviter que le E-chantier régresse
 * silencieusement en revenant sur le `phase_passed` legacy :
 *
 *   1. Tout scenario migré (declare `phase.evaluation.observed_criteria`)
 *      DOIT aussi déclarer `completion_rules.required_criteria` OU
 *      `min_criteria_count` — sinon applyPhaseObservation refuse et la
 *      phase ne peut jamais passer (silent bug).
 *
 *   2. Tout scenario migré DOIT wire `any_flags:
 *      ["phase_evaluation_passed_<phase_id>"]` — sans ça le flag posé
 *      par useSendChatMessage n'aurait aucun consommateur.
 *
 *   3. L'endpoint /api/chat DOIT continuer à exposer le champ
 *      `phase_observation` dans sa signature de réponse (surveillé via
 *      une regex sur le source pour éviter les régressions de rename).
 *
 * Ce test tourne au build. Il empêche toute PR qui :
 *   - migrerait un scenario à moitié (contract déclaré mais pas wire)
 *   - retirerait `phase_observation` de la réponse /api/chat par erreur
 *   - re-introduirait un `phase_passed` dans le contrat de sortie
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../../..");
const SCENARIOS_DIR = resolve(REPO_ROOT, "scenarios");
const CHAT_ROUTE = resolve(REPO_ROOT, "app/api/chat/route.ts");
const SEND_CHAT_HOOK = resolve(
  REPO_ROOT,
  "app/scenarios/[scenarioId]/play/hooks/useSendChatMessage.ts",
);

interface Scenario {
  id: string;
  path: string;
  json: { phases?: Array<Record<string, unknown>> };
}

function loadScenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const entry of readdirSync(SCENARIOS_DIR)) {
    if (entry.startsWith("[") || entry.startsWith(".") || entry === "maintenance") continue;
    const full = join(SCENARIOS_DIR, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch { continue; }
    try {
      const raw = readFileSync(join(full, "scenario.json"), "utf-8");
      const json = JSON.parse(raw);
      if (Array.isArray(json?.phases)) out.push({ id: entry, path: full, json });
    } catch { /* skip */ }
  }
  return out;
}

describe("E8 deprecation gate — scenarios migrés cohérents", () => {
  const scenarios = loadScenarios();
  const migrated = scenarios.flatMap((s) =>
    (s.json.phases ?? [])
      .filter((p: any) => Array.isArray(p?.evaluation?.observed_criteria)
        && p.evaluation.observed_criteria.length > 0)
      .map((p: any) => ({ scenarioId: s.id, phase: p })),
  );

  it(`au moins 1 phase migrée existe (${migrated.length} trouvée(s))`, () => {
    // Sanity : la migration E7 a bien produit des résultats.
    expect(migrated.length).toBeGreaterThan(0);
  });

  it("chaque phase migrée déclare required_criteria OU min_criteria_count", () => {
    const orphans: string[] = [];
    for (const { scenarioId, phase } of migrated) {
      const rules = phase.completion_rules ?? {};
      const hasRequired = Array.isArray(rules.required_criteria) && rules.required_criteria.length > 0;
      const hasMinCount = typeof rules.min_criteria_count === "number" && rules.min_criteria_count > 0;
      if (!hasRequired && !hasMinCount) {
        orphans.push(`${scenarioId}::${phase.phase_id}`);
      }
    }
    if (orphans.length > 0) {
      throw new Error(
        `⚠ Phases avec evaluation.observed_criteria mais sans règle E-chantier :\n` +
        orphans.map((o) => `  - ${o}`).join("\n") +
        `\n\nSans required_criteria/min_criteria_count, applyPhaseObservation ` +
        `refuse de décider et la phase ne peut jamais passer via cette voie.`,
      );
    }
    expect(orphans.length).toBe(0);
  });

  it("chaque phase migrée wire any_flags: ['phase_evaluation_passed_<phase_id>']", () => {
    const missingBridge: string[] = [];
    for (const { scenarioId, phase } of migrated) {
      const rules = phase.completion_rules ?? {};
      const flags = Array.isArray(rules.any_flags) ? rules.any_flags : [];
      const expectedFlag = `phase_evaluation_passed_${phase.phase_id}`;
      if (!flags.includes(expectedFlag)) {
        missingBridge.push(`${scenarioId}::${phase.phase_id} → attendu "${expectedFlag}"`);
      }
    }
    if (missingBridge.length > 0) {
      throw new Error(
        `⚠ Phases E-migrées sans flag pont vers isCurrentPhaseValidatedByRules :\n` +
        missingBridge.map((m) => `  - ${m}`).join("\n") +
        `\n\nAjoute "phase_evaluation_passed_<phase_id>" à completion_rules.any_flags ` +
        `pour que le moteur legacy consomme le résultat de applyPhaseObservation.`,
      );
    }
    expect(missingBridge.length).toBe(0);
  });
});

describe("E8 deprecation gate — contrat de sortie /api/chat", () => {
  it("/api/chat expose toujours `phase_observation` dans sa réponse", () => {
    const src = readFileSync(CHAT_ROUTE, "utf-8");
    expect(src).toMatch(/phase_observation/);
    expect(src).toMatch(/observed_criteria/);
  });

  it("useSendChatMessage forwarde toujours observed_criteria + applique phase_observation", () => {
    const src = readFileSync(SEND_CHAT_HOOK, "utf-8");
    expect(src).toMatch(/observed_criteria/);
    expect(src).toMatch(/applyPhaseObservation/);
    expect(src).toMatch(/evaluation_history/);
  });

  it("/api/chat n'a pas ré-introduit `phase_passed` comme champ TypeScript", () => {
    // Ce test empêche un rollback silencieux vers l'ancien contrat où
    // l'IA décidait pass/fail. On cherche `phase_passed` en tant que :
    //   - clé d'objet (phase_passed:)
    //   - propriété d'accès (.phase_passed)
    //   - déclaration de variable (phase_passed = ou let phase_passed)
    // Les mentions dans string literals (prompts qui disent à l'IA
    // "n'utilise pas phase_passed") sont ignorées — elles sont
    // légitimes (voir la variante evaluationPromptE en E2).
    const src = readFileSync(CHAT_ROUTE, "utf-8");
    const bannedPatterns = [
      /(^|[^"'\w])phase_passed\s*[:=]/, // clé d'objet ou assignment
      /\.phase_passed(\W|$)/,            // accès de propriété
    ];
    const badLines = src
      .split("\n")
      .filter((line) => {
        // Ignore les lignes de commentaire.
        if (/^\s*(\/\/|\*|\/\*)/.test(line.trim())) return false;
        // Retire d'abord les string literals pour éviter les faux positifs.
        const stripped = line
          .replace(/"([^"\\]|\\.)*"/g, '""')
          .replace(/'([^'\\]|\\.)*'/g, "''")
          .replace(/`([^`\\]|\\.)*`/g, "``");
        return bannedPatterns.some((re) => re.test(stripped));
      });
    if (badLines.length > 0) {
      throw new Error(
        `⚠ /api/chat utilise phase_passed comme champ TypeScript :\n` +
        badLines.map((l) => `  ${l.trim()}`).join("\n") +
        `\n\nLe E-chantier a explicitement retiré ce champ — l'IA n'a plus ` +
        `à décider pass/fail. Utilise phase_observation à la place.`,
      );
    }
    expect(badLines.length).toBe(0);
  });
});
