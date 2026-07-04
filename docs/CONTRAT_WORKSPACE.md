# Contrat Workspace / Tool / Mechanic — formalisation pré-jalon 1

**Date** : 3 juillet 2026
**Statut** : soumis à validation PO avant tout code (chantier « Workspace immersif »)
**Principe directeur validé** : Environnement de travail → Outils → Joueur. Les mécaniques deviennent des capacités internes du moteur ; elles observent, elles ne s'affichent plus. Le rédacteur du scénario décide des conditions de passage. Le moteur exécute. L'IA observe.

---

## 1. Où vit le Workspace (anti-monolithe)

```
app/workspace/
├─ WorkspaceShell.tsx        # ≤ 250 lignes. Layout uniquement : dock
│                            # d'apps, zone de fenêtres, toasts. AUCUNE
│                            # logique métier, AUCUN import de mécanique.
├─ apps/                     # UNE app = UN dossier autonome
│  ├─ messages/              # messagerie type Teams (fils par acteur/groupe)
│  ├─ mail/                  # boîte mail (inbox, envoi, PJ, brouillons)
│  ├─ documents/             # bibliothèque + lecteur (réutilise DocumentViewer)
│  ├─ notes/                 # bloc-notes simple (premier Tool, voir §3)
│  └─ registry.ts            # APP_REGISTRY — même pattern garde-fou que les mécaniques
└─ state/                    # RIEN ici : l'état vit dans le moteur (voir §2)
```

Le shell ne fait que : charger la session, afficher le dock et les fenêtres, monter les apps enregistrées, transmettre chaque action utilisateur au moteur via `dispatch`, afficher les notifications et événements narratifs reçus du moteur. Toute la logique (état, triggers, narration, observation) vit dans `app/lib/engine/`.

**Garde-fous automatiques (tests)** :
- `workspace.gardefou.test.ts` : les imports de `WorkspaceShell.tsx` sont sur liste blanche (apps/registry, engine types, primitives UI) ; échec si import métier ou si le fichier dépasse 250 lignes.
- `mechanics.headless.test.ts` : `app/mechanics/**` ne contient aucun `.tsx` et n'importe jamais `react`. Une mécanique qui redevient une UI casse la CI.
- Le schéma v3 refuse un step sans `completion.trigger` déclaré : l'implicite est structurellement impossible.

## 2. L'état et la journalisation : tout est action, tout est observable

L'état du poste de travail est DANS la session (sérialisable, deep-save inchangé) :

```ts
interface WorkspaceState {
  threads: Record<string, Thread>;      // messagerie : fils avec acteurs
  mailbox: { inbox: Mail[]; sent: Mail[]; drafts: Record<string, MailDraft> };
  documents: Record<string, { opened: boolean; annotations: Highlight[] }>;
  toolStates: Record<string, Json>;     // état de chaque Tool (notes, matrice…)
  notifications: Notification[];
  clock: { startedAt: number; timers: TimerState[] };
}
```

**Toute interaction du joueur est une `WorkspaceAction`** — union fermée, typée, horodatée, journalisée dans `session.actionLog` avant tout effet :
`message_sent`, `mail_sent`, `mail_opened`, `document_opened`, `document_annotated`, `note_edited`, `tool_state_changed`, `contract_signed`, `contract_rejected`, `deliverable_submitted`, `meeting_joined`, `manual_trigger`.

Le flux est unidirectionnel :

```
App (UI) ── dispatch(action) ──► Moteur
  1. journalise l'action (audit/replay)
  2. applique au WorkspaceState (reducer pur, testé)
  3. évalue les triggers du step actif (§4)
  4. exécute les effets narratifs déclarés (§5) → l'UI reçoit les événements
```

Le replay admin futur rejoue ce log — c'est le « git blame » de la partie, généralisé.

**Extension additive validée (fix toasts, 4 juillet 2026)** :
- `WsNotification.source_id?: string` — identifiant de la ressource source dans l'app (`thread_id` pour "messages", `mail_id` pour "mail"). Champ optionnel, purement additif : aucun consommateur existant n'est impacté.
- Le reducer résout le **nom d'affichage** de l'acteur (`actors[].name`, repli sur l'`actor_id`) au moment de créer une notification : plus jamais d'id technique ("alexandre_morel") dans un toast.
- Règles d'affichage des toasts (composant `app/workspace/Toasts.tsx`, extrait du shell) : jamais de toast pour l'app active ni pour un fil dont la mini-fenêtre ChatDock est ouverte (via `source_id`) ; disparition automatique après 3 s (croix conservée) ; pile haut-droite de 3 max, ne recouvre aucun élément interactif. La suppression est un **filtrage à l'affichage** (état local) — pas de `notification_read` synthétique : le journal ne contient que de vraies interactions joueur.

## 3. Le contrat `Tool`

Un Tool est une brique d'interface du poste de travail, **indépendante des mécaniques** :

```ts
interface Tool<S extends Json = Json> {
  id: string;                     // "notes", "surligneur", "matrice_decision", "contrat"
  title: string; icon: string;
  Component: FC<{ state: S; config: Json; dispatch: Dispatch }>;
  initialState(config: Json): S;
  /** Résumé lisible par l'observateur IA (jamais de logique d'évaluation ici). */
  describeForObservation(state: S): string;
}
```

Règles : un Tool ne connaît aucune mécanique et aucun scénario ; il s'ouvre comme une app/un panneau du workspace, jamais en plein écran à la place de l'environnement ; son état passe par `tool_state_changed` (donc journalisé, donc observable). Le contrat de négociation est un Tool (`contrat`) qui s'ouvre en panneau — pas un écran.

Les mécaniques **activent et configurent** les tools, elles ne les possèdent pas : `notes` sert à analyse, entretien, décision ; `mail` sert à production, négociation, coordination.

## 4. La mécanique headless et les triggers (le cœur)

### Mécanique = capacité du moteur, zéro UI

```ts
interface MechanicSpec<P, O> {
  manifest: { id; version; output_keys; required_params;
              default_tools: string[] };            // suggérés, le step peut ajuster
  directive(params: P): string;                     // cadrage des acteurs (universel)
  buildArtifacts(ws: WorkspaceState, step): JsonObject; // ce que l'observateur regarde
  buildOutput(ws: WorkspaceState, obs: StepObservation): O; // output pour inputs_from
  validateParams(params): string[];
}
```

### Le trigger appartient au rédacteur — format JSON (schéma v3)

```json
"completion": {
  "trigger": {
    "all": [
      { "type": "mail_sent", "to": "thomas_novadev" },
      { "type": "criterion_observed", "criterion": "scope_justifie" }
    ]
  },
  "on_trigger": "evaluate"
}
```

Primitives de trigger (union fermée, validée par le schéma — toute autre valeur = scénario invalide) :

| type | paramètres | sémantique |
|---|---|---|
| `mail_sent` | `to?`, `min_count?` | le joueur a envoyé un mail (au destinataire) |
| `message_sent` | `to_actor?`, `min_count?` | message envoyé dans un fil |
| `message_received` | `from_actor` | un acteur a écrit (utile après `actor_validation`) |
| `contract_signed` / `contract_rejected` | — | issue du Tool contrat |
| `deliverable_submitted` | `tool?` | remise explicite d'un livrable |
| `document_opened` | `document_id` | consultation d'une pièce |
| `timer_elapsed` | `seconds`, `from: step_start\|scenario_start` | temps écoulé |
| `criterion_observed` | `criterion` | l'observation IA (relancée après chaque action significative) rapporte ce critère |
| `actor_validation` | `actor` | l'acteur IA émet son marqueur de validation (structuré, jamais affiché) |
| `mail_scored` | `to?`, `min_score`, `scale?` | le dernier mail scoré du step atteint le seuil (§4quater) |
| `mail_scored_below` | `to?`, `min_score`, `scale?` | le dernier mail scoré est SOUS le seuil (même envoi, exit opposé) |
| `manual` | `label` | bouton explicite, affiché dans le workspace — si le rédacteur le veut |
| `all` / `any` | `[triggers]` | combinaisons |

Sémantique stricte : **rien d'autre ne fait avancer la séquence**. Pas de complétion implicite « la conversation semble finie ». Quand le trigger tire : `on_trigger: "evaluate"` (défaut) → `buildArtifacts` → observation IA → `applyStepObservation` → verdict moteur → advance/retry/end selon la politique du step (inchangée). Le retry est diégétique : l'échec déclenche un `event` narratif déclaré par le scénario (ex : Alexandre répond « il manque le budget, reprends ça ») — pas de modale.

### §4bis — Sorties multiples et routage (`exits`, chantier A — 4 juillet 2026)

`completion.trigger` est conservé tel quel : c'est le **sucre** pour une sortie unique `route: "next"` avec la politique `on_failure` existante — les scénarios existants restent valides sans modification. Un step peut à la place déclarer des sorties multiples (`trigger` et `exits` sont exclusifs) :

```json
"completion": {
  "exits": [
    {
      "id": "gagne",
      "trigger": { "type": "mail_scored", "to": "dsi", "min_score": 7 },
      "evaluate": true,
      "route": "next",
      "events": [ { "event_id": "ev_ok", "effect": { "type": "actor_reply", "thread_id": "th_dsi", "actor_id": "dsi", "directive": "Réponds enthousiaste : le mail t'a convaincu." } } ]
    },
    {
      "id": "perd",
      "trigger": { "type": "mail_scored_below", "to": "dsi", "min_score": 7 },
      "evaluate": false,
      "route": { "goto": "s1_prospection" },
      "reset": { "threads": ["th_dsi"], "tools": ["notes"] },
      "events": [ { "event_id": "ev_ko", "once": false, "effect": { "type": "mail_received", "from_actor": "dsi", "subject": "Re: votre sollicitation", "body": "Ce n'est pas une priorité pour nous." } } ]
    },
    { "id": "garde", "trigger": { "type": "mail_sent", "min_count": 10 }, "evaluate": false, "route": { "end": "echec_prospection" } }
  ],
  "max_gotos": 3,
  "on_goto_exhausted": { "end": "echec_prospection" }
}
```

Sémantique :
- **Le premier exit dont le trigger tire gagne** (ordre de déclaration). Chaque sortie tirée est journalisée dans `session.exitLog` (audit : `{at, step_id, exit_id, route}`).
- `evaluate` (défaut `true`) : observation IA + verdict moteur enregistré dans `stepResults` (endings `requires_passed`/`min_passed`, audit) **puis** la route déclarée s'applique — quel que soit le verdict. `evaluate: false` : route directe, synchrone, sans I/O. Avec des exits, `on_failure`/`on_retry`/`on_step_passed` ne jouent plus : la mise en scène appartient aux `events` de chaque sortie.
- `events` d'un exit : déclenchés quand CETTE sortie tire (`when` inutile ; `once` par défaut, clé `<step>:<exit>:<event>`).
- `route: "next"` — step suivant. `route: {"goto": "<step_id>"}` — retour au step cible : `reset` déclaratif (messages des fils listés vidés, tools listés réinitialisés à null), compteurs d'actions réarmés (pattern `attemptStartedIndex`), les events `step_start` du step cible **ne se rejouent pas** (sémantique `once`) sauf `once: false`. `route: {"end": "<ending_id>"}` — fin immédiate avec l'ending nommé (court-circuite `computeEnding`).
- **Garde-fou anti-boucle** : compteur de goto par step (`session.gotoCounts`), plafond `max_gotos` (défaut 3). Au-delà, la route de secours `on_goto_exhausted: {"end": …}` s'applique — sa déclaration est OBLIGATOIRE (validation) dès qu'un exit route en goto.

### §4ter — Acteurs dynamiques (`bind_actor`, chantier B)

Un trigger `mail_sent` / `message_sent` / `any` peut déclarer `bind_actor: "<alias>"` : quand il tire, le **destinataire réel** est lié à l'alias dans `session.actorBindings`. Sur un `any`, c'est le premier sous-trigger qui tire qui décide (`any[mail_sent{sofia}, mail_sent{marc}, mail_sent{karim}]` + `bind_actor` au niveau du any = le destinataire effectif est lié).

```json
{ "type": "any", "of": [ { "type": "mail_sent", "to": "sofia" }, { "type": "mail_sent", "to": "marc" } ], "bind_actor": "kol_choisi" }
```

Les steps suivants référencent l'alias partout où un actor_id est attendu : `threads.participants`, `params.actor_id` / `params.*_actor`, destinataires/acteurs des triggers (`to`, `to_actor`, `from_actor`, `actor`), acteurs des events (`actor_id`, `from_actor`). Résolution au runtime via les bindings ; les events de l'exit qui lie l'alias peuvent déjà l'utiliser (le binding précède leur exécution). Validation composerV3 : alias lié par un step ANTÉRIEUR (sinon refus), pas de collision avec un actor_id déclaré, placement restreint aux trois nœuds ci-dessus. Un alias non résolu au runtime = throw explicite (création de fil, event) ; dans un trigger, il ne matche simplement jamais (défensif).

### §4quater — Scoring IA à seuil (`mail_scored`, chantier C)

Mécanique « prospection » : le step déclare son cadre de notation, les exits déclarent les seuils.

```json
"scoring": { "brief": "Note la qualité du mail de prospection : accroche personnalisée, bénéfice clair pour le service, appel à l'action concret.", "scale": 10 }
```

Flux : le joueur envoie un mail → le moteur émet un effet `score_mail` → l'orchestrateur appelle la route générique **POST /api/v2/score** `{mail, scoring_brief, scale}` (gpt-4.1-mini, température 0, sortie JSON stricte `{score, rationale}`, score borné à `[0, scale]`) → `recordMailScore` journalise dans `session.mailScores` (audit) → les exits `mail_scored` / `mail_scored_below` sont évalués sur le **score enregistré** (le dernier de la tentative pour ce destinataire ; un goto/retry réarme la tentative). Le score n'est **JAMAIS** affiché au joueur : la réponse du monde (acteur enthousiaste, refus du DSI, silence du KOL) passe par les `events` des exits. Déterminisme : seuil déclaré dans le JSON, compteur `mail_sent{min_count}` combinable en exit de garde (ex : 10 mails envoyés → end).

### §4quinquies — Timer visible (chantier D)

Quand le step courant déclare un `timer_elapsed` (dans `completion.trigger` ou dans un exit), le WorkspacePlayer dérive l'échéance de `stepStartedAt` / `scenarioStartedAt` et la passe en prop (`timerDeadline`) au WorkspaceShell, qui affiche un chrono discret dans le bandeau (temps restant, rouge sous 30 s). Le shell reste bête (≤ 250 lignes) : l'expiration est déclenchée par le moteur via `clock_tick` (déjà le cas), jamais par l'UI.

## 5. Événement narratif ≠ trigger (séparation stricte)

- **`events`** (JSON, par step) : la mise en scène. Sorties du moteur vers le monde : un mail arrive, un message tombe, une notification sonne. Déclencheurs : `step_start`, `delay {seconds}`, `after_action {type}`, `on_retry`, `on_step_passed`. Un event ne fait JAMAIS avancer la séquence.
- **`completion.trigger`** : les conditions de passage. Entrées lues par le moteur sur le journal d'actions. C'est la SEULE chose qui avance.

Un mail reçu peut être les deux — mais parce que le rédacteur l'a écrit deux fois : une fois dans `events` (il arrive), une fois dans `trigger.message_received` (on attend que le joueur y réagisse). Aucune inférence.

## 6. Scénario pilote : founder_02_mvp (périmètre exact)

Choisi car c'est la journée de travail la plus complète : documents à lire, collègue IA, mail à envoyer, décision, négociation.

- **s1 analyse** : le data pack (3 documents) est dans l'app Documents ; Alexandre ouvre la journée dans Messages (event `step_start`) ; le joueur lit, prend des notes (Tool notes), et envoie ses conclusions à Alexandre par message. Trigger : `all[ message_sent{to: alexandre}, criterion_observed{pattern_identifie} ]`. Tools actifs : notes.
- **s2 decision** : le scope MVP se tranche dans la discussion avec Alexandre puis se formalise par mail de cadrage à Thomas (NovaDev). Trigger : `mail_sent{to: thomas_novadev}`. Tools : notes (+ matrice si prête, sinon jalon 2).
- **s3 negociation** : fil de discussion avec Thomas + Tool contrat en panneau (termes, propositions, signature). Trigger : `any[ contract_signed, contract_rejected ]`. Events : relances de Thomas sur `delay`.
- Endings et outcomes founder inchangés (mêmes ending ids).

**Jalon 1 livre** : moteur workspace (state, actions, reducer, triggers, events), schéma v3 + validateur, WorkspaceShell + apps Messages/Mail/Documents/Notes + notifications, Tools `notes` et `contrat`, mécaniques `analyse`/`decision`/`negociation`/`production` en headless, founder_02 jouable bout-en-bout dans l'environnement, harnais headless adapté (playthrough par dispatch d'actions), les 3 garde-fous du §1. Les 7 autres mécaniques et les 17 autres scénarios restent sur l'ancien player jusqu'au jalon 3 (cohabitation courte et assumée, pas une couche de compat : l'ancien player meurt au jalon 3).

## 7. Ce qui ne change pas

Séquence de steps, critères déclaratifs et severity, `applyStepObservation`, outputs/`inputs_from`, endings, outcomes founder, deep-save, registres et garde-fous existants, routes `/api/v2/actor` et `/api/v2/observe` (l'observateur reçoit en plus les artefacts workspace).
