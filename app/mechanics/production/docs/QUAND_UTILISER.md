# production — quand l'utiliser

Quand le joueur doit rédiger un livrable écrit adressé : un mail à un acteur ou un document rendu (note, synthèse, plan). Pas de dialogue : rédaction seule, brouillon persisté.

**Params** : `deliverable_type` ("mail" | "document"), `instructions`. Optionnels : `recipient_actor` (mail — acteur destinataire, champ À figé), `subject_hint` (placeholder de l'objet), `template` (pré-remplissage du corps), `document_ids`.

**Outputs** : `deliverable` = `{type, to?, subject?, title?, body}` ; `body` = corps seul.

**Exemple de step** :
```json
{ "step_id": "s2", "mechanic": "production",
  "params": { "deliverable_type": "mail", "instructions": "Répondez au client en tenant compte de votre analyse.",
    "recipient_actor": "client", "subject_hint": "Re: votre demande" },
  "inputs": { "analyse": "s1.findings" },
  "evaluation": { "observed_criteria": [{ "id": "ton_pro", "description": "Le mail adopte un ton professionnel et répond à la demande." }] },
  "completion_rules": { "required_criteria": ["ton_pro"] } }
```
