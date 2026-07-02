# qa — quand l'utiliser

Quand l'acteur IA a l'initiative : il interroge le joueur, une question à la fois (jury, comité, due diligence, débriefing). Si le joueur mène le dialogue → `entretien` ; s'il expose sans interaction → `presentation`.

**Params** : `actor_id` (requis), `question_count` (requis, entier ≥ 1), `directive` (cadrage acteur concaténé à la directive universelle, optionnel), `context_hint` (bandeau affiché au joueur, optionnel).

**Outputs** : `dialogue` (transcript compact "Vous: … / <Nom>: …"), `answers_count` (nb de réponses joueur).

Flow : au boot l'acteur pose la question 1 (directive universelle "Pose maintenant la question n/total"), le joueur répond, l'acteur enchaîne ; après `question_count` réponses, "Terminer" → observation.

```json
{
  "step_id": "s2", "mechanic": "qa",
  "params": { "actor_id": "jury_1", "question_count": 3, "context_hint": "Le comité va vous poser 3 questions." },
  "evaluation": { "observed_criteria": [{ "id": "reponses_argumentees", "description": "Le joueur argumente chaque réponse avec des faits" }] },
  "completion_rules": { "required_criteria": ["reponses_argumentees"] }
}
```
