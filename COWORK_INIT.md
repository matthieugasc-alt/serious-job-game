# Cowork Init — Revealio

**Fichier d'onboarding pour toute nouvelle session Cowork.**
À lire en premier avant d'ouvrir n'importe quoi d'autre.

---

## Vers quel dossier pointer le nouveau Cowork

**Réponse courte** : `/Users/gascmatthieu/serious-job-game`

C'est le dépôt git complet du projet. Rien à faire d'autre que sélectionner ce dossier dans Cowork. Il contient :
- Le code source (app/, scripts/, schema/, hooks/)
- Les scenarios (`scenarios/`)
- Les documents d'onboarding et les debriefs (à la racine : `AGENTS.md`, `CLAUDE.md`, `DEBRIEF_*.md`, `AUDIT_*.md`, `COWORK_INIT.md`)
- Le déploiement (`scripts/deploy.sh`)
- Les tests (`app/**/__tests__/`, `scripts/__tests__/`)
- La configuration (`package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`)

Le fichier `CLAUDE.md` à la racine importe automatiquement `AGENTS.md`. Cowork lit `CLAUDE.md` en premier, il n'y a donc rien à configurer manuellement — le contexte se charge tout seul.

---

## Ce qu'est Revealio

Revealio est une plateforme de **serious games professionnels** en ligne sur https://revealio.live. Le joueur incarne un professionnel (fondateur, commercial, manager, médecin, enseignant...) dans une simulation où il interagit avec des personnages IA (chat + mail + voix), consulte des documents, prend des décisions, signe des contrats. Le moteur évalue ses actions en croisant l'observation IA avec des critères déclaratifs.

**Vision cible (en cours de définition)** : passer d'un catalogue de serious games à un **moteur universel de simulation professionnelle**, où un nouveau métier se crée quasiment sans code. Lire `AUDIT_ARCHITECTURE_MECANIQUES.md` pour la version détaillée.

---

## Stack technique

- **Next.js 16.2.2** avec Turbopack
- **React 18** avec hooks + Context (PlayerContext au cœur du player)
- **TypeScript strict mode** — `tsc --noEmit` doit être vert avant tout commit
- **Vitest** pour les tests unitaires (fonctions pures uniquement, pas de tests React)
- **Ajv Draft 2020-12** pour la validation des scenarios JSON
- **PM2** sur serveur Ubuntu (204.168.217.145) pour le déploiement prod
- **JSONL append-only** pour la télémétrie (`data/game_events/`) et l'archivage versionné (`data/scenario_versions/`)

---

## Historique par chantiers (dans l'ordre chronologique)

Un chantier = une lettre + un numéro d'étape. Livrés dans cet ordre depuis avril 2026 :

**Chantiers PRIO 1-11** — décomposition du monolithe `page.tsx` (5500+ lignes) en modules/hooks. Livré, l'organisation actuelle en découle.

**Prio 2** — installation Vitest + tests unitaires sur les mécaniques pures.

**Prio 3** — extraction de `PlayerContext` + `sendMessage` / `handleSendMail` / `endPresentation`.

**Prio 4** — sortir OnePagerEditor et clinical contracts vers JSON (data-first).

**Chantier F (Fondations moteur)** — F1 schéma JSON versionné + validate:scenarios build-fail ; F2 API publique `app/lib/engine/` ; F3 CLI scaffolding scenarios ; F4 module registry auto-discoverable.

**Chantier V (Voice as capability)** — V1 CapabilityDetector boot-time ; V2 schéma `interaction_modes` array ; V3 `pickBestMode` sélecteur ; V4 `CapabilityFallbackBanner` UX ; V5 refactor `voice_qa` mode-agnostique ; V6 garde-fou coverage. Livrable : le micro devient une capacité, plus une dépendance ; fallback texte automatique avec timer allongé.

**Chantier E (Évaluations explicables)** — E1 schéma `phase.evaluation.observed_criteria` ; E2 refonte prompts `/api/chat` avec bloc `phase_observation` ; E3 `applyPhaseObservation` moteur qui décide ; E4 persistance `evaluation_history` + garde-fou snapshot round-trip ; E5 vue admin `/admin/replay/[campaignId]` ; E6 garde-fou coverage build ; E7 migration progressive 3 scenarios pilotes ; E8 deprecation gate runtime. Livrable : l'IA observe, le scénario déclare, le moteur décide. 100 % explicable.

**Chantier W (Sévérité pédagogique)** — W1 schéma severity `critical|required|bonus|minor` ; W2 sémantique moteur + short-circuit sur critical ; W3 `critical_failure_criteria` ; W4 vue replay couleur ; W5 garde-fou no-fail-path ; W6 re-migration 3 pilotes ; W7 guide créateur `docs/SEVERITY_GUIDE.md`.

**Chantier X (Replay actionnable)** — X1 vraie page `/admin/edit-criterion/[scenarioId]/[phaseId]/[criterionId]` + endpoint `/api/admin/scenario-patch` ; X2 vue agrégée `/admin/replay/scenario/[scenarioId]` cross-campaign.

**Chantier Y (Télémétrie pédagogique)** — Y1 3 events standardisés `phase_evaluated`, `help_requested`, `scenario_abandoned` ; Y2 endpoint ingestion ; Y3 stockage JSONL ; Y4 dashboard `/admin/analytics` avec 6 métriques clés.

**Chantier Z (Référentiel de compétences)** — Z1 `data/competencies.json` avec 9 compétences initiales ; Z2 CRUD admin `/admin/competencies`.

**Chantier CF (Critère × compétence × famille d'erreur)** — CF1 schéma étendu avec `competencies: string[]` + `error_type` ; CF2 agrégation dashboard.

**Chantier VS (Versioning « git blame »)** — VS1 `scenarioVersioning.ts` + `data/scenario_versions/` ; VS2 `EvaluationHistoryEntry.conditions` avec snapshot des critères ; VS3 vue diff `/admin/scenario-diff/[scenarioId]`.

**Chantier AS (Assistant de conception)** — AS1 `app/lib/suggestions/rules.ts` avec 6 types de règles + seuils configurables ; AS2 section « Suggestions d'amélioration » dans le dashboard analytics.

**Chantiers non-livrés (proposés dans l'audit)** — refonte mécaniques (voir `AUDIT_ARCHITECTURE_MECANIQUES.md`).

---

## Debriefs à lire dans l'ordre pour comprendre l'état actuel

Tous à la racine du repo. Rédigés dans un style « livrables + failles restantes ».

1. `DEBRIEF_V_E_PRODUCT_OWNER.md` — chantiers voice as capability + évaluations explicables. Positif, montre la valeur.
2. `DEBRIEF_W_X_Y_PRODUCT_OWNER.md` — sévérité + replay actionnable + télémétrie. Plus critique, liste les failles.
3. `DEBRIEF_Z_CF_VS_AS_PRODUCT_OWNER.md` — référentiel compétences + versioning + assistant. Le plus honnête, liste les couches vides.
4. `AUDIT_ARCHITECTURE_MECANIQUES.md` — l'audit stratégique. Explique pourquoi l'architecture actuelle n'atteindra pas la vision « moteur universel » sans réécriture significative. **Le document le plus important pour comprendre où on va.**

Il y a aussi `AUDIT_CONTRATS_FOUNDER.md`, `AUDIT_PAGE_TSX.md`, `AUDIT_STABILISATION.md`, `AUDIT_S2_ALEXANDRE_HARDCODE.md`, `SCENARIO_STUDIO_REFOUNDATION.md`, `FOUNDER_AUDIT.md`, `FOUNDER_SCENARIO_CREATION.md` — plus anciens, contexte historique, moins prioritaires.

Le `docs/SEVERITY_GUIDE.md` est le seul guide créateur produit, spécifique au chantier W.

---

## Culture technique et conventions

**Séparation IA observe / moteur décide.** Le pattern architectural central. L'IA renvoie une observation structurée (`phase_observation.criteria: {[id]: boolean}`), le moteur applique les règles déclaratives (`applyPhaseObservation`). Ne jamais laisser l'IA décider seule d'un pass/fail.

**Garde-fous automatiques plutôt que documentation.** Chaque chantier livre un test qui casse le build si la convention n'est pas respectée. Voir `checkEvaluationCoverage.mjs` (4 codes E-chantier + 3 W-chantier + 1 CF), `deprecationGate.test.ts`, `interactionModes.coverage.test.ts`, `phaseModuleRegistry.coverage.test.ts`, `engine.publicApi.test.ts`.

**Data-first, code générique.** Toute nouvelle capacité passe d'abord par une extension du schéma JSON, puis un helper runtime pur, puis un garde-fou build, puis éventuellement une vue admin. Jamais l'inverse.

**Fonctions pures testables.** Tout ce qui est mécanique de jeu vit dans `app/lib/` et n'importe pas React. Testé unitairement via Vitest (node env). Aujourd'hui : 202 tests sur 21 fichiers, 100 % passants.

**Snake_case immuable pour les ids.** `phase_id`, `criterion_id`, `competency_id` — jamais renommer une fois posé (les historiques `evaluation_history` référencent).

**Aucune skill créée en session Cowork.** Cf. `AGENTS.md` — les overrides skills vivent dans `.claude/skills/`. Une seule override active : `executive-priority-briefing` (partenaire Olivier Véran pour prospection hospitalière).

---

## Modalités de déploiement

### Environnements

- **Local** : sur le Mac de Matthieu, chemin `/Users/gascmatthieu/serious-job-game`. C'est le dossier autoritatif.
- **Sandbox Cowork** : mount virtuel `/sessions/<session-id>/mnt/serious-job-game`. Toutes les Read/Write de Claude passent par là. **Ne pas essayer de rm/mv dans .git** — EPERM garanti.
- **Prod** : serveur Ubuntu `root@204.168.217.145`, chemin `/var/www/serious-job-game`, PM2 avec app name `serious-job-game`.

### Workflow standard de déploiement

```bash
cd /Users/gascmatthieu/serious-job-game
git status                                    # confirme les changements attendus
git add -A
git commit -m "<message clair et structuré>"
git push origin main
ssh root@204.168.217.145 "cd /var/www/serious-job-game && ./scripts/deploy.sh"
```

Le script `scripts/deploy.sh` fait dans l'ordre :

1. `git pull` — récupère les changements
2. `npm install` — capture les nouvelles dépendances (explicite, pas skip)
3. `rm -rf .next` — nuke le cache Turbopack
4. `npm run build` — inclut `tsc --noEmit` + `validate:scenarios` en amont
5. `pm2 delete + pm2 start npm --name serious-job-game -- start` — redémarrage propre (pas juste restart)
6. `pm2 save` — persiste le process
7. Smoke tests HTTP sur `/` (home) et `/founder/[campaignId]` (hub founder)

Le script est **fail-fast** (`set -e`) : si `npm install` ou `npm run build` échoue, PM2 n'est pas redémarré.

### Gotchas récurrents

**`.git/index.lock` ou `.git/HEAD.lock`** : un git process précédent a crashé. Sur le Mac :
```bash
rm /Users/gascmatthieu/serious-job-game/.git/index.lock
rm /Users/gascmatthieu/serious-job-game/.git/HEAD.lock
```
La sandbox Cowork ne peut pas les supprimer (EPERM garanti), il faut le faire depuis le terminal Mac.

**Sandbox EPERM sur certains fichiers** : la sandbox Cowork ne peut pas modifier certains fichiers du repo (souvent ceux créés hors session). Si un `rm` ou `mv` échoue avec EPERM, le workaround est de laisser Matthieu le faire depuis son terminal local, ou de contenter d'un `.gitignore` / d'un stub vide.

**Timeouts SSH** : si le script deploy prend > 45 secondes (build lourd), Cowork peut timeout. Solution : Matthieu lance manuellement depuis son terminal.

### Validation avant tout push

Toujours faire avant `git commit` :

```bash
npx tsc --noEmit           # doit être silencieux
npm run validate:scenarios # doit afficher "VALIDATION PASSED"
npx vitest run             # doit afficher "202 passed" (ou plus)
```

Si l'un des trois n'est pas vert, ne pas pusher. Cette discipline a évité 100 % des régressions post-refactor.

### Rollback d'urgence en prod

Aucun mécanisme automatique. Manuel :

```bash
ssh root@204.168.217.145
cd /var/www/serious-job-game
git log --oneline -5              # trouve le commit précédent stable
git reset --hard <sha>
./scripts/deploy.sh
```

---

## Structure du repo (le minimum à connaître)

```
serious-job-game/
├─ AGENTS.md, CLAUDE.md         # onboarding minimal (import + skill overrides)
├─ COWORK_INIT.md               # ce document
├─ DEBRIEF_*.md                 # 3 debriefs V/E, W/X/Y, Z/CF/VS/AS
├─ AUDIT_*.md                   # audits (dont AUDIT_ARCHITECTURE_MECANIQUES.md)
├─ package.json, tsconfig.json, vitest.config.ts, next.config.ts
├─ app/
│  ├─ admin/                    # vues admin (analytics, replay, competencies, edit-criterion, scenario-diff)
│  ├─ api/                      # endpoints Next.js
│  │  ├─ chat/                  # /api/chat — cœur IA
│  │  ├─ game-events/           # ingestion télémétrie
│  │  ├─ admin/                 # endpoints admin
│  │  └─ founder/               # founder mode
│  ├─ lib/                      # code pur (runtime, evaluation, capabilities, suggestions, etc.)
│  │  ├─ engine/                # API publique du moteur (barrel)
│  │  ├─ runtime.ts             # source de vérité fonctionnelle
│  │  ├─ evaluation/            # applyPhaseObservation, moteur qui décide
│  │  ├─ capabilities/          # V-chantier
│  │  ├─ suggestions/           # AS-chantier
│  │  ├─ competencies.ts        # Z-chantier
│  │  ├─ scenarioVersioning.ts  # VS-chantier
│  │  └─ gameEvents/            # Y-chantier (client, writer, reader, types)
│  └─ scenarios/[scenarioId]/play/
│     ├─ page.tsx               # LE monolithe (5500+ lignes)
│     ├─ contexts/PlayerContext.tsx
│     ├─ handlers/              # modules Mail/Contract/Interview + PhaseOrchestrator
│     ├─ components/            # UI (PresentationModeView, MailView, etc.)
│     └─ hooks/                 # useSendChatMessage, useSendMail, usePhaseTimer, useDeepSave, etc.
├─ scenarios/                   # scenarios actifs (10) + maintenance (13)
├─ schema/scenario.schema.json  # source de vérité JSON (F1)
├─ scripts/
│  ├─ deploy.sh                 # déploiement prod
│  ├─ validate-scenarios.mjs    # + lib/checkEvaluationCoverage.mjs
│  ├─ scaffold-scenario.mjs     # CLI création scenario
│  └─ templates/scenario/       # template pour scaffold
├─ data/
│  ├─ competencies.json         # référentiel Z
│  ├─ game_events/              # télémétrie JSONL Y
│  ├─ scenario_versions/        # archivage VS (structure prête, wire à faire)
│  └─ founder/                  # campagnes founder mode
├─ hooks/                       # anciens hooks racine (héritage)
└─ docs/
   └─ SEVERITY_GUIDE.md         # guide créateur W
```

---

## État actuel des chantiers

**En prod, testés et fiables** :
- Voice as capability (V) — micro fallback texte
- Évaluations explicables (E) — moteur applyPhaseObservation
- Sévérité pédagogique (W) — critical/required/bonus/minor
- Vue admin replay individuel (E5) + agrégé par scenario (X2)
- Télémétrie pédagogique (Y) + dashboard analytics (Y4)
- Référentiel compétences (Z) + CRUD admin
- Suggestions d'amélioration (AS)

**Livré mais pas exercé en prod** :
- `critical` (aucun scenario n'en utilise en vrai)
- `competencies` sur les critères (aucun tagué)
- `error_type` (aucun renseigné)
- Versioning archive (`archiveScenarioVersion` jamais appelé — code mort tant que non wire dans un flow)
- Vue diff scenarios (attend d'avoir 2 versions archivées)
- Migration W6 des 3 pilotes en severity : typage automatique par heuristique, à revoir manuellement

**En pending explicite (tracker)** :
- Issue #69 : bouncer peut sauter des phases si `chosen_kol_id` set (edge case S5)
- Issue #72 : campagne founder end-to-end complète à valider
- Issue #74 : vérif E2E founderAccess avec compte test

**Failles connues et non fixées** :
- Pas de test end-to-end de la boucle joueur → IA → moteur → replay → analytics
- `evaluation_history` reste côté client (perte possible si crash avant sauvegarde 10s)
- Le lien « éditer critère » depuis les suggestions AS suggère parfois de « passer en bonus » un critère déjà bonus (pas de contextualisation)
- Le prompt IA ne connaît pas severity/competencies/error_type
- Aucune page d'index `/admin` — 6 pages admin disséminées sans navigation d'entrée

---

## Points d'attention immédiats

**Avant tout nouveau chantier significatif** : lire `AUDIT_ARCHITECTURE_MECANIQUES.md`. La question ouverte est de savoir si on continue d'ajouter des features dans le modèle actuel (qui ne scale pas au-delà de ~20 scenarios) ou si on lance le refactor vers le modèle mécaniques (~15-20 sessions estimées).

**Convention de commit** : messages structurés en fr avec sections `chantier — description \n * bullet points \n Verified: tsc + validate + vitest`. Le history git montre le pattern.

**Aucune skill n'est utilisable dans une session Cowork qui n'a pas le plugin installé.** Si tu as besoin d'une skill (`schedule`, `docx`, etc.), vérifie dans les `<available_skills>` du prompt initial. Cowork ne les crée pas à la volée.

**Le PO valide chaque chantier majeur.** Le workflow est : proposition → débat → 4 debriefs de fin (V/E, W/X/Y, Z/CF/VS/AS + AUDIT_MECANIQUES). Ne pas lancer un chantier significatif sans validation explicite.

---

## Contacts et références

- **Utilisateur** : Matthieu (matthieu.gasc@drugoptimal.com), CEO de DrugOptimal, fondateur de Revealio
- **Prod** : https://revealio.live
- **Repo GitHub** : https://github.com/matthieugasc-alt/serious-job-game
- **Serveur prod** : root@204.168.217.145, `/var/www/serious-job-game`, PM2 app `serious-job-game`
- **Domaine cible produit** : formation initiale (écoles) + formation continue (entreprises) autour des simulations métier
