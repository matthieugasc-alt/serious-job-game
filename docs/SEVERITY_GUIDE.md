# Guide sévérité des critères d'évaluation (W-chantier)

Ce guide explique quand utiliser chaque niveau de sévérité pédagogique pour un critère d'évaluation d'une phase Revealio. C'est le vocabulaire déclaratif qui remplace « l'IA décide » par « le scénario décide, l'IA observe, le moteur applique ».

Les quatre niveaux disponibles sont : **critical**, **required**, **bonus**, **minor**.

## Vue d'ensemble

| Sévérité | Rôle pédagogique | Effet moteur | Poids par défaut dans `min_criteria_count` |
|---|---|---|---|
| `critical` | Erreur rédhibitoire | Observé=true ⇒ échec immédiat, court-circuite tout | 0 (jamais dans le score) |
| `required` | Compétence obligatoire | Doit être matché pour passer | 2 |
| `bonus` | Excellence facultative | Ajoute au score sans être exigé | 1 |
| `minor` | Détail de forme | Compte faiblement dans le score | 0.5 |

## Quand utiliser chaque niveau

### `critical` — l'erreur rédhibitoire

Utilise `critical` quand un comportement du joueur invalide **immédiatement** toute la phase, quel que soit le reste. C'est un « game over pédagogique » sur ce point.

Le critère décrit **ce qu'il ne faut PAS faire**. Il est observé comme `true` quand l'IA détecte que le joueur l'a fait. Ce déclenchement court-circuite toute autre évaluation.

**Exemples métier :**

- Vente / négociation : « le joueur a divulgué le montant de la remise maximale autorisée », « le joueur a menti sur les caractéristiques du produit »
- Management : « le joueur a insulté un membre de l'équipe », « le joueur a promis quelque chose qu'il ne peut pas tenir »
- Recrutement : « le joueur a posé une question discriminatoire (âge, origine, situation familiale, religion) »
- Médical : « le joueur a divulgué des données de santé à un tiers non autorisé »
- Juridique / conformité : « le joueur a accepté une clause qui viole le RGPD »

**Convention JSON :**

```json
{
  "id": "clause_rgpd_refusee",
  "description": "Le joueur a accepté une clause qui contourne le RGPD.",
  "severity": "critical"
}
```

Le critère peut être référencé dans `completion_rules.critical_failure_criteria` pour renforcer la déclaration côté règles (recommandé pour la lisibilité), mais la sémantique reste la même : observed=true déclenche l'échec.

**Quand NE PAS utiliser critical :**

- Pour un critère « le joueur a oublié quelque chose d'important » — utilise `required` (manqué = échec normal, pas immédiat)
- Pour un critère où le rattrapage est possible dans la même phase — le critical bloque définitivement

### `required` — la compétence obligatoire

C'est le niveau par défaut (utilisé si `severity` n'est pas déclaré). Le critère décrit **ce qu'il faut faire**. Il doit être matché pour que la phase passe.

**Exemples métier :**

- Vente : « le joueur a identifié explicitement le besoin du client »
- Management : « le joueur a fixé un objectif clair avec des critères mesurables »
- Recrutement : « le joueur a validé au moins deux compétences clés de l'offre »
- Support : « le joueur a reformulé la demande avant de proposer une solution »

**Convention JSON :**

```json
{
  "id": "besoin_identifie",
  "description": "Le joueur a identifié explicitement le besoin du client (au moins une question ouverte + une reformulation).",
  "severity": "required"
}
```

Un critère `required` doit être référencé dans `completion_rules.required_criteria` pour que le moteur l'applique. C'est la règle par défaut du E-chantier.

### `bonus` — l'excellence facultative

Le critère décrit **quelque chose de très bien à faire**, sans être une exigence. Il enrichit le score sans conditionner la validation.

**Exemples métier :**

- Vente : « le joueur a mentionné une référence client crédible sans être sollicité »
- Management : « le joueur a proposé un plan d'action à 30/60/90 jours »
- Recrutement : « le joueur a documenté une objection candidat avant de la traiter »

Les bonus sont surfacés dans la vue admin replay avec une étoile ⭐ et dans le champ `bonusMatched` du résultat d'évaluation. Utiles pour identifier les joueurs qui vont au-delà de l'attendu.

### `minor` — le détail de forme

Le critère décrit **une bonne pratique de surface** qui ne mérite pas d'échec mais compte quand même. Poids faible (0.5 par défaut) dans `min_criteria_count`.

**Exemples métier :**

- Toute phase : « le joueur a dit bonjour en ouverture »
- Mail : « le joueur a signé son message »
- Chat : « le joueur a utilisé un ton professionnel sans familiarité déplacée »

## Règles de combinaison

### Une phase doit avoir au moins un chemin d'échec

Le garde-fou `EVAL_NO_FAIL_PATH` refuse toute phase qui déclare des critères mais sans `required_criteria`, ni `critical_failure_criteria`, ni au moins un critère `severity: "critical"`. Autrement dit : au moins un des critères doit pouvoir faire échouer la phase, sinon elle n'est pas pédagogique.

Une phase qui n'aurait que des `bonus` et des `minor` pourrait toujours passer, ce qui n'a pas de sens comme évaluation.

### critical + required = tous les deux appliqués

Une phase peut combiner critical (échec fatal sur un point) et required (validation classique sur les autres). Le critical est évalué en premier — s'il déclenche, on arrête. Sinon on évalue required + min_criteria_count normalement.

### bonus peut compenser dans min_criteria_count

Si tu utilises `min_criteria_count`, les critères `bonus` matchés comptent dans le score (avec leur poids). C'est ce qui permet à un joueur particulièrement bon (qui touche tous les required ET des bonus) d'avoir un excellent résultat mesurable.

### Ne mélange pas required et critical sur le même critère

Un critère est soit une exigence (required : « il faut le faire »), soit une interdiction (critical : « il ne faut pas le faire »). Pas les deux à la fois. Si le comportement voulu peut être formulé positivement (« le joueur clarifie les enjeux ») ET négativement (« le joueur ne cache pas d'information »), fais deux critères distincts.

## Recette rapide par domaine

**Vente / négociation :**
- required : identification du besoin, reformulation, offre alignée sur la valeur
- bonus : références client, plan de closing
- critical : divulgation d'info confidentielle, mensonge sur le produit
- minor : politesse, signature

**Management :**
- required : objectif clair, écoute active, plan d'action
- bonus : plan à 30/60/90 jours, mesure du succès
- critical : insulte, engagement irréaliste, sanction disproportionnée
- minor : formalisation écrite du compte-rendu

**Recrutement :**
- required : validation compétences clés, questions comportementales
- bonus : mise en situation, questions candidat traitées
- critical : question discriminatoire, promesse salariale non autorisée
- minor : introduction structurée, invitation candidat à poser des questions

**Support / relation client :**
- required : reformulation demande, solution proposée avec délai
- bonus : proactif sur le préventif, mention canal alternatif
- critical : abandon sans résolution, transfert vers mauvais canal
- minor : signature, ton chaleureux

## Effet sur la vue admin replay

Chaque critère est affiché dans le tableau `/admin/replay/[campaignId]` avec :

- un **badge coloré** par sévérité : rouge (critical), violet (required), vert (bonus), gris (minor)
- un **verdict visuel** : ⛔ si critical déclenché, 🟢 si matché, ⭐ si bonus matché, 🔴 si manqué
- une **section dédiée** en tête de rapport quand un critical a déclenché (fond rouge, explication)

Ça permet au concepteur de voir en un coup d'œil :

- si les bons critères sont typés au bon niveau (ex : un « je dis bonjour » marqué required alors qu'il devrait être minor)
- si les critical déclenchent sur les vrais cas voulus
- si les bonus sont trop rarement matchés (peut-être trop exigeants dans la description)

## Migration d'une phase existante

Pour typer les critères d'une phase déjà migrée en E-chantier :

1. Ouvre le `scenario.json`, va sur la phase concernée
2. Pour chaque critère dans `evaluation.observed_criteria`, ajoute `"severity": "..."`
3. Si tu ajoutes un `critical`, ajoute-le aussi à `completion_rules.critical_failure_criteria` pour la lisibilité (facultatif mais recommandé)
4. Vérifie que `completion_rules.required_criteria` ne contient QUE des ids `severity: "required"`
5. Lance `npm run validate:scenarios` : les codes d'erreur `EVAL_CRITICAL_SEVERITY_MISMATCH` et `EVAL_NO_FAIL_PATH` te guideront sur les incohérences

Une phase typée passe automatiquement le garde-fou `deprecationGate` et devient plus lisible côté admin replay.
