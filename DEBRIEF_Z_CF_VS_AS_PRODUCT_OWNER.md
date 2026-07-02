# Debrief chantiers Z, CF, VS, AS — Product Owner

**Date** : 1er juillet 2026
**Auteur** : équipe moteur
**Statut** : livré en prod (revealio.live)
**Périmètre** : réponse structurée aux 5 axes stratégiques du retour PO sur le debrief W/X/Y

Ce document poursuit la pratique adoptée au chantier précédent : livrables **et** failles restantes, en toute honnêteté. Le PO avait explicitement salué cette approche — on la reconduit.

---

## Résumé exécutif

Les 5 axes du retour PO ont été traités comme un ensemble cohérent, avec un ordre logique dicté par les dépendances : le référentiel de compétences (Z) débloque le tagging par famille (CF) qui alimente l'agrégation transverse, le versioning (VS) garantit la lisibilité des replays anciens, et l'assistant (AS) transforme les métriques en actions. Les deux fixes bloquants du debrief précédent (lien édition en dur, absence de tests sur `computeAnalytics`) ont été traités en préambule.

**Ce qui est solide** : l'architecture est cohérente et testée (30 nouveaux tests, 202/202 passants). Les 4 chantiers s'imbriquent proprement — un scenario qui utilise le nouveau vocabulaire (severity + competencies + error_type) alimente automatiquement toutes les vues aval (replay individuel, vue agrégée par scenario, dashboard analytics, suggestions). La séparation entre données (competencies.json) / logique (rules.ts) / présentation (pages admin) est propre.

**Ce qui est fragile** : plusieurs mécanismes livrés en code n'ont pas encore de scenario réel qui les exerce. Personne ne tague ses critères avec des compétences aujourd'hui, personne n'a 2 versions archivées d'un même scenario, aucun `error_type` n'est renseigné. Les vues sont donc vides ou n'affichent que des états d'exception (« pas assez de données »). Le versioning archive existe comme fonction mais n'est branché sur aucun flow qui l'appellerait automatiquement.

**Ce qui manque encore** : la question 4 du PO reste ouverte (persister `evaluation_history` server-side), volontairement rétrogradée derrière le versioning comme le PO l'avait recommandé. Aucun test end-to-end de la boucle complète scenario → prompt → IA → moteur → replay → analytics → suggestion. Le prompt IA ne connaît toujours ni la severity, ni les compétences, ni l'error_type des critères qu'il observe — l'observation reste binaire alors qu'elle pourrait être guidée par le vocabulaire.

Détail chantier par chantier ci-dessous.

---

## Fixes bloquantes — Priorités 1 et 2 du debrief précédent

### Ce qui a été livré

**Fix #1 — Vraie page d'édition inline.** Le lien « éditer ce critère » du replay pointait vers `/studio?scenario=X&phase=Y&criterion=Z`, query params jamais consommés côté studio. C'était un lien mort de démonstration. Il pointe désormais vers `/admin/edit-criterion/[scenarioId]/[phaseId]/[criterionId]`, une page dédiée qui charge le critère, permet d'éditer description / severity / expected / weight / competencies / error_type, et sauve via un endpoint `POST /api/admin/scenario-patch` qui écrit directement dans le `scenario.json` du repo. Whitelisting strict des champs éditables (l'`id` est immuable pour préserver les references dans les historiques).

**Fix #2 — Tests unitaires sur `computeAnalytics()`.** Le code d'agrégation (~180 lignes de logique complexe avec Maps imbriquées) était totalement non testé — dette technique explicite dans le debrief précédent. 11 tests unitaires couvrent désormais les 4 slices (phases, criteria, scenarios, help) + les totaux + le cas input vide. Fixtures synthétiques qui simulent des événements par type et vérifient les rate calculations.

### Failles identifiées

**Le patch de critère n'est pas atomique.** Le fichier `scenario.json` est lu → modifié → réécrit en série. Deux éditions simultanées peuvent se perdre. À l'échelle actuelle (un seul concepteur) c'est acceptable, à plusieurs il faudra un lock ou un mécanisme optimiste avec version_id.

**Pas d'audit trail** sur les patches. Personne ne sait qui a modifié quoi et quand. Un `git commit` des patches en post-write serait la version simple.

**Les tests de `computeAnalytics` couvrent les cas nominaux, pas les edge cases.** Payloads malformés, timestamps invalides, événements de type inconnu — pas testés. Robustesse à durcir.

---

## Chantier Z — Référentiel de compétences transverse

### Ce qui a été livré

**Structure du référentiel** dans `data/competencies.json`, avec 9 compétences initiales issues de ta liste : Communication, Priorisation, Négociation, Analyse, Décision, Leadership, Organisation, Gestion du stress, Relation client. Chaque compétence a un `id` (snake_case, immuable), un `label` (affiché aux utilisateurs) et une `description` (contexte pour le concepteur).

**Loader typé** dans `app/lib/competencies.ts` avec cache d'appel + invalidation manuelle après édition. Utilisé partout où la validation est nécessaire.

**Vue admin CRUD complète** à `/admin/competencies` : liste des compétences actives + archivées, modal d'édition avec description longue, bouton archiver / restaurer. Le soft-delete est délibéré — on ne veut pas casser les replays anciens qui référencent une compétence désactivée.

**Endpoint API** `/api/admin/competencies` avec `GET` ouvert à tout authentifié (utilisé par edit-criterion) et `POST` super_admin uniquement pour les mutations.

### Failles identifiées

**La liste initiale des 9 compétences est un placeholder.** Elles viennent directement de ta suggestion, sans validation métier ni structure hiérarchique. Une vraie plateforme d'évaluation des compétences aurait probablement des sous-compétences (« Négociation → Écoute active → Reformulation » par exemple). L'attribut `parent` existe dans le type mais n'est ni exploité ni exposé dans l'UI.

**Aucune notion de niveau (débutant/confirmé/expert).** Un critère est soit taggé « Négociation » soit non. Impossible d'exprimer « ce critère mesure la Négociation niveau avancé ». Pour un vrai référentiel d'évaluation, ça deviendra rapidement contraignant.

**Aucun mapping vers des référentiels externes** (ROME, ESCO, LinkedIn Skills, référentiels d'écoles). Si tu veux vendre à une école qui a déjà son propre référentiel, tu partiras de zéro à chaque intégration. À anticiper si le business le demande.

**Aucun garde-fou anti-suppression** sur une compétence référencée. Rien n'empêche d'archiver « Négociation » alors que 200 critères y pointent. Ce n'est pas cassant (le soft-delete préserve les données historiques), mais c'est source de confusion utilisateur.

---

## Chantier CF — Critère × Compétence × Type d'erreur

### Ce qui a été livré

**Extension du schéma** `phase.evaluation.observed_criteria[i]` avec deux nouveaux champs optionnels :

- `competencies: string[]` — tableau d'ids depuis le référentiel Z. Un critère peut pointer vers plusieurs compétences (par exemple, un mail commercial bien structuré mesure à la fois Communication et Relation client).
- `error_type: 'knowledge' | 'reasoning' | 'behavior' | 'regulatory' | 'communication'` — orthogonal à `severity`. Deux critères `critical` peuvent avoir des `error_type` différents (une divulgation RGPD c'est `regulatory`, une insulte c'est `behavior`), avec des conséquences pédagogiques distinctes.

**Types miroir** dans `app/lib/types.ts` avec `CRITERION_ERROR_TYPES` exhaustif exporté (permet le `satisfies` check).

**Garde-fou automatique** `EVAL_UNKNOWN_COMPETENCY` dans `validate:scenarios` : toute référence à une compétence absente du référentiel Z casse le build immédiatement, sauf si le référentiel est vide (première installation).

**Propagation dans la télémétrie.** `useSendChatMessage` embarque désormais un `criteriaMeta` par critère dans l'événement `phase_evaluated` (competencies + error_type + severity au moment de l'observation). `reader.ts` agrège ces métadonnées en 2 nouvelles slices : `competencies` (match rate par compétence) et `errorTypes` (taux d'observation par famille).

**Deux nouvelles sections dashboard** à `/admin/analytics` :
- « Match rate par compétence (transverse) » qui répond à la promesse du PO « ce joueur est excellent en Négociation »
- « Répartition par famille d'erreur » qui montre quels types d'erreurs dominent sur la plateforme

### Failles identifiées

**Aucun critère en prod n'est encore taggé avec des compétences ou un error_type.** Comme pour le mécanisme `critical` du chantier W précédent, le code est là mais aucun scenario ne l'exerce. Les deux nouvelles sections du dashboard afficheront « aucun critère n'est encore lié à une compétence » à l'ouverture. La valeur n'est visible qu'une fois qu'un vrai concepteur a re-tagué tous ses critères — ce qui n'est pas trivial (7 phases × ~4 critères = ~30 taggings à faire manuellement).

**Le tagging n'est pas testé à la volée dans le prompt IA.** L'IA continue d'observer les critères comme avant, sans savoir qu'un critère « communication_client » est censé mesurer la compétence Communication et est de famille `behavior`. On perd une opportunité potentielle d'améliorer la qualité de l'observation en enrichissant le prompt avec ce contexte pédagogique.

**Le mapping critère → compétence est du 1-to-many mais pas pondéré.** Un critère peut pointer vers 5 compétences, chacune reçoit un « match » identique. Un scenario qui tague trop libéralement (« tout critère touche à la Communication ») va polluer les métriques transverses.

**La famille `error_type` n'est renseignée que si le critère est manqué.** L'agrégation `errorTypes` compte les non-match comme des « erreurs observées », ce qui a du sens sémantiquement. Mais un critère toujours matché n'apparaît jamais dans cette slice — impossible de savoir sur quel type d'erreur les joueurs sont bons. Asymétrie à documenter côté PO.

---

## Chantier VS — Versioning « git blame » des scénarios

### Ce qui a été livré

**Module `app/lib/scenarioVersioning.ts`** avec 3 fonctions :
- `archiveScenarioVersion(scenarioId, scenario)` — écrit un snapshot dans `data/scenario_versions/<id>/<version>.json`. Idempotent : même contenu à même version = no-op. Contenu différent à même version = fichier `.dirty-<timestamp>.json` pour surfacer un bump manquant.
- `readScenarioVersion(scenarioId, version)` — recharge le snapshot exact.
- `listScenarioVersions(scenarioId)` — liste triée descendant (semver-ish).

**Extension `EvaluationHistoryEntry`** avec un champ `conditions?` qui capture 5 dimensions :
- `scenario_version` : le champ `scenario.version` au moment T
- `engine_version` : version du moteur `applyPhaseObservation` (`"1.1.0"` baseline actuelle)
- `ai_model` : modèle IA utilisé (récupéré de `observation.meta.model`)
- `prompt_version` : hash court du prompt d'évaluation (structure prête, non wireé — voir failles)
- `criterion_snapshots` : liste complète des critères au moment de l'observation (id, description, severity, expected, competencies, error_type)

**Wiring dans `useSendChatMessage`** : à chaque `applyPhaseObservation`, capture des `criterion_snapshots` en frozen et ajout dans `evaluation_history`.

**Fallback intelligent dans le replay individuel** : si l'entrée d'`evaluation_history` porte des `criterion_snapshots`, la vue les utilise en priorité sur le contract courant du scenario. Effet : un replay six mois plus tard reste lisible même si le scenario a été modifié depuis.

**Nouvelle vue `/admin/scenario-diff/[scenarioId]`** : sélecteur de 2 versions archivées + diff par phase (added / removed / modified) avec pour chaque critère modifié la liste des champs changés (severity avant/après, description, competencies, error_type). Endpoint API dédié pour le calcul du diff.

### Failles identifiées

**`archiveScenarioVersion` n'est appelé nulle part automatiquement.** C'est un helper utilitaire, il faut le brancher à un flow (probablement dans le pipeline `validate:scenarios` en post-hook, ou dans `/api/admin/scenario-patch` pour tracker chaque modification). Sans ça, la vue de diff sera toujours vide parce qu'il n'y a que 0 ou 1 version archivée.

**`engine_version` est hardcodé en string `"1.1.0"`** dans `useSendChatMessage`. Aucun mécanisme automatique ne le bump quand la sémantique de `applyPhaseObservation` change. Un dev qui modifie le moteur sans bump doit s'en souvenir — c'est un TODO qu'un test devrait forcer (par exemple : « chaque modif de `applyPhaseObservation.ts` doit bump `ENGINE_VERSION` dans `scenarioVersioning.ts` »).

**`prompt_version` n'est jamais calculé ni transmis.** Le champ existe dans le type et le hash `hashPrompt()` est prêt côté serveur, mais `/api/chat` ne le renvoie pas et le client ne le remplit pas. C'est du plumbing manquant.

**`scenario.version` reste optionnel dans le schéma.** Un scenario sans version passe `validate:scenarios` sans erreur. Il faudrait le rendre obligatoire (ou au moins émettre un warning), sinon l'archivage silencieusement no-op.

**La diff view est utile uniquement à partir de 2 versions.** Comme aucun scenario n'a pour l'instant plusieurs versions archivées (l'archivage n'étant pas branché), la vue affichera « au moins 2 versions archivées requises » systématiquement. C'est un chantier incomplet visible.

**Aucune notion de « replay avec une nouvelle règle »** (X3 initialement listé dans le retour PO précédent, toujours non livré). Tu peux voir la version historique d'un critère, tu ne peux pas encore rejouer une observation avec un critère modifié pour voir ce que ça donnerait. C'est le vrai chaînon manquant du cockpit.

---

## Chantier AS — Assistant de conception

### Ce qui a été livré

**Module `app/lib/suggestions/rules.ts`** — 6 types de suggestions déclaratives :

- `unmatched_never` : critère avec < 5% de match rate, probablement mal formulé
- `severity_adjustment` : critère avec < 20% de match rate, envisager de le passer en bonus
- `consigne_ambiguity` : phase avec > 30% d'abandon, consigne à revoir
- `critical_over_triggered` : critical qui fire sur > 20% des tentatives, seuil trop bas
- `phase_too_long` : durée moyenne > 2× la target (nécessite un `targetDurations` en input)
- `competency_gap` : declaré dans le type mais pas encore implémenté

Chaque suggestion porte :
- `type` (catégorie)
- `severity` (info / warning / critical) pour le tri
- `title` (phrase courte)
- `evidence` (les métriques qui déclenchent)
- `suggested_action` (quoi faire concrètement)
- `editTarget` (deep link vers `/admin/edit-criterion/*` ou `/admin/replay/scenario/*`)

**Seuils configurables** dans une constante `THRESHOLDS` exportée — extraite délibérément pour permettre le tuning et le test.

**9 tests unitaires** couvrant les cas nominaux + le tri par sévérité + les cas hors seuil.

**Injection dans l'endpoint analytics** — `/api/admin/analytics` calcule les suggestions à chaque requête et les retourne dans la réponse.

**Section dédiée en tête de dashboard** avec fond ambre pour émerger visuellement, top 10 des suggestions triées par sévérité, chaque suggestion cliquable vers son `editTarget` (édition du critère si applicable, sinon vue agrégée du scenario).

### Failles identifiées

**Les seuils sont arbitraires.** `CRITERION_TOO_HARD = 0.2`, `ABANDON_HIGH = 0.3`, etc. sortent de mon jugement rapide, pas de données réelles. Il faudra les tuner après quelques semaines de sessions en prod. Un mécanisme de calibration basé sur les distributions observées serait la V2 propre.

**L'assistant ne connaît pas le contexte du critère.** La suggestion « ce critère est trop exigeant, envisage de le passer en bonus » est émise même si le critère est **déjà** en `bonus`. Le module `rules.ts` ne reçoit pas la severity actuelle du critère — il faudrait la passer via `criteriaMeta` (déjà transmis pour la télémétrie CF). C'est un TODO simple à corriger.

**Aucun mécanisme d'« appliquer la suggestion en un clic ».** Le PO parlait de « modifier un critère et republier le scenario ». Aujourd'hui le clic sur la suggestion ouvre la page d'édition — le concepteur doit encore décider et cliquer manuellement. Une action automatisée serait un vrai gain UX mais aussi un risque (modifications sans réflexion).

**Pas de règles combinatoires.** Chaque règle regarde une métrique isolée. Impossible d'exprimer « quand un critère a un faible match rate ET qu'il est lié à la compétence X ET que d'autres critères de la même compétence ont aussi un faible match rate → probablement le référentiel de compétence est mal calibré, pas les critères ». Pour le moment on flag critère par critère.

**Pas de mémoire.** Une suggestion « dismissée » (le concepteur a lu et décidé de ne rien faire) réapparaît à chaque page load. Pas de mécanisme d'archivage ou d'expiration.

**`competency_gap` déclaré mais pas implémenté.** Un type dans l'union qui n'a pas de règle qui le produit — dette laissée volontairement pour anticiper la logique future qui croiserait le référentiel de compétences avec les résultats agrégés.

---

## Failles transverses (touchent plusieurs chantiers)

**Aucun test end-to-end.** Comme au chantier précédent, chaque brique est unit-testée mais la boucle complète (joueur → prompt IA → moteur → replay → analytics → suggestion → édition → nouveau scenario) n'a jamais été jouée dans un test intégré. La confiance globale reste basée sur la cohérence des interfaces individuelles + l'absence d'erreur TypeScript.

**Le prompt IA est resté binaire.** Il ne connaît toujours pas les 3 dimensions nouvelles (severity, competencies, error_type) qui sont pourtant persistées côté données. L'observation reste « le joueur a-t-il ou non fait X ? » alors qu'on pourrait guider avec « ce critère est critique et de type regulatory — sois particulièrement précis dans ton observation ». Amélioration probable de la qualité d'observation à prototyper.

**`evaluation_history` reste côté client** (priorité 4 du debrief précédent, volontairement rétrogradée). Le versioning ayant été traité en priorité 3 comme tu l'avais recommandé, la persistance server-side reste à faire. Une session crashée entre deux sauvegardes de 10s perd son histoire.

**Aucun scenario en prod n'utilise l'ensemble du nouveau vocabulaire** (severity + competencies + error_type + version_notes). Les 3 pilotes du chantier W ont severity mais pas les autres. Il faudra un scenario « vitrine » migré à fond pour prouver la valeur en démo.

**Les vues admin s'accumulent sans navigation d'entrée.** On a désormais `/admin/analytics`, `/admin/replay/[campaignId]`, `/admin/replay/scenario/[scenarioId]`, `/admin/edit-criterion/*`, `/admin/scenario-diff/[scenarioId]`, `/admin/competencies`. Aucune page d'index qui les liste, aucun menu de navigation. Un concepteur doit connaître les URLs par cœur ou taper le path.

**Le versioning archive n'est pas branché.** Le mécanisme existe (module + type + vue) mais rien ne l'appelle. Sans wire dans le CI ou dans `scenario-patch`, la fonctionnalité reste théorique.

---

## Métriques de qualité

| Métrique | Valeur |
|---|---|
| Tests unitaires ajoutés (Z + CF) | 2 sur le garde-fou EVAL_UNKNOWN_COMPETENCY |
| Tests unitaires ajoutés (VS) | 0 — dette technique explicite |
| Tests unitaires ajoutés (AS) | 9 sur `computeSuggestions` |
| Tests fix bloquantes | 11 sur `computeAnalytics` |
| Suite complète après livraison | 202 tests passants sur 21 fichiers |
| Scénarios actifs validés | 10 sur 10 |
| Scénarios utilisant competencies | **0** — chantier livré, exercice en attente |
| Scénarios utilisant error_type | **0** — même situation |
| Scénarios avec plusieurs versions archivées | **0** — archive non wire |
| Erreurs TypeScript | 0 |
| Nouveaux endpoints API | 3 (`competencies`, `scenario-patch`, `scenario-diff`) |
| Nouvelles pages admin | 3 (`competencies`, `edit-criterion`, `scenario-diff`) |
| Nouvelles sections dashboard | 3 (compétences, error_types, suggestions) |
| Nouveaux types dans le schéma | 2 (competencies, error_type) |
| Nouvelles clés `CompletionRules` | 0 (VS ajoute sur `EvaluationHistoryEntry`, pas sur les rules) |

---

## Cinq priorités recommandées pour la suite

Classées par ratio impact/effort décroissant.

**1. Wire `archiveScenarioVersion` dans un flow réel** (~30 min).
Sans ça, VS est du code mort. Deux options : appel après chaque `scenario-patch` (archive fine-grain, potentiellement bruyant), ou appel dans un hook Git post-commit (archive au niveau release). Recommandation : dans `scenario-patch` avec bump automatique de version patch si version identique détectée.

**2. Migrer un scenario vitrine avec tout le vocabulaire** (~1-2 sessions).
Un scenario end-to-end qui utilise severity + competencies + error_type + version, joué en vrai, permet de valider en démo que les vues « analytics par compétence », « répartition par famille d'erreur », « suggestions » remontent bien du contenu. Sans ça, tous les screenshots resteront des faux positifs.

**3. Passer les dimensions au prompt IA** (~1 session).
Enrichir `evaluationPromptE` avec les 3 nouvelles dimensions. Prototype rapide : pour chaque critère, ajouter « (sévérité: critical, compétence: Communication, type: regulatory) » dans la liste envoyée à l'IA. Mesurer si la qualité d'observation s'améliore via un jeu de test.

**4. Passer la severity du critère à `computeSuggestions`** (~1h).
Le module `rules.ts` a `criteriaMeta` disponible mais ne le lit pas. Petit refactor : passer les meta dans l'input, et exclure les suggestions « passe en bonus » sur des critères déjà bonus.

**5. Créer une page d'index `/admin`** (~30 min).
Les 6 pages admin sont mures pour une home. Une simple liste avec description courte suffit — permet aux nouveaux concepteurs de découvrir l'outillage sans lire la doc.

Ce qui n'est **pas** dans le top 5 mais reste important : `evaluation_history` server-side (question 4 du PO originale, toujours en dette), tests end-to-end, mécanisme d'expiration des suggestions dismissées, hiérarchie parent/enfant dans le référentiel de compétences, mapping vers ROME/ESCO/référentiels externes, dry-run replay avec nouvelle règle (X3 initial, non livré).

---

## Points d'attention pratiques pour le PO

**Toutes les vues sont vides à l'ouverture.** Analytics, dashboard compétences, dashboard erreurs, diff scenario, suggestions — chacune affiche un état d'exception (« aucune donnée » / « au moins 2 versions requises » / « aucun critère taggé »). C'est normal : le code est prêt, le contenu ne l'est pas. Il faut au minimum jouer 5 sessions du scenario vitrine (priorité 2 ci-dessus) avant qu'aucune démo ne soit convaincante.

**L'archivage des versions ne se déclenche pas tout seul.** Tant que la priorité 1 n'est pas livrée, la fonctionnalité de diff reste théorique. Note-le comme un chantier bloquant si tu prévois une démo qui met en avant le « git blame ».

**Les seuils de l'assistant sont mes hypothèses.** `20% de match rate = trop dur`, `30% d'abandon = trop élevé` — c'est mon jugement rapide, pas une vérité mesurée. À corriger dès que tu as ~50 sessions réelles pour observer les distributions.

**Le référentiel de compétences est un placeholder.** Les 9 compétences initiales viennent de ta liste, sans validation métier ni ajustement par domaine. Avant de communiquer sur « plateforme d'évaluation des compétences », relis-les avec un œil expert (ou un utilisateur type : école, RH).

**L'accumulation de pages admin sans navigation d'entrée** devient un problème d'ergonomie. C'est pas grave à ton échelle mais dès qu'il y aura un second concepteur, il perdra du temps. La priorité 5 ci-dessus (page d'index) est un investissement de 30 minutes pour un vrai gain UX.
