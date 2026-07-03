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
| `manual` | `label` | bouton explicite, affiché dans le workspace — si le rédacteur le veut |
| `all` / `any` | `[triggers]` | combinaisons |

Sémantique stricte : **rien d'autre ne fait avancer la séquence**. Pas de complétion implicite « la conversation semble finie ». Quand le trigger tire : `on_trigger: "evaluate"` (défaut) → `buildArtifacts` → observation IA → `applyStepObservation` → verdict moteur → advance/retry/end selon la politique du step (inchangée). Le retry est diégétique : l'échec déclenche un `event` narratif déclaré par le scénario (ex : Alexandre répond « il manque le budget, reprends ça ») — pas de modale.

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
