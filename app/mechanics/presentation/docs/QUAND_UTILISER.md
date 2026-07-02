# presentation — quand l'utiliser

Quand le joueur produit un exposé continu sous contrainte de temps (pitch, restitution, soutenance), sans interaction avec un acteur. S'il y a dialogue → `entretien` ou `qa`.

**Params** : `brief` (requis, consigne affichée), `preparation_s` (défaut 60, 0 = pas de préparation), `lang` (BCP-47 pour la dictée, défaut fr-FR). Le temps d'exposé vient de `time_limit_s` du step (défaut 180). `document_ids` restreint les documents montrés en préparation.

**Outputs** : `speech` (texte de l'exposé), `duration_s` (durée effective, bornée au chrono).

Voix : le pattern voiceCapture (micro natif → Whisper via /api/transcribe) est branché quand la capability est utilisable ; sinon fallback texte automatique avec message. La zone de texte reste toujours la source de vérité (le dicté s'y ajoute, éditable). Reprise après refresh via scratch (phase, chronos, brouillon).

```json
{
  "step_id": "s3", "mechanic": "presentation", "time_limit_s": 120,
  "params": { "brief": "Présentez vos conclusions en 2 minutes", "preparation_s": 45 },
  "evaluation": { "observed_criteria": [{ "id": "structure_claire", "description": "L'exposé est structuré (intro, arguments, conclusion)" }] },
  "completion_rules": { "required_criteria": ["structure_claire"] }
}
```
