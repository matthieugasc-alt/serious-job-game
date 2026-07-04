# Archive legacy v2 — player « séquence de mécaniques » (Shell + MechanicModule React)

**Date de purge** : 2026-07-04
**Dernier commit contenant l'intégralité du code v2** : `e3c7a62e66c1cd343b86913caaf7bb6c2f26ad19`
(_feat(ops): /api/version (commit+build_id servis) + gate final de deploy_).
Tout ce qui a été supprimé est récupérable via `git show e3c7a62:<chemin>`
ou `git checkout e3c7a62 -- <chemin>`.

## Pourquoi

Migration TOTALE des 18 scénarios au format **v3 « poste de travail »**
(workspace immersif : threads, mailbox, documents, tools, triggers
déclaratifs). Le player v2 — un Shell générique qui montait un composant
React par mécanique (`MechanicModule`) — n'était plus servi par aucun
scénario : `/play/[scenarioId]` ne rend plus que le `WorkspacePlayer` v3
(`format !== "v3"` → 404). Décision PO : **pas de couche de compat**, le
code mort est supprimé, pas adapté.

## Rollback scénarios

Chaque dossier `scenarios/<id>/` conserve son **`scenario.v2.json`**
(la version v2 du scénario avant migration). Pour rejouer un scénario en
v2 il faut donc restaurer À LA FOIS le player v2 (`git checkout e3c7a62 --
app/player app/mechanics app/lib/engine app/play`) ET renommer le
`scenario.v2.json` en `scenario.json`.

## Ce qui a été supprimé (77 fichiers, 9 805 lignes)

### Player v2 (`app/player/`)
- `Shell.tsx` (311 l.), `MechanicRunner.tsx` (88 l.), `StepChrome.tsx`
  (106 l.), `TransitionOverlay.tsx` (55 l.), `liveIO.ts` (69 l.)
- `app/play/[scenarioId]/PlayerClient.tsx` (221 l.) — la route ne sert
  plus que le v3 ; le flux de complétion (`/api/v2/complete`,
  microDebrief founder) vit dans `app/workspace/WorkspacePlayer.tsx`.

### UI v2 des mécaniques (`app/mechanics/<id>/`)
Pour les 11 mécaniques (analyse, decision, diagnostic, entretien,
feedback, formation, mediation, negociation, presentation, production,
qa) + `_noop` :
- `Component.tsx` (UI React), `index.tsx` (assemblage MechanicModule),
  `Runtime.ts` (logique v2), `manifest.ts` (contrat v2),
  `__tests__/<id>.runtime.test.ts`
- Registres : `app/mechanics/index.ts` (MECHANIC_MODULES),
  `app/mechanics/manifests.ts` (MECHANIC_MANIFESTS),
  `app/mechanics/__tests__/registry.gardefou.test.ts`

Les mécaniques v3 survivent en **headless** : `spec.ts` + `specs.ts`
(MECHANIC_SPECS) + `specHelpers.ts` + `docs/`. Le garde-fou du CONTRAT
(« `app/mechanics/**` ne contient aucun .tsx ») est désormais actif dans
`app/mechanics/__tests__/specs.headless.test.ts`.

### Moteur v2 (`app/lib/engine/`)
- `sessionV2.ts` (173 l.) — remplacé par `sessionV3.ts`
- `composer.ts` (213 l.) — `validateScenarioV2` supprimé ;
  `resolveStepInputs` réécrit nativement dans `composerV3.ts`
  (`resolveStepInputsV3`, même format `inputs`)
- `__tests__/sessionV2.integration.test.ts`, `__tests__/composer.validation.test.ts`
- `index.ts` + `__tests__/engine.publicApi.test.ts` réécrits : l'API
  publique expose désormais le moteur v3 (criteria, sessionV3,
  workspaceReducer, triggers, composerV3, MECHANIC_SPECS)
- `mechanics.ts` allégé : suppression de `MechanicModule`, `MechanicIO`,
  `MechanicContext`, `MechanicResult`, `MechanicProps`,
  `MechanicManifest`, `ScenarioV2`, `StepInvocation`. Restent (vivants,
  utilisés par le v3) : `Json`, `JsonObject`, `ActorDef`, `DocumentDef`,
  `TranscriptEvent`, `EndingRule`, `StepResult`.

### Validation & tests v2
- `schema/mechanics.json` (registre v2 ; le v3 est `schema/mechanics-v3.json`)
- `scripts/validate-scenarios-v2.mjs` ; `npm run validate:scenarios`
  n'enchaîne plus que le validateur v3
- `tests/playthroughV2/**` (harness + 3 suites, mortes depuis la
  migration : `describe.runIf(0)`)

## Ce qui a été DÉPLACÉ (pas supprimé)

Les primitives UI partagées, utilisées par le workspace v3 :
- `app/player/primitives/{ChatPanel,Markdown,DocumentViewer,ui,CountdownTimer}.tsx`
  → `app/workspace/primitives/`
- `app/player/useNavigationGuard.ts` → `app/workspace/useNavigationGuard.ts`

## Ce qui RESTE (vivant, réutilisé par le v3)

- `app/lib/engine/criteria.ts` — `applyStepObservation` est LE moteur de
  verdict du v3 (l'IA observe, le moteur décide), inchangé.
- `app/lib/engine/mechanics.ts` — types fondamentaux (voir ci-dessus).
- `/api/v2/actor`, `/api/v2/observe`, `/api/v2/complete` — les routes
  I/O IA et complétion, partagées (le préfixe `v2` est historique).
- La clé localStorage `v2_completed_scenarios` (déverrouillage home) —
  nom historique conservé pour ne pas perdre la progression des joueurs.
- `scripts/validate-founder.mjs` — invariants endings ↔ outcomes founder,
  branchés sur `/api/v2/complete` (v3 accepté depuis le jalon pilote).
