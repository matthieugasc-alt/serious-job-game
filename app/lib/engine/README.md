# `@revealio/engine` — API publique du moteur v2 (mécaniques)

Point d'entrée unique et stable du moteur de jeu. Un scénario v2
(`format: "v2"`) est une **séquence de mécaniques** : chaque step invoque
une mécanique universelle (entretien, qa, presentation, analyse,
production, decision, negociation) avec des `params`, des `inputs` câblés
sur les outputs des steps précédents, des critères observés et des
completion_rules.

Toute évolution de cette API est verrouillée par
`__tests__/engine.publicApi.test.ts` — retirer ou renommer un export fait
échouer le test.

> Le moteur v1 (phases, PhaseModule, runtime.ts) a été supprimé — voir
> `archive/legacy-v1/ARCHIVE.md` pour le mapping conceptuel v1→v2 et le
> sha git du dernier commit le contenant.

## Import minimal

```ts
import {
  validateScenarioV2,
  initializeSessionV2,
  getCurrentStep,
  completeCurrentStep,
  computeEndingV2,
  MECHANIC_MANIFESTS,
} from "@/app/lib/engine";

const issues = validateScenarioV2(scenario, MECHANIC_MANIFESTS);
const session = initializeSessionV2(scenario);
const step = getCurrentStep(session);
// … la mécanique joue, produit un StepResult …
completeCurrentStep(session, result);
const ending = computeEndingV2(session);
```

## Catégories d'exports

### 1. `criteria` — évaluation par critères observés

| Export | Rôle |
|---|---|
| `applyStepObservation(criteria, rules, observation)` | ⚠ SOURCE DE VÉRITÉ pass/fail d'un step (successeur de applyPhaseObservation v1) |
| `CRITERION_SEVERITIES`, `CriterionSeverity` | `critical` / `required` / `bonus` / `minor` |
| `effectiveWeight(c)` | Poids effectif d'un critère |
| `StepCriterion`, `StepCompletionRules`, `StepObservation`, `StepEvaluationResult` | Types |

### 2. `mechanics` — contrat des mécaniques + format scénario

| Export | Rôle |
|---|---|
| `MechanicModule` | Une mécanique = `Component` React + `evaluate` |
| `MechanicManifest` | Params requis / output_keys déclarés |
| `MechanicIO`, `TranscriptEvent` | I/O vivant entre Shell et mécanique |
| `ScenarioV2`, `StepInvocation`, `StepResult`, `EndingRule` | Format scénario v2 |
| `ActorDef`, `DocumentDef`, `Json`, `JsonObject` | Briques partagées |

### 3. `sessionV2` — état de partie pur (sans React)

| Export | Rôle |
|---|---|
| `initializeSessionV2(scenario)` | Session neuve |
| `getCurrentStep(s)` / `completeCurrentStep(s, result)` | Avancement |
| `recordTranscriptEvent(s, ev)` | Journal de step |
| `computeEndingV2(s)` | Résout l'ending (requires_passed, sinon default) |
| `cloneSessionV2`, `serializeSessionV2`, `restoreSessionV2` | Persistance |

### 4. `composer` — validation statique + câblage

| Export | Rôle |
|---|---|
| `validateScenarioV2(scenario, manifests)` | Garde-fou structurel (parité CLI : `scripts/validate-scenarios-v2.mjs`) |
| `resolveStepInputs(step, session)` | Résout `inputs` (`step_id.output_key`) |
| `ComposerIssue` | Type d'issue |

### 5. Registre

| Export | Rôle |
|---|---|
| `MECHANIC_MANIFESTS` | Registre des mécaniques (app/mechanics/manifests.ts), garde-fou testé contre `schema/mechanics.json` |

## Ce qui n'est PAS ici

- Les composants React des mécaniques (`app/mechanics/<id>/Component.tsx`)
  et le player (`app/player/Shell.tsx`, `MechanicRunner`) : couche
  présentation, importable directement.
- Le mode founder (`app/lib/founder.ts`) : économie de campagne, branchée
  sur le moteur via `/api/v2/complete`.
