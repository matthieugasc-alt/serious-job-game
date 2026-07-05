# Doctrine d'évaluation de Revealio

Document de référence permanent. Toute mécanique, tout scénario et toute évolution du moteur de notation doivent s'y conformer.

## Principe fondateur

**Revealio évalue la qualité de la démarche, presque jamais « la bonne décision ».** La valeur pédagogique du produit n'est pas de faire deviner au joueur la réponse canonique, mais de juger la solidité de son raisonnement : croiser les sources, distinguer corrélation et causalité, ancrer ses conclusions dans les données, structurer sa pensée, mobiliser les bons interlocuteurs, communiquer avec justesse. C'est précisément ce jugement de la démarche qui exige une IA — une grille déterministe ne sait mesurer que la conformité à une réponse attendue.

## Les trois couches, et qui décide

1. **Passage de phase** — action **déterministe** du joueur. Un trigger déclaré (mail envoyé, N messages, temps écoulé) fait avancer le scénario. L'IA n'intervient pas ici.
2. **Verdict (gagné / perdu)** — jugement **IA**, produit par le module le plus riche (la passe d'analyse finale), à partir de tous les signaux de la session.
3. **Analyse de performance** — même passe IA, du même tenant que le verdict : le récit ne peut jamais contredire le verdict.

## Le verdict : trois niveaux, deux dimensions

Le juge unique rend un verdict à **trois niveaux** :

- **Victoire complète** — démarche solide ET résultat juste.
- **Victoire partielle** — démarche correcte mais résultat incomplet ou imparfait. C'est le cas par défaut d'un raisonnement honnête qui n'a pas tout trouvé : une démarche solide qui n'aboutit pas à l'action canonique reste une victoire partielle, **jamais une défaite**.
- **Défaite** — démarche faible ou absente, **ou** un garde-fou dur déclenché.

Il note **deux dimensions distinctes** : la **démarche** (prioritaire) et le **résultat** (la substance tient-elle). Les deux notes (0-100) sont affichées au joueur avec le verdict.

## Les garde-fous durs (déterministes)

Certaines fautes restent **éliminatoires et déterministes**, quelle que soit la démarche : une conclusion **contredite par les données**, un comportement **irrespectueux**. Elles sont déclarées comme critères de sévérité `critical` dans le scénario ; dès qu'elles sont observées, elles forcent la **Défaite**. C'est la seule zone où le verdict n'est pas laissé à l'appréciation holistique de l'IA.

## Conséquences pour l'écriture des scénarios

- Les critères observés doivent décrire des **dimensions de démarche** (« croise les sources », « distingue corrélation et causalité », « propose une action ancrée dans son analyse »), **pas** la réponse canonique attendue (« propose l'action X »).
- Réserver la sévérité `critical` aux vraies fautes éliminatoires (contradiction factuelle, irrespect) — elles seules court-circuitent le jugement de démarche.
- Les endings authorés restent utiles comme contexte narratif, mais le niveau (complète / partielle / défaite) vient du juge IA.

## Où c'est implémenté

- Verdict + notes + doctrine : `app/api/v2/debrief-final/route.ts` (le juge unique).
- Cadrage démarche de l'observation par critère : `app/api/v2/observe/route.ts`.
- Garde-fous durs transmis au juge : `app/workspace/debrief/ScenarioDebrief.tsx` (résout les critères `critical` déclenchés) → `collectGardeFous`.
- Affichage 3 niveaux + 2 notes : `app/workspace/debrief/DebriefView.tsx`.

## Reste à faire (Phase 2)

Faire du verdict IA la **source unique** de la fin affichée et remplacer la sélection déterministe d'ending — en traitant le couplage avec l'économie des **campagnes founder** (`/api/v2/complete` + `data/founder_rules.json`), qui repose aujourd'hui sur l'`ending_id` déterministe.
