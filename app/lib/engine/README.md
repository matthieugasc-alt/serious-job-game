# `@revealio/engine` — API publique du moteur de jeu

Point d'entrée unique et stable pour tout ce qu'un dev interne ou externe a besoin de savoir pour écrire, jouer ou étendre un scenario Revealio.

Toute évolution de cette API est verrouillée par un test dans `__tests__/engine.publicApi.test.ts` — retirer un export ou renommer une fonction fait échouer le build.

## Import minimal

```ts
import {
  initializeSession,
  isCurrentPhaseValidatedByRules,
  addPlayerMessage,
  completeCurrentPhaseAndAdvance,
  cloneSession,
} from "@/app/lib/engine";

const scenario = /* scenario.json chargé */;
const session = initializeSession(scenario);
addPlayerMessage(session, "Bonjour", "npc_example");

if (isCurrentPhaseValidatedByRules(session)) {
  const next = cloneSession(session);
  completeCurrentPhaseAndAdvance(next);
}
```

## Catégories d'exports

### 1. Types (aligne avec `schema/scenario.schema.json`)

- `ScenarioDefinition`, `SessionState`, `CompletionRules`, `PhaseMailConfig`
- `PhaseHandler`, `ModuleAction`, `PlayerContextValue`
- `DeepSaveSnapshot`, `FounderCampaign`, `FounderCheckpoint`

### 2. Runtime pur (source de vérité de la logique de jeu)

Toutes ces fonctions ne dépendent PAS de React. Utilisables depuis un test, un script CI, un job serveur.

| Fonction | Rôle |
|---|---|
| `initializeSession(scenario)` | Crée une session neuve pour un scenario |
| `cloneSession(s)` | Deep clone (avant mutation) |
| `buildRuntimeView(session)` | Snapshot dérivé (phase courante, criteria, etc.) |
| `addPlayerMessage`, `addAIMessage`, `addSystemMessage`, `addInboxMail` | Manipulation atomique des messages |
| `applyEvaluation(s, matches, delta, flags)` | Applique le retour d'évaluation IA |
| `isCurrentPhaseValidatedByRules(s)` | ⚠ SOURCE DE VÉRITÉ — évalue les 6 completion_rules |
| `completeCurrentPhaseAndAdvance(s)` | Marque + avance |
| `handlePhaseFailure(s)` | Loop-back sur failure_rules |
| `finishScenario(s)` | Marque fini |
| `checkNpcSuccessKeywords`, `checkNpcFailureKeywords` | Détection d'événements par keywords |
| `sendCurrentPhaseMail`, `updateMailDraft`, `toggleMailAttachment` | Manipulation mail |
| `injectPhaseEntryEvents` | Injection idempotente (via phaseEventTracker) |
| `updateAdaptiveMode`, `scheduleInterruption` | Micro-mécaniques temporelles |

### 3. Handlers & modules (mécaniques déclaratives)

| Export | Rôle |
|---|---|
| `resolvePhaseHandler(phase)` | Trouve le handler (Interview seul aujourd'hui) |
| `InterviewHandler`, `ContractHandler`, `MailHandler` | Handlers phase-level |
| `resolveModules(phase, scenario)` | Trouve les PhaseModule pour une phase |
| `dispatch(event, modules, ctx)` | Fait tourner les lifecycle hooks |
| `buildModuleContext(...)` | Construit le context read-only pour modules |
| `applyModuleActions(actions, next, deps)` | ⚠ Dispatch central 30+ types (exhaustive switch) |
| `executeMailAsyncEffect(effect, next)` | 4 kinds mail (HARD_REJECT, pivot Clinique, ...) |
| `runContractNegotiation(opts)` | 1 mécanique async pour S0/S2/S5 |
| `resolveDynamicActors`, `resolveEstablishmentPlaceholders` | Placeholder resolution scenario |

### 4. React hooks (couche player)

Consomment `PlayerContextValue` — utilisables uniquement dans le player. `usePlayerContext()` throw hors provider.

| Hook | Rôle |
|---|---|
| `useScenarioInit(deps)` | Boot sequence complète (auth + fetch + resume + entry_events) |
| `useSendChatMessage(ctx)` | Envoi chat + retry + success/failure keywords |
| `useSendMail(ctx)` | Envoi mail + MailModule dispatch + legacy fallback |
| `useEndPresentation(ctx)` | Fin de présentation vocale + eval API |
| `useDeepSave(deps)` | Deep snapshot founder toutes les 10s + on unload |
| `useFounderCheckpoint(deps)` | 4 notifiers checkpoint (advance/clear/rollback/deep_save) |
| `useTTS(deps)` | OpenAI TTS + Web Speech API fallback |
| `useToasts()` | Queue de toasts |
| `useMailSendValidation(opts)` | canActuallySendMail + reason |
| `useNewItemNotifications(opts)` | Trigger toast sur new mail / new chat |

### 5. Lib helpers

| Helper | Rôle |
|---|---|
| `fetchChatWithRetry(payload, deps)` | POST /api/chat avec 401/429/5xx/network retry |
| `phaseEventTracker` helpers | Clés idempotence `${phaseId}::${eventId}` |
| `getActorInfo(id, actors, chosenCtoId)` | Résout name/color/initials/status + placeholders |
| `buildClinicalArticles(type, scenario?)` | S3 : lit JSON puis fallback constantes |
| `buildChatContext(opts)` | C3 : enrichissement contextuel des chats |
| `cloneSession`, `playNotificationSound`, `fmtTime`, `getInitials`, `STATUS_COLORS` | Utilities |

### 6. Founder mode (checkpoint API)

| Export | Rôle |
|---|---|
| `deepSaveCheckpoint(campaign, snapshot)` | Persist deep snapshot (fix #70) |
| `advanceCheckpoint`, `rollbackCheckpoint`, `clearCheckpoint` | Server sync |
| `findActiveCampaign(userId)` | Query campaign en cours |
| `handleScenarioEntry(campaign, scenarioId)` | Détection first entry vs resume |

### 7. Guarded constants (verrouillées par TypeScript)

- `COMPLETION_RULES_KEYS` — liste exhaustive des completion_rules (satisfies keyof)

## Convention d'évolution

**Ajouter un export ici** :
1. Ajouter au barrel
2. Ajouter au tableau `ENGINE_PUBLIC_API` dans `__tests__/engine.publicApi.test.ts`
3. Le test type-check + runtime plantera si les 2 divergent

**Retirer un export** :
1. Bump majeur de package.json
2. Communiquer aux consommateurs

**Renommer un export** :
1. Ajouter un alias qui re-export l'ancien nom (compat)
2. Bump mineur
3. Deprecation warning au bout de N versions

## Voir aussi

- `app/scenarios/[scenarioId]/play/ARCHITECTURE.md` — architecture du player
- `app/scenarios/[scenarioId]/play/ARCHITECTURE_DEBRIEF.md` — état + risques
- `schema/scenario.schema.json` — schéma data-first des scenarios
- `scripts/scaffold-scenario.mjs` — CLI pour créer un scenario
