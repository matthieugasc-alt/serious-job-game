# Things3 Integration v2 — mount permanent, hard-fail si absent

Cette override remplace `references/things3-integration.md` du skill
original. v2 : mount permanent prérequis, hard-fail si absent, et
cross-référencement systématique avec `open_commitments.json`.

## Statut v2 : source de vérité dure

Things3 n'est plus optionnel. **Le skill DOIT pouvoir lire Things3 à
chaque run** sinon le briefing est marqué incomplet et un message dur
s'affiche.

## Mount permanent

Le dossier Things3 est monté de façon permanente via :

```
~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac
```

Une fois accordé, il reste accessible pour toutes les sessions
suivantes. Le path bash dans la session :

```
/sessions/<session-id>/mnt/JLMPQHK86H.com.culturedcode.ThingsMac/
```

### Vérification au début de chaque run

Au tout début du workflow morning triage, exécuter :

```bash
DB_PATH=$(find /sessions/*/mnt/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-*/Things\ Database.thingsdatabase -name "main.sqlite" 2>/dev/null | head -1)
if [ -z "$DB_PATH" ] || [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Things3 database non accessible. Mount cassé."
    exit 1
fi
```

Si la vérification échoue :

1. Tenter une fois `request_cowork_directory` avec le path Things3.
2. Si toujours indisponible, **arrêter le briefing** et produire un
   message d'erreur clair :

   ```
   ⚠ Briefing interrompu : Things3 non accessible.

   Le skill v2 requiert l'accès à Things3 comme source de vérité.
   Action : confirmer le mount de
   ~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac
   et relancer.
   ```

3. Ne PAS produire un briefing dégradé silencieusement. Le founder
   compte sur Things3 comme référence.

## Lecture des tâches

```bash
DB_PATH=$(find /sessions/*/mnt/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-*/Things\ Database.thingsdatabase -name "main.sqlite" 2>/dev/null | head -1)
python3 /sessions/*/mnt/.claude/skills/executive-priority-briefing/scripts/read_things3.py "$DB_PATH" --json > /tmp/things3.json
```

(Note : le script `read_things3.py` reste celui du plugin original — pas
besoin de l'override.)

### Statuts à interpréter

- **anytime_or_today** : actif, Inbox/Today/Anytime — priorité haute
- **scheduled** : avec date de démarrage — respecter
- **someday** : différé — surface uniquement si déclenché par contexte

### Projets pertinents pour le briefing

- **Important / Urgent** : tâches stratégiques actives
- **Autre** : tâches diverses
- **Maison** : perso, **exclure du briefing pro** sauf si le founder
  demande explicitement.

## Cross-référence systématique

À chaque run, croiser Things3 avec :

### 1. open_commitments.json (Granola carry-over)

Pour chaque commitment `open` dans `open_commitments.json` :

- Si `things3_uuid` non null : vérifier que la tâche existe encore
  dans Things3 et regarder son statut.
- Si tâche `completed` ou absente → marquer commitment `resolved`
  (via Things3).

### 2. Emails

Pour chaque tâche Things3 active dont le `title` ou les `notes`
mentionnent un nom de contrepartie (ex: "Relancer Albi", "Répondre à
Vivalto et à Johanna") :

- Lancer une query Superhuman ciblée pour voir si un thread récent
  avec cette contrepartie existe.
- Enrichir l'item dans le briefing avec l'état du thread (réponse
  obtenue ? sujet ouvert ?).

### 3. CRM

Pour chaque tâche Things3 mentionnant un nom d'établissement (ex:
"Relancer Albi" → CH Albi) :

- Cross-référencer avec `/api/establishments` pour récupérer le stade
  pipeline.
- Afficher : panier, dernier Comex, dateValidationDG, et nom du
  responsable côté équipe.

## Écriture — création de tâches

Pour ajouter une tâche à Things3 (typiquement un commitment Granola
fraîchement extrait), générer un `things:///add` URL :

```bash
python3 /sessions/*/mnt/.claude/skills/executive-priority-briefing/scripts/write_things3.py \
  --url-scheme \
  --create '{"title":"Relancer Stand Software","when":"today","notes":"Granola 11 mai — David Vincent en backup"}'
```

Output : un URL `things:///add?...` à présenter à Matthieu. Quand il
clique (ou exécute le script `.sh` produit), Things3 ouvre l'ajout
sur son Mac.

**Ne JAMAIS écrire directement dans SQLite** : risque de corruption.
Toujours passer par les URL schemes.

## Écriture — scheduling

Pour reprogrammer une tâche existante au lendemain (ex: un commitment
dont l'échéance glisse) :

```bash
python3 scripts/write_things3.py --url-scheme \
  --actions '[{"uuid":"ABC123","when":"tomorrow"}]'
```

## Garde-fous

- Le briefing **n'écrit jamais automatiquement** dans Things3 sans
  approbation explicite ("OK, programme" ou équivalent).
- Les `things:///` URLs générés sont **proposés** dans le briefing,
  pas exécutés en silence.
- La règle "Things3 = source de vérité" implique : si une tâche
  existe dans `open_commitments.json` mais pas dans Things3 et que
  c'est ancien (>3 jours), suggérer **soit** créer la tâche Things3,
  **soit** abandonner le commitment. Pas de divergence latente.

## Compatibilité avec le skill original

Tout le reste du fichier `things3-integration.md` original
(décodage Cocoa, statuts, etc.) reste valable. Cette override
n'ajoute que les règles v2 ci-dessus.
