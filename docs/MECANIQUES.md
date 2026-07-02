# Mécaniques Revealio — liste définitive et arbitrages

**Date** : 2 juillet 2026
**Statut** : arbitrage acté (chantier « Refonte moteur mécaniques », jalon 2)
**Règle de décision** : une mécanique n'existe que si (a) une expérience joueur du contenu réel (vitrine + 6 founder + scénarios classiques audités) l'exige, ET (b) sa dynamique d'interaction est irréductible à une mécanique existante paramétrée. Tout le reste est du contenu (params JSON) ou une composition de steps.

---

## Matière première

Inventaire des expériences joueur extraites de founder_00→05, due_diligence_sous_tension, closing_sous_pression :

| Expérience | Occurrences |
|---|---|
| Dialoguer avec un acteur IA (interviewer, briefer, gérer une objection, confronter, valider) | S0×4, S2, S5, DD×3, closing×2 |
| Étudier des documents et en extraire des conclusions (pacte, data pack, rapport 24p, contrat piégé) | S0, S2, S3, S4, DD |
| Produire un livrable écrit (mail, one-pager, cold email, roadmap, recommandation, récap) | S0, S1, S3, S4, S5×2, DD |
| Négocier un accord à termes structurés (prix, clauses, intéressement, discount) | S0, S2, S3, S4, S5, closing |
| Arbitrer entre des options déclarées (candidat, établissement, scope, KOL, go/no-go) | S0, S2, S3, S5, DD |
| Pitcher à l'oral sous contrainte de temps | S1 |
| Répondre aux questions d'un tiers qui a l'initiative (jury, DSI) | S1, S5 |

## Les 7 mécaniques conservées

| id | Expérience | Pourquoi irréductible |
|---|---|---|
| `entretien` | Le joueur mène un dialogue avec un acteur IA vers un objectif déclaré | Le joueur a l'initiative ; l'observation porte sur la conduite de l'échange |
| `qa` | Un acteur IA interroge, le joueur répond | Initiative inversée par rapport à `entretien` : c'est l'acteur qui pilote le flux — la boucle de jeu est structurellement différente |
| `analyse` | Étude de documents → conclusions structurées | Pas de dialogue : la matière est documentaire, l'output est un ensemble de findings |
| `production` | Rédaction d'un livrable écrit adressé | L'artefact EST l'objet évalué ; dynamique d'édition, pas d'échange |
| `negociation` | Construction d'un accord à termes structurés | Le dialogue est adossé à un état d'accord (termes, concessions) que le moteur doit suivre ; l'output `agreement` est irremplaçable |
| `decision` | Arbitrage explicite entre options, avec justification | Le moteur doit connaître les options et le choix — un chat libre ne produit pas d'output exploitable par `inputs_from` |
| `presentation` | Exposé oral (voice, fallback texte) sous contrainte de temps | Capability micro + timer + transcript : boucle de jeu spécifique |

## Fusionnées ou écartées (et pourquoi)

- **Qualification** (liste audit) → fusionnée dans `entretien` (params `objective: discovery` + critères de découverte) suivie si besoin de `decision`/`production`. La dynamique — poser les bonnes questions pour extraire des signaux — est exactement celle d'`entretien` ; seuls les critères observés changent, et les critères sont du contenu.
- **Diagnostic** (liste audit) → fusionnée dans `analyse` (+`entretien` si l'investigation est conversationnelle). Les outils spécifiques (arbre des causes) seront des `Tool` le jour où un scénario les exige.
- **Gestion de crise** (liste audit) → composition : steps `entretien`/`production` avec `time_limit_s` serré. La « crise » est une propriété du contenu et du rythme, pas une boucle de jeu distincte. DD phase 4 se modélise ainsi sans perte.
- **Priorisation** → params de `decision` (options + contrainte de rareté). Conforme à l'audit.
- **Facilitation / Coordination** → compositions de steps, conformément à l'audit. Aucun contenu actuel ne les exige.
- **Feedback / Formation / Modération** (suggestions audit) → aucune occurrence dans le contenu réel. YAGNI : le registry rend l'ajout d'une mécanique trivial le jour où un scénario les demande. On ne construit pas de mécanique sans scénario consommateur.
- **Analyse/Synthèse** (audit) → la moitié « synthèse » est couverte par `production` (le one-pager S1 est un livrable produit depuis `inputs_from: analyse.findings`). `analyse` ne garde que l'extraction.

## Couverture du contenu cible

- **founder_00** : entretien×3 → decision → production (proposition) → analyse (pacte) → negociation (pacte) → qa (confrontation twist, l'acteur attaque)
- **founder_01** : production (one-pager) → presentation (pitch 40s) → qa (jury)
- **founder_02** : analyse (interviews) → decision (scope) → negociation (prix) 
- **founder_03** : decision (établissement) → production (prospection) → analyse (contrat) → negociation (clauses)
- **founder_04** : analyse (rapport 24p) → production (roadmap) → negociation (intéressement)
- **founder_05** : decision (KOL) → production (cold email) → qa (objections DSI) → entretien (co-construction plan) → negociation (contrat) → production (récap)
- **Vitrine** : entretien (découverte) → analyse → production → negociation → presentation → qa

Chaque mécanique est consommée par au moins 3 scénarios : le modèle scale sublinéairement, comme visé.

## Invariants (garde-fous)

1. Aucun contenu scénario dans `app/mechanics/` — tout nom d'acteur, produit, clause, seuil métier vit dans `scenario.json:params`.
2. L'IA observe, le moteur décide : une mécanique produit une `StepObservation`, seul `applyStepObservation` rend un verdict.
3. Tout output de mécanique est JSON-sérialisable et déclaré dans `manifest.output_keys` (contrat `inputs_from`).
4. Toute nouvelle mécanique = dossier + manifest + entry dans `MECHANIC_MANIFESTS`, `MECHANIC_MODULES`, `schema/mechanics.json` — le test `registry.gardefou` échoue sinon.
