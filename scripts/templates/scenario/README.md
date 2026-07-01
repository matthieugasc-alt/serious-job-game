# Scenario `{{SCENARIO_ID}}` — {{SCENARIO_TITLE}}

Ce scenario a été généré par `npm run scaffold:scenario`.
Il est fonctionnel dès maintenant mais **volontairement minimal**.

## Prochaines étapes

### 1. Éditer `scenario.json`

Le schéma JSON (`schema/scenario.schema.json`) est référencé en tête du fichier — l'autocomplete IDE guide chaque champ. Priorités :

- `meta.description` — la vraie promesse du scenario
- `narrative.*` — pose l'univers narratif
- `phases` — c'est là que la logique métier vit. Le template contient 2 phases exemple (chat + mail). Ajoute/retire/modifie selon ta mécanique.
- `scoring.criteria` par phase — définit ce que l'IA évalue

### 2. Écrire les prompts d'acteurs IA

Chaque `actor` avec `controlled_by: "ai"` doit avoir un fichier prompt dans `prompts/`.
Le template inclut `prompts/npc_example.md` avec la structure recommandée :
identité, objectif, style, connaissances, comportements par style joueur.

### 3. (Optionnel) Ajouter des documents

Voir `documents/README.md`.

### 4. Valider

```bash
npm run validate:scenarios -- --scenario={{SCENARIO_ID}}
npm run test
```

### 5. Jouer localement

```bash
npm run dev
# Puis ouvre http://localhost:3000/scenarios/{{SCENARIO_ID}}/play
```

## Concepts clés

- **completion_rules** : condition qui fait avancer la phase (`any_flags`, `all_flags`, `min_score`, `max_exchanges`, `required_player_evidence`, `required_npc_evidence`). Toutes évaluées par `isCurrentPhaseValidatedByRules` dans `app/lib/runtime.ts` — source de vérité unique.
- **mail_config.on_send_flags** : flags mis à `true` quand un mail est envoyé. Combinés à `completion_rules.any_flags` pour le pattern "soumettre le formulaire pour avancer".
- **entry_events** : messages / mails injectés à l'entrée dans la phase. Idempotents par phase_id::event_id.
- **modules** (chantier F4 à venir) : mécaniques déclaratives réutilisables (`mail`, `contract`, `interview`, `debrief`).

## Documentation générale

Voir `app/scenarios/[scenarioId]/play/ARCHITECTURE.md` pour comprendre comment le player rend un scenario.
