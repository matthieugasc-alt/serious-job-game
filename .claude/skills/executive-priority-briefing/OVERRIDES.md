# User overrides for skill `executive-priority-briefing`

Ce dossier contient les surcharges utilisateur du skill
`executive-priority-briefing` fourni par Anthropic via Cowork.

## Règle de précédence

Lorsque le skill `executive-priority-briefing` est invoqué, Claude DOIT :

1. Lire d'abord le SKILL.md du plugin Anthropic (à
   `/var/folders/.../claude-hostloop-plugins/.../skills/executive-priority-briefing/SKILL.md`).
2. Puis lire ce fichier OVERRIDES.md et tous les fichiers du dossier
   `references/` ci-contre.
3. En cas de conflit, **les fichiers de ce dossier override prévalent** sur
   les fichiers correspondants du skill original.

## Fichiers surchargés actuellement

| Fichier original (plugin Anthropic)          | Override (ici)                       | Raison                                                                    |
|----------------------------------------------|--------------------------------------|---------------------------------------------------------------------------|
| `references/team-delegation.md`              | `references/team-delegation.md`      | Ajout d'Olivier Véran comme partenaire opérationnel prospection hôpitaux  |

---

## 📨 Livrable matinal additionnel : brouillon stream clinique

**Règle ajoutée à l'étape 6 (Produce the decision briefing)** :

En plus du briefing exécutif standard, Claude DOIT chaque matin créer un
**brouillon d'email** dans Superhuman destiné à l'équipe clinique avec les
tâches CRM prioritaires du stream clinique.

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
