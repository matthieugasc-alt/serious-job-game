# Mécaniques Revealio — liste définitive et arbitrages

**Date** : 2 juillet 2026 (révisé le même jour — décision PO « mécaniques anticipées », voir section dédiée)
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

## Les 11 mécaniques (7 fondatrices + 4 anticipées)

| id | Expérience | Pourquoi irréductible |
|---|---|---|
| `entretien` | Le joueur mène un dialogue avec un acteur IA vers un objectif déclaré | Le joueur a l'initiative ; l'observation porte sur la conduite de l'échange |
| `qa` | Un acteur IA interroge, le joueur répond | Initiative inversée par rapport à `entretien` : c'est l'acteur qui pilote le flux — la boucle de jeu est structurellement différente |
| `analyse` | Étude de documents → conclusions structurées | Pas de dialogue : la matière est documentaire, l'output est un ensemble de findings |
| `production` | Rédaction d'un livrable écrit adressé | L'artefact EST l'objet évalué ; dynamique d'édition, pas d'échange |
| `negociation` | Construction d'un accord à termes structurés | Le dialogue est adossé à un état d'accord (termes, concessions) que le moteur doit suivre ; l'output `agreement` est irremplaçable |
| `decision` | Arbitrage explicite entre options, avec justification | Le moteur doit connaître les options et le choix — un chat libre ne produit pas d'output exploitable par `inputs_from` |
| `presentation` | Exposé oral (voice, fallback texte) sous contrainte de temps | Capability micro + timer + transcript : boucle de jeu spécifique |
| `diagnostic` *(anticipée)* | Investigation de la cause d'un problème auprès d'un témoin, diagnostic structuré | Boucle hypothèses → investigation → élimination ; l'output `diagnosis` {cause, evidence, eliminated} n'existe dans aucune autre mécanique |
| `feedback` *(anticipée)* | Retour structuré à un acteur qui réagit, clos par des engagements | La réaction (émotion/défense) fait partie de la boucle ; l'output `commitments` formalise la sortie |
| `formation` *(anticipée)* | Transmission d'un savoir à un acteur-apprenant, objectifs cochés à la clôture | Directive apprenant construite par la mécanique + couverture d'objectifs déclarés : ni `entretien` ni `presentation` |
| `mediation` *(anticipée)* | Régulation d'un conflit entre DEUX acteurs, chat trois voix avec destinataire | Première mécanique multi-acteurs : chaque partie adressée répond ; output `resolution` {reached, terms} |

## Fusionnées ou écartées (et pourquoi)

- **Qualification** (liste audit) → fusionnée dans `entretien` (params `objective: discovery` + critères de découverte) suivie si besoin de `decision`/`production`. La dynamique — poser les bonnes questions pour extraire des signaux — est exactement celle d'`entretien` ; seuls les critères observés changent, et les critères sont du contenu.
- **Diagnostic** (liste audit) → fusionnée dans `analyse` (+`entretien` si l'investigation est conversationnelle). Les outils spécifiques (arbre des causes) seront des `Tool` le jour où un scénario les exige. *Révisé le 2 juillet 2026 : `diagnostic` est désormais une mécanique anticipée — voir section dédiée.*
- **Gestion de crise** (liste audit) → composition : steps `entretien`/`production` avec `time_limit_s` serré. La « crise » est une propriété du contenu et du rythme, pas une boucle de jeu distincte. DD phase 4 se modélise ainsi sans perte.
- **Priorisation** → params de `decision` (options + contrainte de rareté). Conforme à l'audit.
- ~~**Facilitation / Coordination** → compositions de steps, conformément à l'audit. Aucun contenu actuel ne les exige.~~ *Révisé le 5 juillet 2026 : décision PO renversée. `facilitation` (Réunion / Facilitation) et `planification` (Planification / Organisation) sont désormais des mécaniques de premier rang — voir section dédiée. La coordination d'un collectif (COPIL, atelier, sprint) et l'organisation de l'exécution (roadmap, jalons, dépendances) ont une dynamique d'observation propre — distribution de la parole et production collective d'un côté, cohérence/réalisme d'un plan de l'autre — irréductible à une composition de steps.*
- **Feedback / Formation / Modération** (suggestions audit) → aucune occurrence dans le contenu réel. YAGNI : le registry rend l'ajout d'une mécanique trivial le jour où un scénario les demande. On ne construit pas de mécanique sans scénario consommateur. *Révisé le 2 juillet 2026 : `feedback`, `formation` et `mediation` sont désormais des mécaniques anticipées, par décision PO — voir section dédiée.*
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

## Mécaniques anticipées (décision PO du 2 juillet 2026)

**Décision** : construire 4 mécaniques supplémentaires EN AVANCE des prochains scénarios, au même standard exact que les 7 fondatrices (manifest + Runtime pur + Component + tests + doc + triple enregistrement). **Statut : construites, non consommées — design v0, à éprouver au premier scénario consommateur.** Aucun scénario existant ne les référence ; le premier scénario qui les consomme a mandat pour ajuster leur design (params, outputs) tant qu'aucun autre ne les partage.

### `diagnostic` — investiguer la cause d'un problème

Le joueur interroge un témoin (acteur IA) sur une `situation`, confronte des `hypotheses` optionnelles, puis rend un diagnostic structuré (cause retenue — sélection parmi les hypothèses ou champ libre —, éléments à l'appui, causes écartées). Irréductible : `analyse` est documentaire sans boucle d'investigation ; `entretien` produit un dialogue, pas un diagnostic `{cause, evidence, eliminated}` exploitable par `inputs_from`. Params requis : `situation`, `actor_id`. Outputs : `diagnosis`, `dialogue`.

### `feedback` — émettre un retour structuré à un acteur qui réagit

Le joueur délivre un feedback sur un `context_brief`, l'acteur réagit (émotion/défense selon son prompt scénario, cadré par `directive`), le joueur ajuste, puis clôt l'échange en formalisant les « Engagements convenus ». Irréductible : la réaction de l'interlocuteur fait partie de la boucle (pas un objectif d'extraction comme `entretien`), et l'output `commitments` structure la sortie. Params requis : `actor_id`, `context_brief`. Outputs : `dialogue`, `commitments`.

### `formation` — transmettre un savoir à un acteur-apprenant

Le joueur explique un `topic`, l'acteur apprend (directive universelle construite par la mécanique : questions quand c'est flou, reformulations — plus le cadrage scénario), la checklist des `objectives` est visible pendant la session, et à la clôture le joueur coche ceux qu'il estime couverts. Irréductible : boucle pédagogique (ni extraction `entretien`, ni exposé `presentation`) et output `objectives_covered` aligné sur des objectifs déclarés. Params requis : `actor_id`, `topic`, `objectives`. Outputs : `dialogue`, `objectives_covered`.

### `mediation` — réguler un conflit entre DEUX acteurs

Nouveauté structurelle : première mécanique multi-acteurs. Chat à trois voix, sélecteur de destinataire (Partie A / Partie B / Les deux), chaque partie adressée répond séquentiellement (directive universelle de médiation + cadrage scénario), conclusion par « Accord trouvé ? » + termes/constat. Irréductible : aucune mécanique existante n'orchestre deux acteurs dans la même boucle ; output `resolution` {reached, terms}. Params requis : `party_a_actor`, `party_b_actor` (clés `*_actor` validées par le composer contre les acteurs déclarés), `conflict_brief`. Outputs : `dialogue`, `resolution`.

## Mécaniques réintégrées (décision PO du 5 juillet 2026)

Deux mécaniques manquaient au référentiel cible et sont réintégrées au premier rang, headless (zéro UI dédiée : elles s'observent via les tools du workspace — Decision Engine, Bloc-notes, Whiteboard, Messages).

### `planification` — organiser l'exécution (gestion de projet)

Le joueur organise COMMENT exécuter : plan d'action, roadmap, séquence de tâches, jalons, dépendances, ressources, risques. À NE PAS confondre avec `decision` (choisir QUOI faire) : ici la boucle porte sur l'organisation, pas l'arbitrage. Le joueur mobilise les tools transversaux (Decision Engine : timeline / kanban / graphe de dépendances / registre de risques / RACI par table ; Bloc-notes : tâches), mais — invariant d'indépendance — la mécanique ne les importe ni ne lit leur état : elle observe le plan que le joueur FORMALISE (message/mail) + ses notes. L'introspection fine des tools (jalons, dépendances, charge) est faite par `collect.ts` pour le débrief unifié. Irréductible : l'output `plan` synthétise une organisation, qu'aucune mécanique existante ne produit. Params requis : `instructions`. Outputs : `plan`. `default_tools: []` (les tools transversaux ne sont jamais possédés par une mécanique ; ils sont toujours disponibles au joueur).

### `facilitation` — animer un collectif vers un objectif (Réunion / Facilitation)

Deuxième mécanique multi-acteurs (après `mediation`). Le joueur ANIME une réunion (COPIL, atelier, staff, sprint planning, crise, comité) : plusieurs acteurs IA sont présents dans le MÊME fil Messages et répondent chacun selon leur rôle. À NE PAS confondre avec `entretien` (échange dirigé à une personne) ni `presentation` (exposer/convaincre un auditoire) : ici on fait AVANCER un groupe. L'observable : distribution de la parole, dynamique, et ce que la réunion PRODUIT. La mécanique observe le fil multi-acteurs + la synthèse FORMALISÉE par le joueur (output `outcomes` {synthese, productive}, `productive` pilotable par le critère conventionnel `reunion_productive`) ; la production concrète dans les tools (décisions, actions, idées) est mesurée par `collect.ts` pour le débrief — invariant d'indépendance oblige, la mécanique n'importe ni ne lit bloc-notes / decision-engine / whiteboard. Irréductible : aucune mécanique n'orchestre N acteurs autour d'une production collective. Params requis : `participants` (≥2), `objective`. Outputs : `dialogue`, `outcomes`. `default_tools: []`.

### Couche d'analyse pédagogique (interne)

`app/lib/debrief/analysisTools.ts` mappe `mechanic_id → analysis_tools[]` (id, titre, description, mécanique, données nécessaires, affichage débrief, affichage replay, statut V1/V2/non-implémenté). Couche INTERNE : jamais exposée au joueur — le bilan reste un bloc unifié 100 % IA sans vocabulaire moteur. Elle documente ce que chaque outil d'analyse observe, alimente la passe IA finale (`collect.ts` → `debrief-final`) et servira au replay. Les outils non utilisés dans une partie disparaissent silencieusement (aucune pénalité).

### Ce qui reste NON-mécanique, même dans ces décisions

**Priorisation et gestion de crise restent des params ou des compositions de steps** — non requalifiées. La priorisation est un `decision` paramétré (options + contrainte de rareté) ; la crise est une propriété du contenu et du rythme (`time_limit_s` serré sur `entretien`/`production`). Le critère d'irréductibilité (boucle de jeu structurellement distincte + output impossible autrement) reste la seule porte d'entrée du registre.

**Q&A (`qa`) : dépréciation programmée.** `qa` reste au registre tant que 4 scénarios live l'utilisent (`cpo_qa`, `founder_00_cto`, `founder_01_incubator`, `vitrine_signer_le_pilote`). À terme elle devient un pattern transversal (un acteur pose une question, le joueur répond, l'observateur évalue, la mécanique parente tranche) réutilisable par `presentation` / `facilitation` / `entretien` / `negociation` — retrait du premier rang dans une passe ultérieure, une fois les scénarios migrés.

### Garanties de non-régression

- Enregistrées dans `MECHANIC_MANIFESTS`, `MECHANIC_MODULES` et `schema/mechanics.json` (test `registry.gardefou` vert).
- Jouées bout en bout par `tests/playthroughV2/anticipees.playthrough.test.ts` : scénario synthétique en mémoire qui les enchaîne avec `inputs_from` (diagnostic.diagnosis → feedback, feedback.commitments → formation, formation.objectives_covered → mediation), happy path + critical + `validateScenarioV2` à 0 issue.
- Zéro contenu scénario dans le code : situations, hypothèses, objectifs, parties et cadrages arrivent intégralement par `params`.

## Invariants (garde-fous)

1. Aucun contenu scénario dans `app/mechanics/` — tout nom d'acteur, produit, clause, seuil métier vit dans `scenario.json:params`.
2. L'IA observe, le moteur décide : une mécanique produit une `StepObservation`, seul `applyStepObservation` rend un verdict.
3. Tout output de mécanique est JSON-sérialisable et déclaré dans `manifest.output_keys` (contrat `inputs_from`).
4. Toute nouvelle mécanique = dossier + manifest + entry dans `MECHANIC_MANIFESTS`, `MECHANIC_MODULES`, `schema/mechanics.json` — le test `registry.gardefou` échoue sinon.
