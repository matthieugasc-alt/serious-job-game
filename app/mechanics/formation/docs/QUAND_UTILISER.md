# formation — quand l'utiliser

Quand le joueur doit TRANSMETTRE un savoir à un acteur IA en position d'apprenant : il explique, l'acteur pose des questions de compréhension et reformule (directive universelle construite par la mécanique + `directive` scénario). À la clôture, le joueur coche les objectifs qu'il estime couverts. Pas pour extraire une information (→ `entretien`) ni exposer sans interaction (→ `presentation`) : ici la boucle est pédagogique et l'output structure la couverture des objectifs.

**Params** : `actor_id` (requis, l'apprenant), `topic` (requis, bandeau), `objectives` (requis, [{id, label}] — ce que l'apprenant doit maîtriser à la fin, affiché en checklist). Optionnels : `directive` (cadrage additionnel de l'apprenant), `opening_message` (premier message de l'apprenant), `min_exchanges` (défaut 3, débloque "Terminer la session").

**Outputs** : `dialogue` (transcript compact "Vous: … / <Nom>: …"), `objectives_covered` (array d'ids d'objectifs déclarés couverts par le joueur — l'IA observatrice peut confronter cette déclaration au transcript).

```json
{
  "step_id": "s3", "mechanic": "formation",
  "params": {
    "actor_id": "stagiaire",
    "topic": "Le processus de qualification d'un lead",
    "objectives": [
      { "id": "criteres", "label": "Connaître les 4 critères de qualification" },
      { "id": "signaux", "label": "Repérer les signaux d'achat dans un échange" }
    ],
    "min_exchanges": 4
  },
  "evaluation": { "observed_criteria": [{ "id": "pedagogie_active", "description": "Le joueur vérifie la compréhension au lieu de dérouler un monologue" }] },
  "completion_rules": { "required_criteria": ["pedagogie_active"] }
}
```
