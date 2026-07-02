# feedback — quand l'utiliser

Quand le joueur doit délivrer un retour difficile à un acteur IA qui RÉAGIT (émotion, défense, contestation selon son prompt scénario) et en sortir avec des engagements. Pas pour extraire une information (→ `entretien`) ni subir un interrogatoire (→ `qa`) : ici l'enjeu est la conduite du message et la formalisation de la sortie (`commitments`).

**Params** : `actor_id` (requis, destinataire du feedback), `context_brief` (requis, la situation à débriefer, bandeau). Optionnels : `directive` (cadrage de la réaction de l'acteur), `min_rounds` (défaut 2 — nb de messages joueur avant clôture), `framework_hint` (affiché au joueur, ex "faits → impact → attente"), `opening_message` (premier message de l'acteur).

**Outputs** : `dialogue` (transcript compact "Vous: … / <Nom>: …"), `commitments` (texte des engagements convenus, saisi à la clôture).

```json
{
  "step_id": "s2", "mechanic": "feedback",
  "params": {
    "actor_id": "dev_junior",
    "context_brief": "Trois livraisons en retard ce mois-ci, sans alerte préalable.",
    "framework_hint": "faits → impact → attente",
    "min_rounds": 3,
    "directive": "Tu commences sur la défensive, puis tu t'ouvres si le joueur reste factuel."
  },
  "evaluation": { "observed_criteria": [{ "id": "faits_avances", "description": "Le joueur s'appuie sur des faits, pas des jugements" }] },
  "completion_rules": { "required_criteria": ["faits_avances"] }
}
```
