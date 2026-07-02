# decision — quand l'utiliser

Quand le joueur doit trancher explicitement entre des options déclarées par le scénario (go/no-go, choix de fournisseur, priorisation), avec justification. Convention : un critère `choice_<option_id>` est observé DÉTERMINISTIQUEMENT (true ssi l'option est choisie) ; les autres critères (qualité de la justification…) passent par l'IA.

**Params** : `instructions`, `options` ([{id, label, description}], ≥ 2). Optionnels : `max_choices` (défaut 1), `require_justification` (défaut true), `min_justification_chars` (défaut 50).

**Outputs** : `choice` (premier id choisi), `choices` (tous), `justification`.

**Exemple de step** :
```json
{ "step_id": "s3", "mechanic": "decision",
  "params": { "instructions": "Choisissez l'option à défendre.",
    "options": [{ "id": "go", "label": "Lancer", "description": "On lance." },
                { "id": "nogo", "label": "Reporter", "description": "On attend." }] },
  "evaluation": { "observed_criteria": [
    { "id": "choice_go", "description": "L'option go est choisie." },
    { "id": "justif_risques", "description": "La justification mentionne les risques." }] },
  "completion_rules": { "required_criteria": ["choice_go", "justif_risques"] } }
```
