# negociation — quand l'utiliser

Quand le joueur doit construire un accord à termes structurés avec un acteur IA (prix, délais, conditions) : dialogue libre, propositions formalisées ("Je propose : …"), puis conclusion explicite aux termes affichés ou rupture. La conclusion exige au moins une proposition préalable.

**Params** : `actor_id`, `instructions`, `terms` ([{id, label, type: "number"|"text", opening?}]). Optionnels : `directive` (cadrage de l'acteur), `opening_message` (premier message de l'acteur).

**Outputs** : `agreement` = `{concluded, terms: {id: valeur}}` (number coercé en nombre) ; `proposals_count`.

**Exemple de step** :
```json
{ "step_id": "s4", "mechanic": "negociation",
  "params": { "actor_id": "fournisseur", "instructions": "Obtenez un meilleur prix sans casser la relation.",
    "terms": [{ "id": "prix", "label": "Prix unitaire", "type": "number", "opening": 100 }],
    "opening_message": "Bonjour, voici notre offre standard." },
  "evaluation": { "observed_criteria": [{ "id": "accord_conclu", "description": "Un accord est conclu (agreement.concluded = true)." }] },
  "completion_rules": { "required_criteria": ["accord_conclu"] } }
```
