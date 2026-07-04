# `@revealio/engine` — API publique du moteur v3 (poste de travail)

Point d'entrée unique et stable du moteur de jeu. Un scénario v3
(`format: "v3"`) est une **séquence de mécaniques headless** jouée dans
un poste de travail simulé : le joueur agit via des `WorkspaceAction`
(messages, mails, documents, tools), le reducer applique, les
`CompletionTrigger` déclaratifs décident de la fin de step, l'IA observe
les critères et **le moteur décide** (`applyStepObservation`).

Toute évolution de cette API est verrouillée par
`__tests__/engine.publicApi.test.ts` — retirer ou renommer un export fait
échouer le test.

> Le moteur v1 (phases, PhaseModule) est archivé dans
> `archive/legacy-v1/ARCHIVE.md` ; le player v2 (MechanicModule React,
> Shell, sessionV2, composer) dans `archive/legacy-v2/ARCHIVE.md` — avec
> les sha git des derniers commits les contenant.

## Import minimal

```ts
import {
  validateScenarioV3,
  initializeSessionV3,
  enterStep,
  applyWorkspaceAction,
  computeEndingV3,
  MECHANIC_SPECS,
  MECHANIC_SPEC_MANIFESTS,
} from "@/app/lib/engine";

const issues = validateScenarioV3(scenario, MECHANIC_SPEC_MANIFESTS, tools);
const session = initializeSessionV3(scenario);
enterStep(session, { specs: MECHANIC_SPECS });
// … le joueur agit …
const { effects } = applyWorkspaceAction(session, action, { specs: MECHANIC_SPECS });
// … l'orchestrateur exécute les PendingEffects (I/O IA) …
const ending = computeEndingV3(session);
```

## Catégories d'exports

### 1. `criteria` — évaluation par critères observés

| Export | Rôle |
|---|---|
| `applyStepObservation(criteria, rules, observation)` | ⚠ SOURCE DE VÉRITÉ pass/fail d'un step |
| `CRITERION_SEVERITIES`, `CriterionSeverity` | `critical` / `required` / `bonus` / `minor` |
| `effectiveWeight(c)` | Poids effectif d'un critère |
| `StepCriterion`, `StepCompletionRules`, `StepObservation`, `StepEvaluationResult` | Types |

### 2. `mechanics` — types fondamentaux partagés

| Export | Rôle |
|---|---|
| `ActorDef`, `DocumentDef` | Déclarations du scénario |
| `TranscriptEvent` | Trace d'échange (ChatPanel, orchestrateur, /api/v2/actor) |
| `EndingRule`, `StepResult` | Fin de scénario, résultat de step persisté |
| `Json`, `JsonObject` | Briques partagées |

### 3. `workspace` — vocabulaire du poste de travail (types)

`ScenarioV3`, `StepInvocationV3`, `WorkspaceState`, `WorkspaceAction`,
`LoggedAction`, `CompletionTrigger`, `NarrativeEvent`, `MechanicSpec`,
`MechanicSpecManifest`, `PendingEffect`, `DispatchResult`, …

### 4. `sessionV3` — état de partie pur (sans React)

| Export | Rôle |
|---|---|
| `initializeSessionV3(scenario)` | Session neuve |
| `getCurrentStepV3(s)` | Step courant |
| `computeEndingV3(s)` | Résout l'ending (requires_passed, sinon default) |
| `cloneSessionV3`, `serializeSessionV3`, `restoreSessionV3` | Persistance |

### 5. `workspaceReducer` — le cœur du moteur

| Export | Rôle |
|---|---|
| `applyWorkspaceAction(s, action, opts)` | Applique une action joueur, rend les `PendingEffect` |
| `enterStep(s, opts)` | Entrée de step (threads, events, mails d'amorce) |
| `applyNarrativeEffect`, `recordActorMessage` | Effets narratifs / réponses IA |
| `recordStepObservation`, `completeStepV3` | Observation → verdict → avancement |

### 6. `triggers` — fins de step déclaratives

| Export | Rôle |
|---|---|
| `evaluateTrigger(trigger, ctx)` | Un `CompletionTrigger` est-il satisfait ? |
| `triggerMentions(trigger, types)` | Le trigger référence-t-il ces types ? |
| `actorValidationCriterion`, `ACTOR_VALIDATION_PREFIX` | Convention actor_validation |

### 7. `composerV3` — validation statique + câblage

| Export | Rôle |
|---|---|
| `validateScenarioV3(scenario, manifests, tools)` | Garde-fou structurel (parité CLI : `scripts/validate-scenarios-v3.mjs`) |
| `resolveStepInputsV3(session, step)` | Résout `inputs` (`"stepId"` ou `"stepId.cle"`) |
| `ComposerIssueV3` | Type d'issue |

### 8. Registre

| Export | Rôle |
|---|---|
| `MECHANIC_SPECS` / `MECHANIC_SPEC_MANIFESTS` | Registre des mécaniques headless (app/mechanics/specs.ts), garde-fou testé contre `schema/mechanics-v3.json` |

## Ce qui n'est PAS ici

- La couche présentation : `app/workspace/` (WorkspacePlayer,
  WorkspaceShell, apps, tools, orchestrateur I/O IA, primitives UI),
  importable directement.
- Le mode founder (`app/lib/founder.ts`) : économie de campagne, branchée
  sur le moteur via `/api/v2/complete`.
