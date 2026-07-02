# analyse — quand l'utiliser

Quand le joueur doit étudier des documents et en tirer des conclusions structurées (audit, qualification, synthèse). Pas de dialogue : lecture + restitution écrite champ par champ.

**Params** : `instructions` (string, bandeau), `findings_prompts` ([{id, label, placeholder?}] — un champ par conclusion attendue). Optionnel : `document_ids` (filtre les documents visibles).

**Outputs** : `findings` = `{ <prompt_id>: texte }` — consommable par `inputs_from`.

**Exemple de step** :
```json
{ "step_id": "s1", "mechanic": "analyse",
  "params": { "instructions": "Analysez le dossier et identifiez le risque majeur.",
    "findings_prompts": [{ "id": "risque", "label": "Risque principal" }],
    "document_ids": ["doc_dossier"] },
  "evaluation": { "observed_criteria": [{ "id": "risque_identifie", "description": "Le joueur identifie le risque X dans ses conclusions." }] },
  "completion_rules": { "required_criteria": ["risque_identifie"] } }
```
