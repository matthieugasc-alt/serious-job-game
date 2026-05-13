# Prioritization Policy v2 — email-centric, mes tâches uniquement

Cette override remplace `references/prioritization-policy.md` du skill
original. Email-centric, filtre mes-tâches-only, anti-noise renforcé.

## Objectif

Optimiser le levier du founder, pas la propreté de la inbox. Le briefing
doit répondre à : **"Quelles 3-5 actions personnelles de Matthieu vont
matériellement améliorer la trajectoire de DrugOptimal aujourd'hui ?"**

Tout le reste est bruit, contexte, ou tâche d'autre membre.

## Scoring (v2)

Utiliser ce barème, puis appliquer du jugement :

| Critère                                    | Range | Poids — pourquoi                                                |
|--------------------------------------------|-------|-----------------------------------------------------------------|
| Alignement objectif mensuel                | 0–5   | La boussole. Sans alignement, score plafonné à 8.              |
| Action founder-only                        | 0–5   | Contrat, signature, levée, décision stratégique — seul Matthieu peut. |
| Impact business                            | 0–5   | Revenue, déploiement, levée, positionnement stratégique         |
| Urgence avec deadline réelle               | 0–4   | Seulement si deadline non auto-imposée                          |
| Dépendance externe à débloquer             | 0–4   | Quelqu'un d'extérieur attend Matthieu                           |
| Risque évité                               | 0–4   | Légal, clinique, financier, réputationnel                       |
| Importance relationnelle                   | 0–3   | Tier 1/2 contrepartie                                           |
| Solidité de l'évidence                     | 0–2   | Donnée réelle vs hypothèse                                      |
| Pénalité bruit                             | 0 à −5| Semble urgent sans conséquence                                  |
| Pénalité délégable                         | 0 à −5| Quelqu'un peut le faire à 80% qualité (v2 : pénalité plus forte qu'en v1) |
| Pénalité "tâche pas de moi"                | 0 à −10| Si responsable ≠ Matthieu, l'item ne va PAS dans le briefing perso. |

### Score bands

- 18+ **critical** : candidat pour bloc calendrier aujourd'hui
- 13–17 **important** : programmer si capacité, ou réponse rapide/délégation
- 8–12 **monitor** : mentionner seulement si pertinent
- <8 : **ignorer**, archiver, ou déférer

## Filtre dur "mes tâches"

Avant toute priorisation, **éliminer** tout item où :

- responsable CRM ≠ Matthieu (sauf founder-only)
- email où Matthieu est uniquement en CC ou liste
- meeting où Matthieu est `optionalAttendee`
- Granola action item où owner ≠ Matthieu

**Exception** : un item dont le responsable n'est pas Matthieu reste
dans le briefing **uniquement si** :

1. Il est en `blocked` depuis >7 jours sur un deal stratégique (>20 K€
   ou OKR-tagged), ET
2. Le blocage requiert escalade de Matthieu (pas juste relance auto).

Sinon : direction "brouillon stream clinique" (pour Lugan/Hugo/Lou) ou
archivage. PAS de pollution du briefing personnel.

## Hiérarchie des contreparties

Inchangé vs v1 :

### Tier 1 — critique

Décideurs ministère / public (ARS, DGOS, HAS), investisseurs actifs,
board/advisors, exec hôpitaux (DG, pharmaciens chefs, DSI), gros clients,
gros prospects pipeline avancé, cofondateurs/équipe sur blocage.

### Tier 2 — important

Équipe interne, clients actifs, contacts déploiement, distributeurs,
gros partenaires, fournisseurs legal/compta/finance sur sujet live.

### Tier 3 — normal

Contacts réseau, fournisseurs non urgents, prospects faibles, threads
informationnels.

### Tier 4 — bruit

Newsletters, prospection generic, notifications mass, cold inbound,
alertes automatiques sans action.

## Email triage rules (v2)

Préférer le split Important Superhuman. Ne pas scanner Other sauf
demande explicite.

Pull un email dans la candidate review si au moins une condition vraie :

- email direct à Matthieu, pas seulement CC
- expéditeur Tier 1 ou Tier 2
- thread avec participation récente de Matthieu
- sujet implique : décision, deadline, blocker, investisseur, ministère,
  déploiement hôpital, contrat, facture, légal, sécurité, clinique,
  customer urgent
- demande explicite de réponse ET non-réponse bloque quelqu'un
- relatif à un meeting aujourd'hui ou demain

Exclure :

- newsletters, product updates
- cold outreach faible qualité
- notifications automatiques déjà captées ailleurs
- digests réseaux sociaux
- invitations presse/event generic

## Email action categories (v2)

Classifier chaque mail pertinent en une catégorie :

1. **Quick reply (<3 min)** — batch dans un seul Reply Block
2. **Important reply à préparer** — proposer un draft dans le briefing
3. **Décision founder** — bloc Decision dédié
4. **Délégation** — sortir du briefing, intégrer au brouillon stream
   clinique ou direct draft de délégation
5. **Wait/monitor** — pas d'action, mention seulement si dossier chaud
6. **Ignore/archive** — newsletters, bruit
7. **Escalade risque** — bloc Risk dédié

**Nouvelle catégorie v2** : "Carry-over engagement" — un email qui
honore un commitment Granola. Lier au commitment dans
`open_commitments.json` et marquer comme `resolved` une fois envoyé.

## CRM task integration (v2)

Voir `references/crm-integration.md` (v2) pour le détail. Résumé :

- **Mes tâches CRM** : `responsable contains "Matthieu"`. Surface si
  due/overdue.
- **Signaux pipeline** : changements de stade impactant les OKR. Surface
  toujours, sans demander d'action immédiate.
- **Tâches des autres** : JAMAIS dans le briefing perso. Toujours dans
  le brouillon stream clinique (Lugan/Hugo/Lou).

## Meeting criticality (v2 — réduction de zoom)

Toujours scorer, mais surface réduite. Classer comme :

- **critical** : préparer 15-30 min, attendance personnelle obligatoire
- **important** : attendance, prep < 5 min (lecture rapide)
- **optional** : déléguer, raccourcir, ou skip si journée chargée
- **noise** : décliner ou déplacer

Dans le briefing, seul le **critical du jour** mérite une section prep
dédiée. Les autres sont une ligne dans la section Agenda.

## Anti-noise rules (v2 — renforcé)

Flag comme bruit probable si :

- urgence sans conséquence si retardé
- coordination interne sans décision bloquante
- admin sans deadline légale/financière/customer
- tâche qu'un autre peut faire à 80% qualité (pénalité −5 en v2)
- réponse qui maintient juste la politesse sans momentum
- **NOUVEAU v2** : item où responsable n'est pas Matthieu et où il
  n'y a pas de blocage > 7 jours sur deal stratégique

## Output discipline

- Toujours expliquer **pourquoi** un item est haut. Si la raison ne
  tient pas en une phrase, l'item n'est pas assez précis.
- Toujours indiquer l'**owner = Matthieu** explicitement pour chaque
  priorité. Si l'owner est ambigu, demander.
- Pour chaque email priorisé, **toujours** proposer un draft court.
  Pas de "à toi de répondre" générique.

## Conditions pour challenger la priorité fournie

Si le founder demande explicitement de prioriser un item que ce policy
classe comme bruit, **challenger une fois** ("Tu es sûr ? Ça me paraît
faire perdre 2h pour 0€ de levier"), puis céder si confirmé. La
mémoire de la session retient pour la cohérence du jour.
