# diagnostic — quand l'utiliser

Quand le joueur doit trouver la CAUSE d'un problème par investigation : il interroge un témoin (acteur IA), confronte des hypothèses, élimine des pistes, puis rend un diagnostic structuré. Pas pour une extraction documentaire pure (→ `analyse`) ni un dialogue dont seul l'échange compte (→ `entretien`) : ici l'output est le diagnostic `{cause, evidence, eliminated}`.

**Params** : `situation` (requis, brief du problème, bandeau), `actor_id` (requis, témoin interrogé). Optionnels : `hypotheses` ([{id, label}] causes candidates — si fourni, la cause retenue est sélectionnée parmi elles, sinon champ libre), `document_ids` (filtre les documents visibles), `opening_message` (premier message du témoin), `min_exchanges` (défaut 2, débloque "Rendre mon diagnostic").

**Outputs** : `diagnosis` ({cause, evidence, eliminated} — cause = id d'hypothèse si `hypotheses` fourni, texte libre sinon), `dialogue` (transcript compact "Vous: … / <Nom>: …").

```json
{
  "step_id": "s1", "mechanic": "diagnostic",
  "params": {
    "situation": "Les ventes du produit X ont chuté de 40% en un mois.",
    "actor_id": "responsable_ventes",
    "hypotheses": [
      { "id": "prix", "label": "Hausse de prix mal absorbée" },
      { "id": "concurrent", "label": "Nouveau concurrent agressif" }
    ],
    "min_exchanges": 3
  },
  "evaluation": { "observed_criteria": [{ "id": "cause_etayee", "description": "Le joueur a étayé la cause retenue par des éléments obtenus du témoin" }] },
  "completion_rules": { "required_criteria": ["cause_etayee"] }
}
```
