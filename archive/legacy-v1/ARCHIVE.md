# Archive legacy v1 — player par phases

**Date de purge** : 2026-07-02
**Dernier commit contenant l'intégralité du code v1** : `17ba9c6e8b764552a30e45d4cfa40ad812e6adb4`
(_feat(jalon5): founder branché sur le moteur v2_). Tout ce qui a été supprimé
est récupérable via `git show 17ba9c6:<chemin>` ou `git checkout 17ba9c6 -- <chemin>`.

## Pourquoi

Pivot d'architecture **phases → mécaniques** (décision PO, cf.
`docs/MECANIQUES.md` et `AUDIT_ARCHITECTURE_MECANIQUES.md`). Le player v1
était un monolithe (page.tsx de 2 743 lignes + handlers/modules/hooks
spécifiques par type de phase) où chaque nouveau scénario exigeait du code.
Le moteur v2 (`app/lib/engine/` : criteria, mechanics, sessionV2, composer +
`app/mechanics/` + `app/player/`) exécute n'importe quel scénario déclaré
comme **séquence de mécaniques** sans code spécifique. La rétrocompatibilité
n'était pas un objectif : le v1 est supprimé, pas adapté.

## Mapping conceptuel v1 → v2

| v1 (phases) | v2 (mécaniques) |
|---|---|
| `phase` (PhaseDefinition) | `step` (StepInvocation dans `sequence[]`) |
| `PhaseModule` (Mail/Contract/Interview) | `Mechanic` (MechanicModule : Component + evaluate) |
| `mail_config` de la phase | `params` de la mécanique `production` |
| `interaction_mode` / `interaction_modes` | choix de la `mechanic` du step |
| `ModuleAction` (dispatch d'effets) | `MechanicResult` (output JSON + StepResult) |
| `applyPhaseObservation` (app/lib/evaluation) | `applyStepObservation` (app/lib/engine/criteria.ts) |
| `SessionState` + runtime.ts | `SessionV2State` + sessionV2.ts |
| `/api/chat` (branches par contenu de scénario) | `/api/v2/actor` (+ `/api/v2/observe`) génériques |
| debrief `/api/debrief` + `useDebrief` | ending v2 (`computeEndingV2`) + `/api/v2/complete` |
| checkpoint founder `/api/founder/checkpoint` + `apply-outcome` | `/api/v2/complete` (résout et applique l'outcome founder) |
| `schema/scenario.schema.json` | `schema/mechanics.json` + `validateScenarioV2` (composer) |

## Comment relire un ancien scénario

Un `scenario.json` v1 (dans `scenarios/` ci-dessous) se lit ainsi :
`meta` (titre, difficulté, job_family) → `actors` (PNJ + prompt) →
`phases[]` (chacune : `interaction_mode`, `mail_config` éventuel,
`evaluation.observed_criteria` + `completion_rules`, `on_success`/`on_failure`)
→ `endings`/`debrief`. Le schéma JSON complet est archivé ici :
`archive/legacy-v1/scenario.schema.json`. Pour le rejouer il faudrait le
réécrire au format v2 (voir `scenarios/vitrine_signer_le_pilote/` comme
référence du format cible).

## Contenu de l'archive

- `scenarios/` — les 17 scénarios v1 supprimés (scenario.json + prompts/ +
  ressources) : amendement_derniere_minute, art_du_malentendu, atterrissage,
  bug_du_vendredi, client_qui_hesite, closing_sous_pression,
  compromis_qui_coince, due_diligence_sous_tension, feature_qui_divise,
  heritage_fourviere (avec ses PDF), inclusion_urgence, mot_des_parents,
  permanence_debordee, question_gouvernement, relance_qui_coince,
  retour_utilisateur, sortie_annulee (+ `scenario-atterrissage.json.bak`).
- `founder-v1/` — les 6 scenario.json founder **d'avant réécriture v2**
  (extraits de git au parent du commit `c6cee51`, soit `2a4d16b`).
- `player/` — ARCHITECTURE.md et ARCHITECTURE_DEBRIEF.md du player legacy
  (le code lui-même n'est pas copié : git le garde, cf. sha ci-dessus).
- `scenario.schema.json` — le schéma JSON du format v1.
- `reports/` — rapports des harness de test v1 (runs founder headless,
  rapport pilot-pitch).

## Supprimé (par catégorie)

### Player v1 et pages legacy
- `app/scenarios/[scenarioId]/play/**` — page.tsx (2 743 l.), PlayerContext,
  handlers/ (+modules/), contracts/, components/ (dont mail/), hooks/, lib/,
  MailView/ChatView/DocumentsView/NotesView/DebriefView + leurs tests.
- `app/scenarios/[scenarioId]/page.tsx` (détail, 490 l.) et
  `app/scenarios/[scenarioId]/debrief/page.tsx` (541 l.).
- `app/introduction/` et `app/debrief/` (pages du flow v1, plus aucun lien entrant).

### Scénarios
- Les 17 dossiers v1 de `scenarios/` (archivés ici). Restent les 7 v2 :
  `vitrine_signer_le_pilote` + `founder_00..05`.

### Routes API
- `/api/chat` (1 247 l., branches par contenu : prospection_evaluation,
  dsi_validation…) — remplacé par `/api/v2/actor`.
- `/api/debrief` (génération LLM du debrief v1 ; `/api/debrief/pdf` est CONSERVÉ,
  utilisé par `app/history`).
- `/api/evaluate-presentation`, `/api/tts` (appelés uniquement par le player v1 ;
  la mécanique presentation passe par `/api/v2/observe`, la voix par `/api/transcribe` qui reste).
- `/api/scenarios/[scenarioId]` + `/prompts/[actorId]` (le player v2 lit le
  scénario sur disque ; `/api/scenarios` liste reste pour la home).
- `/api/download` (seuls les composants v1 l'appelaient).
- `/api/founder/apply-outcome`, `/api/founder/checkpoint`, `/api/founder/rules`
  — flow legacy remplacé par `/api/v2/complete` (`/api/founder/campaigns` reste).
- `/api/admin/scenario-patch`, `/api/admin/scenario-diff`, `/api/admin/replay/**`.

### app/lib
- `runtime.ts` (1 572 l., moteur de phases), `types.ts` (1 384 l., types v1 —
  plus aucun importeur vivant), `adaptScenario.ts`, `scenarioValidator.ts`,
  `evaluation/applyPhaseObservation.ts` (+ tests, remplacé par engine/criteria),
  `mailSimilarity.ts`, `chatContextEnrichment.ts`, `contactVisibility.ts`,
  `pilotPitchScoring.ts`, `scenarioVersioning.ts`,
  `capabilities/pickBestMode.ts` (+ ses 2 tests — sélecteur basé sur
  `interaction_modes` v1 ; `voiceCapability` reste, utilisé par la mécanique presentation).

### Pages admin structurellement v1 (« à reconstruire sur v2 » — dette documentée)
- `app/admin/edit-criterion/**` — éditait les critères par
  scenario/phase/criterion dans les JSON v1.
- `app/admin/replay/**` — rejouait `checkpoint.sessionSnapshot.evaluation_history`
  (audit E4 du moteur v1). À reconstruire sur `data/v2_completions/`.
- `app/admin/scenario-diff/**` — diff de versions v1 (scenarioVersioning).
- Les liens vers ces pages dans `app/admin/analytics` ont été neutralisés.

### Schéma & garde-fous v1
- `schema/scenario.schema.json` (archivé ici) + `schema/__tests__/scenario.schema.test.ts`
  — plus aucun scénario v1 dans le repo ; le studio gelé ne lit pas le schéma.
  Le garde-fou v2 est `scripts/validate-scenarios-v2.mjs` + `schema/mechanics.json`.

### Scripts & harness
- `scripts/validate-scenarios.mjs`/`.ts` (+ `app/lib/scenarioValidator.ts`) —
  `npm run validate:scenarios` pointe désormais sur `validate-scenarios-v2.mjs`.
- `scripts/validate-founder.mjs` v1 (+ `.ts`) — **réécrit en v2** : vérifie que
  chaque ending v2 des scénarios founder a un outcome dans `founder_rules.json`
  (et réciproque), et qu'il y a exactement un ending default.
- `scripts/inject-schema-pointer.mjs`, `scripts/scaffold-scenario.mjs`
  (+ templates/ + tests) — outillage du format v1.
- `scripts/lib/checkEvaluationCoverage.mjs` (+ test) — invariants d'évaluation v1.
- `tests/` : agents/ (headless-engine v1, agent-runner, personalities),
  debug-s5-rollback.ts, pilot-pitch-grader.ts, run-founder.ts, run-fourviere.ts.

### API publique du moteur
- `app/lib/engine/index.ts` réécrit : n'exporte plus que le v2 (criteria,
  mechanics, sessionV2, composer, MECHANIC_MANIFESTS).
  `engine.publicApi.test.ts` mis à jour en conséquence.

## Adaptations (code vivant)

- `app/page.tsx` — la home lance directement `/play/<id>` ; plus de page détail.
- `app/lib/scenarios.ts` — `listScenarios()` ne retourne que les scénarios
  `format: "v2"` (les teasers studio restent affichés, verrouillés) ; les
  helpers morts (loadScenario, loadPrompt, scenarioExists, getAllScenarioIds,
  isTeaserScenario) ont été supprimés.
- `app/profile/page.tsx` — « scénarios conseillés » pointent vers `/play/<id>`.
- `app/admin/analytics/page.tsx` — liens edit-criterion/replay retirés.
- `app/lib/capabilities/index.ts` — barrel réduit à voiceCapability.
- `package.json` — `validate:scenarios` → v2 ; `scenario:pointer` et
  `scaffold:scenario` supprimés ; `validate:founder` → validateur v2.
- `vitest.config.ts` — coverage.include repointé sur engine/mechanics/player.
- `app/studio/[studioId]/page.tsx` — bandeau « Studio gelé » ;
  `app/lib/studioCompiler.ts` — commentaire d'en-tête de gel.

## Conservé à contrecœur (dette)

| Fichier | Raison |
|---|---|
| `app/lib/setByPath.ts` | importé par le studio gelé (`applyAssignments`) — partira avec la migration studio v2. |
| `app/lib/studioCompiler.ts` + `app/lib/studioAI.ts` + `app/studio/**` + `/api/studio/**` | studio gelé (décision PO) : produit du format v1 non exécutable ; conservé pour les brouillons `data/studio/` et l'UX. |
| Bouton « tester » du studio (`window.open('/scenarios/<id>/play')`) | pointe vers une route supprimée (404) — assumé, le studio est gelé et bandeauté. |
| `app/lib/scenarioConfig.ts` + `/api/admin/scenario-config` | système de verrous/prérequis de la home — pas structurellement v1, encore utilisé par la home et l'admin. |
| `app/lib/gameEvents/client.ts` | plus d'émetteur côté player (le v1 l'appelait) ; le reader/writer servent l'analytics et `/api/v2/complete`. Émission v2 à câbler. |
| `/api/admin/save-scenario`, `/api/admin/convert`, `/api/admin/scenario-editor` | écrivent/éditent des scenario.json bruts depuis l'admin — génériques (marchent sur du v2), mais l'UX admin autour date du v1. |

## Ce qui n'a PAS bougé

Le socle v2 (`app/lib/engine/criteria|mechanics|sessionV2|composer`),
`app/mechanics/**`, `app/player/**`, `app/play/[scenarioId]`, `/api/v2/**`,
les 7 scénarios v2, le flow founder v2 (`app/lib/founder.ts`,
`/api/founder/campaigns`, `/api/v2/complete`), `deploy.sh`.
