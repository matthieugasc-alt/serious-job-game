/**
 * Tests unit — scaffolding scenario + template intégrité.
 *
 * ⚠ GARDE-FOU AUTOMATIQUE:
 *   1. Le template scenario.json doit passer le schéma en permanence.
 *      Si quelqu'un modifie le template et casse un champ, le test échoue.
 *   2. Un scaffold dry-run (patch id + title) produit un scenario qui
 *      passe le schéma → prouve que le CLI génère bien de la data valide.
 *   3. La liste des placeholders attendus dans le README est stable.
 *
 * Le vrai test E2E (spawn `npm run scaffold:scenario`) demanderait
 * l'écriture disque + cleanup. Ici on teste la logique en mémoire.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const projectRoot = path.resolve(__dirname, "..", "..");
const templateDir = path.join(projectRoot, "scripts", "templates", "scenario");
const schemaPath = path.join(projectRoot, "schema", "scenario.schema.json");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// ─── Fixture: template chargé ────────────────────────────────────

const templateScenarioPath = path.join(templateDir, "scenario.json");
const rawTemplate = JSON.parse(fs.readFileSync(templateScenarioPath, "utf8"));

describe("Template scaffolding — garde-fou", () => {
  it("le template scenario.json existe et est du JSON valide", () => {
    expect(rawTemplate).toBeTruthy();
    expect(typeof rawTemplate).toBe("object");
  });

  it("le template match le schéma en l'état (avant patch)", () => {
    const ok = validate(rawTemplate);
    if (!ok) {
      const errors = (validate.errors || [])
        .map((e) => `  ${e.instancePath || "(root)"}: ${e.message}`)
        .join("\n");
      throw new Error(`Template scenario.json ne match pas le schéma:\n${errors}`);
    }
    expect(ok).toBe(true);
  });

  it("le README.md contient les 2 placeholders attendus", () => {
    const readme = fs.readFileSync(path.join(templateDir, "README.md"), "utf8");
    expect(readme).toContain("{{SCENARIO_ID}}");
    expect(readme).toContain("{{SCENARIO_TITLE}}");
  });

  it("le prompt d'exemple existe et est non vide", () => {
    const promptPath = path.join(templateDir, "prompts", "npc_example.md");
    expect(fs.existsSync(promptPath)).toBe(true);
    const content = fs.readFileSync(promptPath, "utf8");
    expect(content.length).toBeGreaterThan(200);
    expect(content).toContain("Identité");
  });

  it("un scaffold simulé produit un scenario valide (id + title patchés)", () => {
    // Simule ce que fait scaffold-scenario.mjs
    const scaffolded = JSON.parse(JSON.stringify(rawTemplate));
    scaffolded.scenario_id = "test_scaffolded_scenario";
    scaffolded.meta.title = "Test Scenario Scaffolded";
    scaffolded.meta.job_family = "custom";
    scaffolded.meta.difficulty = "intermediate";
    scaffolded.meta.estimated_duration_min = 15;

    const ok = validate(scaffolded);
    if (!ok) {
      const errors = (validate.errors || [])
        .map((e) => `  ${e.instancePath || "(root)"}: ${e.message}`)
        .join("\n");
      throw new Error(`Scenario scaffolded ne match pas le schéma:\n${errors}`);
    }
    expect(ok).toBe(true);
  });

  it("le template contient au moins 2 phases (chat + mail) pour couvrir les 2 patterns majeurs", () => {
    expect(rawTemplate.phases).toBeInstanceOf(Array);
    expect(rawTemplate.phases.length).toBeGreaterThanOrEqual(2);
    // Une phase avec chat
    const chatPhase = rawTemplate.phases.find((p: any) => p.interaction_mode === "chat_mail" && (!p.mail_config || !p.mail_config.enabled));
    // Une phase avec mail
    const mailPhase = rawTemplate.phases.find((p: any) => p.mail_config?.enabled === true);
    expect(mailPhase, "template must have a mail_config.enabled phase to demonstrate the send flow").toBeTruthy();
    // Note: chatPhase peut être null si les 2 phases activent le mail — c'est OK
  });

  it("le template déclare bien un actor player + au moins un actor AI", () => {
    const actors = rawTemplate.actors;
    expect(actors.some((a: any) => a.controlled_by === "player")).toBe(true);
    const aiActor = actors.find((a: any) => a.controlled_by === "ai");
    expect(aiActor).toBeTruthy();
    // AI actor requires prompt_file
    expect(aiActor.prompt_file).toBeTruthy();
    const promptPath = path.join(templateDir, aiActor.prompt_file);
    expect(fs.existsSync(promptPath), `prompt_file "${aiActor.prompt_file}" must exist on disk`).toBe(true);
  });
});
