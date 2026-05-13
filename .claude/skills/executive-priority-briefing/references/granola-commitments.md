# Granola Commitments — carry-over engagements

NOUVEAU fichier v2. Définit comment les engagements pris par Matthieu
en réunion (Granola) sont persistés, reportés d'un jour à l'autre, et
résolus.

## Problème résolu

Avant v2 : un engagement pris en réunion ("je relance Stand Software
demain matin") n'était pas tracé. Si Matthieu ne le faisait pas le
lendemain, l'engagement disparaissait du briefing du surlendemain et
était perdu.

v2 : chaque engagement Matthieu est **persisté** dans
`open_commitments.json` et **remis** dans le briefing chaque matin tant
qu'il n'est pas résolu.

## Stockage : `open_commitments.json`

Localisation : workspace persistant utilisateur.

```
/Users/gascmatthieu/serious-job-game/.briefing-state/open_commitments.json
```

(Path bash : `/sessions/*/mnt/serious-job-game/.briefing-state/open_commitments.json`.)

Le dossier `.briefing-state/` est créé automatiquement par
`scripts/commitments_store.py` à la première écriture.

## Schéma JSON

```json
{
  "version": 2,
  "updated_at": "2026-05-13T08:00:00+02:00",
  "commitments": [
    {
      "id": "cmt_2026-05-11_stand-software",
      "title": "Relancer Stand Software",
      "owner": "Matthieu",
      "created_at": "2026-05-11T09:30:00+02:00",
      "source": {
        "type": "granola",
        "meeting_id": "uuid-de-granola",
        "meeting_title": "Point DO Innov",
        "meeting_date": "2026-05-11"
      },
      "context": "Devait être fait le matin du 11 mai. David Vincent en backup.",
      "due_at": "2026-05-12",
      "things3_uuid": "ABC123…",
      "things3_url": "things:///add?title=Relancer%20Stand%20Software&when=today&notes=…",
      "status": "open",
      "resolved_at": null,
      "resolved_via": null,
      "age_days": 2
    }
  ]
}
```

Champs :

- `id` : slug auto = `cmt_YYYY-MM-DD_<short-title-slug>`
- `title` : phrase courte d'action
- `owner` : "Matthieu" (seul owner traité)
- `source.type` : `granola` | `email` | `manual`
- `things3_uuid` : si la tâche a été créée dans Things3, on retient
  l'UUID pour pouvoir vérifier son état au prochain run. Sinon `null`.
- `things3_url` : URL `things:///add` toute prête, peut être présentée
  à l'utilisateur pour création manuelle.
- `status` : `open` | `resolved` | `abandoned`
- `age_days` : recalculé à chaque run par le store, pas stocké.

## Workflow

### À chaque réunion Granola

1. Lire la réunion via `query_granola_meetings` ou
   `get_meeting_transcript`.
2. Extraire les "action items" où owner = Matthieu (ou implicite, ex:
   "je vais…", "il faut que je…").
3. Pour chaque item :
   - Générer un id : `cmt_<date>_<slug>`
   - Construire les champs `title`, `context`, `due_at`
   - Appeler `scripts/commitments_store.py add --json '{...}'`
   - Générer `things:///add` URL via `scripts/write_things3.py`
4. Présenter à Matthieu les commitments créés et leur URL Things3
   correspondante. Il peut cliquer pour les ajouter à Things3 lui-même.

### À chaque briefing matinal

1. Charger les commitments `open` via
   `python3 scripts/commitments_store.py list --status open`
2. Pour chaque commitment, **vérifier la résolution** :
   - **Cas Things3** : si `things3_uuid` non null, chercher dans le
     dump Things3 (`read_things3.py`) si la tâche est `completed` ou
     absente (archivée).
   - **Cas Email** : utiliser `query_email_and_calendar` avec une
     requête ciblée : "ai-je envoyé un email à propos de `<title>`
     depuis le `<created_at>` ?". Si oui → considérer résolu.
3. Marquer les résolus via `commitments_store.py resolve <id> --via
   <things3|email|user>`.
4. Lister les commitments restants `open`, ordonnés par âge (plus vieux
   en premier) dans la section "Engagements en cours" du briefing.

### Quand l'utilisateur dit "fait" sur un commitment

Appeler :

```bash
python3 scripts/commitments_store.py resolve cmt_<id> --via user
```

### Quand l'utilisateur dit "abandonne le commitment X"

```bash
python3 scripts/commitments_store.py abandon cmt_<id> --reason "<raison>"
```

## Flags d'âge dans le briefing

- `age_days <= 3` : normal, juste afficher l'âge.
- `age_days 4-7` : flag jaune ⚠ "Engagement vieillissant".
- `age_days 8-13` : flag rouge 🔴 "Engagement non avancé depuis >1 sem".
- `age_days >= 14` : proposer abandon explicite dans le briefing
  ("Engagement >2 semaines sans avancement — je suggère
  abandonné/délégué, confirme ?").

## Exemples de commitments générés depuis les Granola du 11 mai

Pour illustration, voici ce qui aurait été créé après les notes Granola
du 11 mai 2026 :

```json
[
  {
    "id": "cmt_2026-05-11_stand-software",
    "title": "Relancer Stand Software",
    "context": "Devait être fait le matin du 11 mai. David Vincent en backup.",
    "due_at": "2026-05-12",
    "source": {"type": "granola", "meeting_title": "Point DO Innov", "meeting_date": "2026-05-11"}
  },
  {
    "id": "cmt_2026-05-11_jenny-interop",
    "title": "Contacter Jenny (ancienne) sur services d'interopérabilité",
    "context": "Suite échange avec Anaïs Monlong (IRIS). Anaïs doit fournir intros Aupia/Canada/Allemagne en retour.",
    "due_at": "2026-05-15",
    "source": {"type": "granola", "meeting_title": "Matthieu x Anaïs (IRIS)", "meeting_date": "2026-05-11"}
  },
  {
    "id": "cmt_2026-05-11_paul-millon-sante-expo",
    "title": "Gérer situation Paul Millon — Santé Expo",
    "context": "Risque qu'il présente l'équipe aux DG à la place de Matthieu (NDA).",
    "due_at": "2026-05-22",
    "source": {"type": "granola", "meeting_title": "Réunion >1MARR 2 ans", "meeting_date": "2026-05-11"}
  },
  {
    "id": "cmt_2026-05-11_hugo-15-hopitaux",
    "title": "Point Hugo : re-trier les 15 hôpitaux en attente",
    "context": "Perpignan, Versailles, Draguignan, etc. Post-visio sans réponse.",
    "due_at": "2026-05-15",
    "source": {"type": "granola", "meeting_title": "Point DO Innov", "meeting_date": "2026-05-11"}
  },
  {
    "id": "cmt_2026-05-12_christophe-correction-adresse",
    "title": "Forward erreur adresse Bangkok à Clémence (avocate)",
    "context": "Document capital increase signé par Christophe avec adresse erronée. Filing 15 mai.",
    "due_at": "2026-05-13",
    "source": {"type": "granola", "meeting_title": "Docs valorisation → Christophe", "meeting_date": "2026-05-12"}
  }
]
```

## Garde-fous

- Ne PAS créer de commitment pour les engagements d'autres membres
  d'équipe (Lugan, Hugo, Lou, Thomas, Bruno, Romain) — ce serait
  contradictoire avec le principe 2 (mes tâches uniquement).
- Ne PAS créer de commitment pour des "engagements" auto-imposés
  par Claude (genre "je vais te remonter ça demain"). Seulement ce
  que Matthieu lui-même a dit faire/devoir faire.
- Vérifier les doublons avant `add` : si un commitment avec le même
  title (slug-normalisé) existe en `open`, mettre à jour son
  `context` et son `due_at` au lieu de créer un nouveau.
