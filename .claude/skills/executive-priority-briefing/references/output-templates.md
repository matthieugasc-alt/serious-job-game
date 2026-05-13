# Output Templates v2 — email-first

Cette override remplace `references/output-templates.md` du skill
original. Email-first, drafts inline, engagements carry-over, meetings
minimal.

## Morning briefing — v2 layout

```
Briefing du {jour} {date}

Victoires d'hier
- [win 1] — [pourquoi ça compte stratégiquement]
- [win 2] — ...
(2 à 4 max. Si rien de tangible : "Pas de victoire saillante hier — on enchaîne.")

Focus du jour
[une phrase, max 25 mots]

Urgences en cours
1. [crise] — [évolution depuis hier : avance/bloque/escalade] — [prochaine action] — [owner = toi]
(uniquement les fires déjà allumés >24h. Distinct des risques latents.)

═══════════════════════════════════════════════════════════════
EMAILS — décisions et réponses qui débloquent (cœur du briefing)
═══════════════════════════════════════════════════════════════

Pour chaque thread (5-7 max) :

▸ [Contrepartie / Sujet]
  Contexte : [1-2 lignes — pourquoi ce dossier, où on en est globalement]
  Ce qu'ils attendent : [décision / signature / réponse / info / coordination]
  Ce que je dois faire : [action concrète, owner = moi]
  Draft suggéré (90 sec) :
  ┌─────────────────────────────────────────
  │ [3-6 lignes de réponse prête à envoyer]
  └─────────────────────────────────────────
  Source : [emails:ID] ou [thread URL]

Engagements en cours (Granola → carry-over)
1. [J+N depuis {réunion}] [engagement] — [next action] — [état Things3]
2. ...
(items lus depuis open_commitments.json, ordonnés par âge. Si vide :
"Pas d'engagement Granola ouvert.")

Relances J-7 (mails envoyés il y a 7 jours sans réponse)
1. [destinataire] — [sujet] — [importance] — [action recommandée]
(filtres SKILL.md original : zéro faux positif.)

Mes tâches CRM + signaux pipeline
Tâches Matthieu en retard ou dues :
- [établissement/service] : [tâche] — [date cible] — [statut]
Signaux pipeline (changements de stade impactant) :
- [établissement] : [signal — ex: Comex prévu, signature attendue, J0 imminent, deal >20K€ bloqué]
(tâches des autres masquées sauf si blocage critique sur deal stratégique.)

Agenda du jour (synthèse minimaliste)
- HH:MM-HH:MM [event] [critical/important/optional] [conflit ?]
(pas de prep détaillée sauf pour le critical : voir section dédiée.)

Préparation meeting critical (si applicable)
[Si un meeting critical aujourd'hui :]
▸ [Meeting] à HH:MM
  À lire avant : [emails / Granola / docs]
  Sortie attendue : [décision / livrable]
  Position recommandée : [1-2 phrases sur l'angle à tenir]

Risques à ne pas rater
1. [risque latent] — [conséquence] — [action]

Blocs calendrier proposés
- 30 min Réflexion stratégique — [slot proposé] — protégé, sans livrable imposé
- [durée] [titre du bloc] — [raison]
(Le bloc Réflexion stratégique est obligatoire chaque jour et ne compte pas
dans le quota de 1-3 blocs sérieux. Voir calendar-policy.md pour le placement.
v2 : max 3 blocs sérieux, pas 5 — le founder n'en veut pas plus.)

Ignorer / déléguer
- [item] — [raison + à qui]

Livrables additionnels créés
- Brouillon Superhuman "Stream clinique — priorités CRM du {jour}" : créé / erreur

Approbation
Réponds "OK, programme" et je transforme les blocs en événements calendrier,
crée les Things3 manquants pour les engagements Granola, et marque les
commitments résolus dans open_commitments.json.

Tu peux aussi dire :
- "mets 90 min sur la priorité 1"
- "retire la priorité 3"
- "envoie le draft à [contrepartie]" (je crée le brouillon dans Superhuman)
- "fait" sur un engagement Granola (je le marque résolu)
- "urgence, reprogramme"
- "délègue la 4 à Hugo"
```

## Règles de discipline pour la section EMAILS

- **5 à 7 threads max**. Pas 15. Choisir les threads où une réponse de
  Matthieu débloque quelque chose ou évite une perte.
- **Toujours un draft court** (3-6 lignes). Pas de placeholder, pas de
  "à adapter selon ton ton". Si le contexte manque, dire pourquoi
  plutôt que d'inventer.
- **Regroupement par sujet** quand plusieurs threads concernent le
  même dossier (ex: tous les threads Caen ensemble).
- **Si Matthieu peut déléguer la réponse** → la sortir de cette
  section et la mettre dans "Ignorer/déléguer".

## Règles pour la section ENGAGEMENTS (carry-over)

- Lire `open_commitments.json` et ne lister que les `status:
  open` ordonnés par date de réunion d'origine (ancien → récent).
- Pour chaque commitment, **vérifier** s'il a une tâche Things3
  correspondante. Si oui, afficher l'état Things3.
- Si l'âge > 5 jours sans avancement : flag rouge dans le briefing
  ("Engagement vieillissant — décider de faire/déléguer/abandonner").
- Si l'âge > 14 jours sans avancement : proposer l'abandon explicite
  ("Engagement >2 semaines sans avancement — je suggère de l'archiver,
  confirme ?").

## Règles pour la section CRM

- **Filtre strict** : `responsable contains "Matthieu"` OR
  `responsable2 contains "Matthieu"`. Voir crm-integration.md (v2).
- Les signaux pipeline (Comex, valDG, signature, J0) apparaissent SEULEMENT
  si un changement est imminent (<7 jours) ou si un blocage touche un
  deal >20 K€.
- **JAMAIS** lister les tâches in_progress de Lugan/Hugo/Lou/Thomas dans
  cette section. Elles vont uniquement dans le brouillon stream clinique.

## Règles pour la section AGENDA

- Une ligne par event, format `HH:MM-HH:MM [event] [flag]`.
- Pas de description. Pas d'attendees listés.
- Flag critical = prep obligatoire dans la section dédiée. Flag
  important = mention seulement. Optional = peut sauter.
- **Conflits horaires** signalés explicitement avec ⚠.

## Approval handling (v2)

Mêmes commandes que v1, plus :

- "envoie le draft à X" → créer brouillon Superhuman via
  `create_or_update_draft` avec le draft de la section emails.
- "fait" + nom du commitment → marquer `resolved` dans
  `open_commitments.json` via `scripts/commitments_store.py resolve`.
- "abandonne le commitment X" → marquer `abandoned`.

## Calendar write implementation (v2)

Inchangé : `create_event` après approbation, voir calendar-policy.md du
skill original. La seule différence : max **3 blocs sérieux** au lieu
de 5, plus le bloc Réflexion stratégique obligatoire.

## Tone (v2)

Direct, concis, décision-orienté. Challenge les fausses priorités. Ne
pas flatter, ne pas sur-expliquer. Français par défaut. **Brutalement
sélectif** : si un thread n'a pas besoin d'une réponse de Matthieu
aujourd'hui, il ne va PAS dans la section emails — il va dans "Ignorer/
déléguer" ou il est tout simplement omis.
