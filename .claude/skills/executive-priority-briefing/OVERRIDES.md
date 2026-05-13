# User overrides for skill `executive-priority-briefing`

Ce dossier contient les surcharges utilisateur du skill
`executive-priority-briefing` fourni par Anthropic via Cowork.

## Règle de précédence (à lire en premier)

Lorsque le skill `executive-priority-briefing` est invoqué, Claude DOIT :

1. Lire d'abord le `SKILL.md` du plugin Anthropic (à
   `/var/folders/.../claude-hostloop-plugins/.../skills/executive-priority-briefing/SKILL.md`).
2. Puis lire ce fichier `OVERRIDES.md` **en entier**.
3. Puis lire les fichiers du dossier `references/` ici.
4. **En cas de conflit, ce dossier d'override prévaut** sur le skill original.

---

## Refonte v2 (13 mai 2026) — orientation email-first, mes tâches uniquement

Le skill original est trop centré sur les meetings et noie le founder
sous des items qu'il ne doit pas exécuter lui-même. La v2 corrige ça
selon **quatre principes durs** :

### Principe 1 — Email-first

Les emails sont le signal numéro un. Les meetings sont un cadre, pas
le contenu de la décision. Le briefing matinal commence par les emails,
pas par l'agenda.

Le briefing remonte **10-15 threads emails** avec contexte cross-thread
(qui attend quoi, deal/sujet derrière, draft de réponse suggéré).
Les meetings sont réduits à **une ligne par event** (heure + objet +
flag critical/important/optional), sans prep détaillée sauf pour le
critical du jour.

### Principe 2 — Mes tâches uniquement (CRM filtré)

Le founder ne veut PAS voir les tâches des autres. Le filtre CRM :

- **Tâches** : ne surfacer que celles où `responsable` contient
  `Matthieu`, ou `responsable2` contient `Matthieu`, ou la tâche est
  marquée founder-only (signature, contrat, levée).
- **Signaux pipeline** : surfacer aussi les **changements de stade**
  qui touchent la stratégie (Comex passé, valDG signée, signature
  obtenue, J0 imminent, blocage détecté sur deal >20 K€). Ces
  changements ne sont pas des tâches mais des points d'attention
  stratégique.
- **Reste masqué** : tâches des autres, tâches `done`, tâches sans
  date cible et sans blocage.

Voir `references/crm-integration.md` pour la logique de filtrage.

### Principe 3 — Things3 = source de vérité (mount permanent)

Things3 est monté de façon permanente via cowork directory à
`~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac`.

**Le skill DOIT lire Things3 à chaque run** avec :
```bash
DB_PATH=$(find /sessions/*/mnt/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-*/Things\ Database.thingsdatabase -name "main.sqlite" 2>/dev/null | head -1)
python3 /sessions/*/mnt/.claude/skills/executive-priority-briefing/scripts/read_things3.py "$DB_PATH" --json
```

Si Things3 n'est pas accessible : **hard fail explicite** au début du
briefing. Pas de briefing produit sans Things3. (Le mount a été
accordé une fois pour toutes ; s'il est cassé, c'est un signal qu'il
faut le redemander.)

### Principe 4 — Granola → Things3 + open_commitments.json (carry-over)

Les engagements que Matthieu prend en réunion (Granola) sont
**automatiquement convertis en tâches** :

1. À chaque réunion Granola où Matthieu apparaît comme owner d'une
   action, créer une entrée dans `open_commitments.json` (workspace
   persistant) ET générer un `things:///add` URL pour création dans
   Things3.
2. Au briefing du lendemain, **lire `open_commitments.json`** et
   cross-référencer avec Things3 (tâches `done` ?) et avec les emails
   envoyés (engagement honoré par email ?). Pour chaque commitment
   non résolu, le **remettre dans le briefing du jour** avec son âge
   (J+N depuis la réunion d'origine).
3. Un commitment est marqué `resolved` quand :
   - la tâche Things3 correspondante passe à `completed`, OU
   - un email correspondant au sujet est envoyé par Matthieu, OU
   - l'utilisateur dit explicitement "fait" dans la conversation.

Voir `references/granola-commitments.md` pour le schéma et la
mécanique. Le script `scripts/commitments_store.py` gère le fichier.

---

## Ordre de collecte des sources (révisé v2)

L'ordre v2, à respecter strictement :

1. **Things3** — source de vérité des engagements actifs (lecture
   complète, classification par projet).
2. **`open_commitments.json`** — engagements Granola en cours,
   ordonnés par âge.
3. **Email J/J-1/J-2** — `query_email_and_calendar` pour reconstruire
   le contexte des dossiers chauds (deals, signatures, hôpitaux
   décisionnaires). Top 10-15 threads, regroupés par compte/sujet.
4. **Email J-7 sans réponse** — relances strictes selon filtres
   `SKILL.md` original.
5. **Sent J-1** — pour identifier les victoires d'hier.
6. **Granola J-3** — pour mettre à jour `open_commitments.json` avec
   tout nouvel engagement, ET pour avoir le contexte des réunions
   récentes.
7. **CRM filtré** — *seulement* tâches Matthieu + signaux pipeline.
   Voir `references/crm-integration.md`.
8. **Calendrier J/J+1** — pour identifier les meetings critical et les
   conflits, mais traités en section minimale.

---

## Structure de sortie (révisée v2)

Voir `references/output-templates.md` (v2). Résumé de l'ordre :

1. Victoires d'hier (2-4 max, ou honnête "rien de saillant")
2. Focus du jour (une phrase)
3. **Urgences en cours** (fires >24h)
4. **Emails — décisions et réponses qui débloquent** (top 5-7 avec
   drafts suggérés courts)
5. **Engagements en cours (Granola → carry-over)** — items
   `open_commitments.json` non résolus, par âge
6. **Relances J-7** (mails sans réponse, filtrés)
7. **Mes tâches CRM + signaux pipeline** (mes tâches Matthieu
   uniquement + changements de stade)
8. **Agenda du jour** — une ligne par event, flag critical/important
9. Risques à ne pas rater
10. Blocs calendrier proposés (Réflexion stratégique obligatoire +
    1-3 blocs sérieux max)
11. Ignorer/déléguer
12. Approbation

Les meetings ont leur section, mais **après** les emails et les
engagements. La prep détaillée ne s'applique qu'aux meetings critical.

---

## 📨 Livrable matinal additionnel : brouillon stream clinique

**Règle ajoutée à l'étape 6 (Produce the decision briefing)** :

En plus du briefing exécutif standard, Claude DOIT chaque matin créer
un **brouillon d'email** dans Superhuman destiné à l'équipe clinique
avec les tâches CRM prioritaires du stream clinique.

### Destinataires

- À : `lugan.flacher@drugoptimal.com`, `hugo.riegel@drugoptimal.com`,
  `lou.fayan@drugoptimal.com`

### Sujet

`Stream clinique — priorités CRM du {jour de la semaine en français} {JJ/MM}`
Exemple : `Stream clinique — priorités CRM du lundi 11/05`

### Contenu

Extraire toutes les tâches du **stream clinique** depuis le CRM
(endpoint `GET /api/establishments`), parcourir `services[].clinique.taches`,
puis filtrer pour ne garder que les tâches "prioritaires" selon la règle :

- statut == `in_progress` OU
- statut == `blocked` OU
- présence d'un `blocage` non nul OU
- `dateCible` dans les 14 prochains jours (passée ou à venir)

Exclure les tâches `done`.

Note v2 : ce brouillon est l'unique endroit où les tâches d'autres
membres apparaissent — c'est volontaire, c'est le but du brouillon
(donner à Lugan/Hugo/Lou leur ToDo). Ne PAS remonter ces tâches dans
le briefing personnel de Matthieu.

### Format de l'email (HTML)

1. Salutation : "Bonjour Lugan, Hugo, Lou,"
2. Une phrase de contexte avec la date et le filtre appliqué
3. **Section 🔴 Tâches en retard** (date cible < aujourd'hui) — tableau HTML
   avec colonnes : Date cible (+ libellé retard), Établissement/Service,
   Tâche, Responsable, Statut
4. **Section 🟡 À traiter cette semaine** (date cible dans les 7 jours) —
   même format
5. **Section 📊 Synthèse priorités par responsable** — liste à puces
   indiquant le nombre de tâches prioritaires par personne
6. Note méthodologique en italique
7. Signature : "Bonne journée, Matthieu"

### Action technique

- Utiliser le MCP tool Superhuman `create_or_update_draft` avec :
  - `type: "new"`
  - `to: ["lugan.flacher@drugoptimal.com", "hugo.riegel@drugoptimal.com", "lou.fayan@drugoptimal.com"]`
  - `body: <le HTML construit>` (utiliser `body`, pas `instructions`,
    pour garder le formatage exact des tableaux)
  - Sujet construit selon le pattern ci-dessus

- **Ne PAS envoyer** — laisser en brouillon. L'utilisateur valide et
  envoie lui-même.

### Quand l'exécuter

Ce livrable s'exécute **en parallèle du briefing matinal**, à la fin de
l'étape 6 du workflow morning triage. Ne pas demander l'approbation de
l'utilisateur avant de créer le brouillon (création de brouillon ≠ envoi),
mais mentionner sa création dans la section livrables du briefing.

### Si le CRM est inaccessible

Mentionner dans le briefing que le brouillon n'a pas pu être généré et
indiquer l'erreur. Ne pas inventer de tâches.

---

## Fichiers d'override actifs

| Fichier original (plugin Anthropic)        | Override (ici)                          | Raison                                                                       |
|--------------------------------------------|-----------------------------------------|------------------------------------------------------------------------------|
| `references/team-delegation.md`            | `references/team-delegation.md`         | Ajout d'Olivier Véran comme partenaire opérationnel prospection hôpitaux     |
| `references/output-templates.md`           | `references/output-templates.md`        | v2 : email-first, drafts inline, engagements carry-over, meetings minimal    |
| `references/prioritization-policy.md`      | `references/prioritization-policy.md`   | v2 : scoring email-centric, filtre mes-tâches-only, anti-noise renforcé      |
| `references/crm-integration.md`            | `references/crm-integration.md`         | v2 : filtre `responsable contains "Matthieu"` + signaux pipeline             |
| `references/things3-integration.md`        | `references/things3-integration.md`     | v2 : mount permanent prérequis, hard-fail si absent                          |
| —                                          | `references/granola-commitments.md`     | NOUVEAU : carry-over Granola → Things3 + `open_commitments.json`             |
| —                                          | `scripts/commitments_store.py`          | NOUVEAU : CLI pour add/list/resolve commitments                              |

---

## Comment ajouter une nouvelle surcharge

- Pour surcharger un fichier `references/X.md` du skill original : créer
  `references/X.md` ici avec le contenu complet du fichier modifié.
- Pour ajouter une règle au comportement matinal : éditer la section
  "📨 Livrable matinal additionnel" ci-dessus, ou en créer une nouvelle.

## Pourquoi ce mécanisme

Les fichiers du plugin Cowork sont dans un cache temporaire
(`/var/folders/...`) qui peut être régénéré lors d'une mise à jour. Mettre
les surcharges ici (workspace utilisateur, persistant) garantit qu'elles
survivent aux mises à jour du plugin et restent visibles dans Git.
