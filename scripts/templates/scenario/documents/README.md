# Documents attachés au scenario

Place ici les PDFs / images que le joueur peut consulter pendant le scenario.

## Comment ajouter un document

1. Copie ton fichier ici (ex: `brief_client.pdf`).
2. Ajoute une entrée dans `scenario.json` sous `resources.documents` :

```json
{
  "doc_id": "brief_client",
  "label": "Brief client",
  "abstract": "Résumé en 1-2 phrases visible au survol.",
  "file_path": "documents/brief_client.pdf"
}
```

3. (Optionnel) Attache le doc à un mail via `entry_events[].attachments`.
