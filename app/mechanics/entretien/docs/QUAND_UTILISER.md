# entretien — quand l'utiliser

Quand le joueur a l'initiative : il mène un dialogue chat avec un acteur IA pour atteindre un objectif (qualifier un besoin, obtenir une info, convaincre). Pas pour un interrogatoire subi (→ `qa`) ni un exposé (→ `presentation`).

**Params** : `actor_id` (requis), `objective` (requis, affiché en bandeau), `directive` (cadrage acteur, optionnel), `min_exchanges` (défaut 3, débloque "Terminer"), `opening_message` (premier message de l'acteur au boot, optionnel).

**Outputs** : `dialogue` (transcript compact "Vous: … / <Nom>: …"), `exchange_count` (nb de messages joueur).

```json
{
  "step_id": "s1", "mechanic": "entretien",
  "params": { "actor_id": "client_1", "objective": "Comprendre le besoin réel du client", "min_exchanges": 4, "opening_message": "Bonjour, vous vouliez me voir ?" },
  "evaluation": { "observed_criteria": [{ "id": "besoin_identifie", "description": "Le joueur a fait exprimer le besoin réel" }] },
  "completion_rules": { "required_criteria": ["besoin_identifie"] }
}
```
