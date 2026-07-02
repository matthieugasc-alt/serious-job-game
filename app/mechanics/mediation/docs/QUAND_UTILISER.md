# mediation — quand l'utiliser

Quand le joueur doit RÉGULER un conflit entre DEUX acteurs IA (première mécanique multi-acteurs) : chat à trois voix, sélecteur de destinataire (Partie A / Partie B / Les deux), chaque partie adressée répond séquentiellement (directive universelle construite par la mécanique + `directive` scénario). Pas pour un face-à-face (→ `entretien`, `negociation`, `feedback`) : ici la dynamique est triangulaire et l'output est la résolution `{reached, terms}`.

**Params** : `party_a_actor` et `party_b_actor` (requis, distincts — les clés `*_actor` sont validées par le composer contre les acteurs déclarés), `conflict_brief` (requis, bandeau). Optionnels : `directive` (cadrage additionnel des parties), `opening_message_a` / `opening_message_b` (premiers messages des parties au boot), `min_exchanges` (défaut 3, débloque "Conclure la médiation").

**Outputs** : `dialogue` (transcript compact à trois voix "Vous: … / <Nom>: …" — les messages joueur portent leur adressage "(À <Nom>) …"), `resolution` ({reached: boolean, terms: string}).

```json
{
  "step_id": "s4", "mechanic": "mediation",
  "params": {
    "party_a_actor": "lead_dev",
    "party_b_actor": "designer",
    "conflict_brief": "Le lead dev et la designer se bloquent mutuellement sur la priorité du sprint.",
    "opening_message_a": "On ne peut pas tout refaire à chaque maquette.",
    "opening_message_b": "Et moi je ne peux pas livrer une interface bâclée.",
    "min_exchanges": 4
  },
  "evaluation": { "observed_criteria": [{ "id": "ecoute_equitable", "description": "Le joueur a fait s'exprimer les deux parties avant de proposer une issue" }] },
  "completion_rules": { "required_criteria": ["ecoute_equitable"] }
}
```
