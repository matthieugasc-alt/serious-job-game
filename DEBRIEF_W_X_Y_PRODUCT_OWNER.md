# Debrief chantiers W, X, Y — Product Owner

**Date** : 1er juillet 2026
**Auteur** : équipe moteur
**Statut** : livré en prod (revealio.live)
**Périmètre** : trois chantiers issus directement du retour PO sur le debrief V/E

Ce document adopte une posture délibérément critique : chaque chantier est présenté avec ses livrables **et ses failles**, y compris celles qu'on identifie nous-mêmes. L'objectif n'est pas de vendre, c'est de donner au PO une vision réaliste de l'état des lieux pour prioriser la suite.

---

## Résumé exécutif

Trois axes traités en une session : la sévérité pédagogique des critères (**W**), le replay comme cockpit de création (**X**), la télémétrie pédagogique (**Y**). Les trois répondent point par point au retour PO reçu après la livraison V/E.

**Ce qui est solide et fiable** : la sémantique de sévérité (critical / required / bonus / minor) est complète côté moteur, testée exhaustivement, protégée par 3 garde-fous automatiques. La vue admin `/admin/analytics` répond visuellement à 5 des 6 questions posées par le PO. L'infrastructure télémétrique existante a été étendue proprement.

**Ce qui est fragile et à surveiller** : le lien « éditer ce critère depuis le replay » est un lien de façade (X1), le studio ne consomme pas encore les query params. Le mécanisme `critical` n'est utilisé par aucun scenario en prod aujourd'hui — le code existe mais n'a jamais servi en vrai. L'analytics scanne tous les fichiers JSONL à chaque requête, ce qui deviendra lent au-delà de quelques dizaines de milliers d'événements. Le typage des 3 scenarios pilotes en sévérité a été fait par heuristique, pas par expertise pédagogique.

**Ce qui manque encore** : aucune ingestion réelle de `help_requested` (le bouton help n'existe pas), donc la colonne « sources d'aide » du dashboard reste vide en pratique. Aucun test end-to-end de la boucle complète (joueur → IA → moteur → replay → analytics). Aucun système de version des scenarios : si tu changes un critère, les anciens replays référencent un id qui n'existe plus.

Suite de la lecture : chaque chantier ci-dessous détaille les livrables **puis** les failles connues. Un bloc « failles transverses » couvre les problèmes qui touchent les trois. Une section finale propose 5 priorités pour lever ces failles.

---

## Chantier W — Sévérité pédagogique

### Ce qui a été livré

Un vocabulaire déclaratif à 4 niveaux qui remplace la binarité booléenne :

- **`critical`** : erreur rédhibitoire. Observed=true déclenche un échec immédiat qui court-circuite toute autre règle.
- **`required`** : compétence obligatoire (comportement du E-chantier initial).
- **`bonus`** : excellence facultative. Ajoute au score sans être exigée.
- **`minor`** : détail de forme, faible poids dans le score.

L'exemple du PO — « divulguer un secret industriel = échec immédiat » — devient concrètement une ligne de JSON :

```json
{ "id": "secret_divulgue", "description": "Le joueur a divulgué…", "severity": "critical" }
```

Le moteur `applyPhaseObservation` évalue les criticals en premier. S'il y en a un déclenché, il retourne immédiatement `{ passed: false, appliedRule: "critical_failure", criticalFailures: [...] }` sans regarder le reste. La vue admin replay affiche une bande rouge en tête de rapport quand ça arrive, avec l'id du critère fautif.

Un guide créateur (`docs/SEVERITY_GUIDE.md`, ~250 lignes) explique quand utiliser chaque niveau, avec des exemples par domaine métier (vente, management, recrutement, support). Trois garde-fous automatiques dans `validate:scenarios` empêchent les incohérences (référence critique à un id inconnu, mismatch entre severity du critère et déclaration côté rules, phase sans chemin d'échec).

### Failles identifiées

**Aucun scenario en prod n'utilise `critical` aujourd'hui.** Le mécanisme est là, testé unitairement, mais jamais exercé en conditions réelles. Il y a un risque non-zéro que la première utilisation en prod révèle un bug d'intégration (interaction avec les completion_rules legacy, avec la persistance evaluation_history, avec le bridge `phase_evaluation_passed_<id>`). Il faut migrer au moins un scenario avec un vrai critère critique métier pour lever ce risque.

**Le typage des 3 pilotes a été fait par heuristique automatique, pas par expertise pédagogique.** Le script a pris les 2 premiers critères de chaque phase comme `required` et le reste comme `bonus`. C'est cohérent structurellement mais pas forcément juste pédagogiquement. Un vrai concepteur qui connaît le métier doit relire et retyper. Sans ça, la sévérité affichée dans le replay est peu fiable.

**Le prompt IA ne connaît pas la sévérité.** Quand `/api/chat` envoie les observed_criteria à l'IA, il envoie seulement id + description, jamais severity. L'IA observe true/false comme avant sans savoir qu'un critère est critique. Ça pourrait mécaniquement améliorer la qualité de l'observation si le prompt indiquait « ce critère est critique, sois particulièrement attentif à ne pas le déclencher à tort ».

**Les poids severity-derived sont arbitraires** (required=2, bonus=1, minor=0.5, critical=0). Pas d'ajustement par domaine métier possible sans écrire un `weight` explicite sur chaque critère. Si un jour on constate que ces valeurs par défaut biaisent les scores dans un secteur, il faudra une deuxième couche de config.

**La sémantique `expected: false` combinée avec `severity: "critical"` n'a pas été pensée.** Aujourd'hui un critical fire quand observed=true (peu importe expected). C'est cohérent avec « le joueur a fait quelque chose de mal », mais empêche d'exprimer « le joueur n'a pas fait ceci de critique qu'il aurait dû faire ». Cas d'usage rare mais réel (ex : « le joueur n'a pas vérifié l'identité avant de partager les données »).

**Introduire un vocabulaire nouveau côté créateur = risque de mauvais usage massif.** Si le guide n'est pas lu, on va voir apparaître des scenarios avec 5 `critical` et 0 `required`, ou l'inverse. Il n'y a pas de garde-fou qui alerte sur des ratios de sévérité suspects (trop de critical, aucun required, etc.).

---

## Chantier X — Replay actionnable

### Ce qui a été livré

Deux briques concrètes en plus du replay individuel existant :

**Vue agrégée cross-campaign** à `/admin/replay/scenario/[scenarioId]`. Pour un scenario donné, elle scanne toutes les campagnes existantes et affiche :

- Par phase : nombre de tentatives, taux de complétion, taux de fail critique
- Par critère : match rate coloré (rouge si <20%, orange si <50%, vert si >80%)
- Les 50 dernières campagnes avec drilldown vers le replay individuel

C'est exactement le pattern que le PO décrivait : « 80% ratent toujours le même critère » se lit désormais en 3 secondes.

**Lien « voir les N dernières parties »** en tête de chaque phase du replay individuel — un clic pour passer du particulier au général.

**Lien « éditer ce critère »** sur chaque ligne critère du replay individuel — ouvre le studio avec le scenarioId + phaseId + criterionId en query string.

### Failles identifiées

**Le lien « éditer ce critère » est un lien de façade.** Il pointe vers `/studio?scenario=X&phase=Y&criterion=Z` mais **le studio ne consomme pas ces query params aujourd'hui**. Cliquer ouvre la page d'accueil du studio, pas le critère précis. C'est un TODO déguisé qu'il faut lever côté studio pour que la promesse tienne. Le concepteur qui clique va être frustré.

**`listAllCampaignIds()` lit `data/founder/campaigns/*.json` directement.** C'est un accès filesystem hors du module founder, ça viole l'encapsulation et ça ne survivra pas à une migration vers une vraie base de données ou à un déploiement multi-instance (chaque instance ne verrait que ses propres fichiers). C'est acceptable en mono-serveur mais c'est une bombe à retardement.

**Aucune pagination sur les 50 dernières campagnes.** À 20 utilisateurs actifs par jour, on tient. À 1000, chaque ouverture de la vue scenario charge tout en RAM, agrège tout, renvoie tout au front. Il faudra pré-calculer les métriques par batch (ex : agrégation nocturne) avant de scaler.

**Aucun cache** sur l'endpoint scenario. 50 disk IO à chaque page load, plus l'agrégation. Sur un dashboard qu'on rafraîchit toutes les 30 secondes, ça devient coûteux.

**Pas de dry-run** (feature X3 initialement listée mais non livrée). Le PO parlait de « rejouer une partie » — aujourd'hui on peut la voir, pas la ré-évaluer avec une règle modifiée. C'est le vrai chaînon manquant du cockpit d'édition.

**Data model fragile pour l'agrégation cross-campaign** : `evaluation_history` vit dans le deep snapshot côté client, poussé au serveur toutes les 10 secondes. Si un joueur perd sa session avant sauvegarde (crash navigateur, fermeture immédiate après une évaluation), les métriques d'agrégation manquent cet événement. Il faudrait que le serveur écrive `evaluation_history` directement à réception de `/api/chat`, en plus du deep snapshot.

**Le scanning cross-campaign ne concerne que les campagnes founder mode.** Les sessions hors campagne (scenarios one-shot lancés depuis /scenarios/) ne sont pas indexées dans `data/founder/campaigns/`. Elles n'apparaissent pas dans la vue agrégée. C'est une invisibilité complète d'une partie du trafic.

---

## Chantier Y — Télémétrie pédagogique

### Ce qui a été livré

Trois nouveaux événements standardisés dans le bus `gameEvents` existant :

- `phase_evaluated` — émis après chaque `applyPhaseObservation()`, payload = observation IA + verdict moteur
- `help_requested` — pour un futur bouton d'aide, source déclarative
- `scenario_abandoned` — pour distinguer les fins naturelles des abandons

Un reader (`app/lib/gameEvents/reader.ts`) qui scanne tous les JSONL et calcule 4 slices d'agrégation :

- Par phase : attempts, abandonments, completions, critical failures, durée moyenne
- Par critère : match rate calculé sur toutes les campagnes
- Par scénario : sessions, completions, taux
- Par help source : occurrences

Un endpoint `/api/admin/analytics` et une page `/admin/analytics` avec 6 sections répondant aux 6 questions du PO. Chaque section a un tri automatique et un seuil minimum (3 tentatives) pour éviter les faux positifs sur les tout premiers événements.

### Failles identifiées

**Aucun test unitaire sur `reader.ts` + `computeAnalytics()`.** C'est ~180 lignes de code d'agrégation complexe (des `Map` imbriquées, des rate calculations, des filtres). Bugs de calcul possibles et non détectés. À prioriser : au moins un test de bout en bout qui produit un JSONL synthétique et vérifie les 4 slices.

**Aucun garde-fou télémétrie.** Les autres chantiers ont des garde-fous automatiques (deprecation gate, coverage tests). La télémétrie n'en a pas. Si quelqu'un renomme `phase_evaluated` en `phase_eval` dans le writer, l'endpoint et le dashboard cassent silencieusement — les nouveaux events sont ingérés mais le reader ne les compte pas, sans erreur visible.

**`help_requested` n'est jamais fired en réel.** Le bouton d'aide n'existe pas encore côté player. La colonne « Sources de demandes d'aide » du dashboard reste vide en pratique. C'est de l'infrastructure prête pour un besoin futur, pas un livrable actionnable aujourd'hui.

**« Personnages mal compris » (question 4 du PO) n'est pas mesurable avec les events actuels.** Le signal proposé (re-envois de messages sur un même contact) n'est pas tracké. Il faudrait un event `player_message_retried` qui compare le message actuel au précédent adressé au même actor, avec un seuil de similarité. Ce n'est pas fait.

**Perf : scan complet des JSONL à chaque requête.** Aujourd'hui c'est instantané parce que les fichiers sont petits (quelques centaines d'événements). À 100k événements, la page mettra plusieurs secondes à charger. Pas d'index sur les fichiers, pas de résumé pré-calculé, pas d'écriture d'un cache d'agrégation. Il faudra un job d'agrégation périodique.

**Aucune rétention ni rotation** des fichiers JSONL. Un fichier par session, jamais supprimé. À 100 sessions/jour, ça fait 36k fichiers/an. Ni un souci disque immédiat, ni un pattern durable.

**Pas de filtres UI** (Y5 initialement listé, pas livré). Le dashboard montre tout depuis le début des temps. Impossible de zoomer sur « la semaine dernière » ou « les scenarios founder uniquement ». C'est la première extension à faire pour rendre le dashboard exploitable au quotidien.

**Pas d'export CSV** (Y6 non livré). Impossible de faire une analyse externe (Excel, BI tool). Blocage pour tout usage sérieux au-delà de la lecture en direct.

**Pas de rapport hebdomadaire automatique** (Y7 non livré). Le PO doit venir voir le dashboard. Pas de push, pas d'alerting. Un « ce critère est passé de 60% à 15% de match rate » ne remontera pas tout seul.

**Sécurité / PII :** l'endpoint `/api/admin/analytics` retourne les events tels quels. Les payloads d'événements comme `player_message` contiennent du texte utilisateur brut qui peut contenir des noms, emails, numéros de téléphone. Le dashboard ne les affiche pas, mais l'endpoint les expose au super_admin. Il n'y a aucun mécanisme d'anonymisation ou de rétention limitée sur les données personnelles. Pas bloquant à ton échelle actuelle mais à traiter avant que revealio.live scale.

---

## Failles transverses (touchent les trois chantiers)

**Aucun test end-to-end** de la boucle complète : joueur envoie message → IA renvoie phase_observation → moteur applyPhaseObservation décide → session.evaluation_history persisté → deep snapshot sauvegardé → replay admin affiche correctement → analytics agrège la donnée. Chaque brique est unit-testée, mais l'intégration n'est validée qu'à l'œil (à condition qu'un vrai scenario migré tourne en vrai en prod). Il manque un test Playwright ou un script curl E2E qui simule le flow complet et vérifie que la donnée arrive au bon endroit.

**Migration progressive incomplète.** Sur les 10 scenarios actifs, seuls 3 sont E+W-migrés. Les 7 autres tournent en mode legacy `any_flags` / `max_exchanges` — pas cassé, mais pas explicable côté replay non plus. Aucun plan de migration daté pour couvrir le reste.

**Aucun mécanisme de version des scenarios.** Si un concepteur change les ids ou les descriptions des critères d'un scenario, les entrées `evaluation_history` déjà persistées référencent des critères qui n'existent plus. Le replay admin va afficher « (Aucun contrat evaluation.observed_criteria retrouvé pour ce critère) ». Les historiques ne sont donc pas rejouables dans le temps si le scenario évolue. Ni versioning JSON, ni migrations schémas, ni snapshot du contrat au moment de l'évaluation.

**Cohabitation legacy/E-chantier dans le même prompt IA.** L'`evaluationPromptE` ajoute un bloc `phase_observation` au prompt existant qui demande aussi `matched_criteria`. Le modèle doit produire deux formats de sortie simultanément. Aucune évaluation AB testée que ça ne dégrade pas la qualité des `matched_criteria` legacy. Risque de régression silencieuse sur les scenarios non-migrés.

**Aucun mécanisme d'A/B testing** entre deux versions d'un critère (l'idée « modifier ce critère et voir si le taux change » du PO). Il faudra à minima horodater les changements de contrat scenario pour pouvoir comparer « avant modif / après modif ». Aujourd'hui rien de tel.

**Charge JSONL scannée séquentiellement à chaque requête** (dashboard analytics ET vue cross-campaign replay). Aucun cache, aucun index, aucun pré-calcul. Fonctionne à 100 sessions cumulées, cassera à 10k.

---

## Métriques de qualité

| Métrique | Valeur |
|---|---|
| Tests unitaires ajoutés (W) | 8 sur le moteur severity + 8 sur checkEvaluationCoverage |
| Tests unitaires ajoutés (X + Y) | **0** — dette technique explicite |
| Suite complète après livraison | 180 tests passants sur 19 fichiers |
| Scénarios actifs validés | 10 sur 10 |
| Scénarios W-typés (sévérité déclarée) | 3 sur 10 (via heuristique auto, à réviser manuellement) |
| Erreurs TypeScript | 0 |
| Codes d'erreur `validate:scenarios` ajoutés (W5) | 3 (`EVAL_CRITICAL_NOT_DECLARED`, `EVAL_CRITICAL_SEVERITY_MISMATCH`, `EVAL_NO_FAIL_PATH`) |
| Nouvelles pages admin | 2 (`/admin/replay/scenario/[id]`, `/admin/analytics`) |
| Nouveaux endpoints API | 2 |
| Nouveaux types d'events télémétrie | 3 (dont 2 non émis en réel aujourd'hui) |

---

## Cinq priorités recommandées pour la suite

Classées par ratio impact/effort décroissant.

**1. Rendre le lien « éditer ce critère » fonctionnel** (~1 session).
Actuellement c'est un lien mort. Consommer `?scenario=X&phase=Y&criterion=Z` côté studio pour scroller au bon endroit + surligner le champ. Sans ça, tout le narratif « cockpit de création » est un mensonge d'interface.

**2. Ajouter des tests sur `computeAnalytics()`** (~1 session).
Le code d'agrégation est complexe et non testé. Un JSONL fixture + assertions sur les 4 slices lève 90% du risque de bugs silencieux. À faire avant toute évolution du dashboard.

**3. Migrer un scenario avec un critère `critical` réel** (~1 session).
Le mécanisme n'a jamais tourné en vrai. Choisir un scenario où « le joueur a fait X = échec immédiat » a un vrai sens métier (S5 avec HARD_REJECT est un candidat idéal), le migrer, jouer une partie qui déclenche le critical, valider dans le replay et l'analytics.

**4. Écrire evaluation_history server-side directement** (~2 sessions).
Aujourd'hui c'est côté client, sauvegardé toutes les 10s dans le deep snapshot. Une session qui crashe avant sauvegarde perd la donnée. `/api/chat` a déjà toutes les infos nécessaires — il devrait écrire directement dans une store dédié (JSONL analogue à `game_events`, ou table). Fixe le fragile data model X + rend l'agrégation cross-campaign fiable pour tous les modes de jeu (pas juste founder).

**5. Ajouter les filtres UI au dashboard analytics** (~1 session).
Sans filtre période / scenario / cohorte, le dashboard est illisible dès qu'il y a 20 scenarios ou 3 mois d'historique. C'est la première extension qui rend l'outil utilisable au quotidien plutôt que juste démontrable.

Ce qui n'est **pas** dans le top 5 mais reste important à moyen terme : versioning des contrats scenario, mécanisme d'A/B testing, rapport hebdo automatique, anonymisation PII, cache/index pour la perf, rotation des JSONL, éviction du fake `help_requested` non implémenté côté joueur.

---

## Points d'attention pratiques pour le PO

**La vue `/admin/analytics` est prête mais vide de vraie donnée.** Aucun scenario W-typé n'a tourné en prod entre la livraison et maintenant. Les métriques que tu verras sont majoritairement des zéros ou des « pas assez de données ». Pour tester en conditions : joue au moins 5 fois le scenario `client_qui_hesite` avec des variations de qualité de réponse, puis reviens sur le dashboard.

**Le lien « éditer ce critère » ne fonctionne pas encore.** Si tu cliques, tu tomberas sur la page d'accueil du studio. C'est un TODO connu (priorité 1 ci-dessus).

**Les 3 scenarios pilotes ont une sévérité auto-typée, pas humaine.** Avant de communiquer sur « chaque critère a sa sévérité pédagogique », relis les 3 scenarios et ajuste manuellement. Le typage `bonus` en particulier a été appliqué aux critères 3+ de chaque phase sans discernement — certains devraient probablement être `required` s'ils sont fondamentaux pour la compétence évaluée.

**Aucun scenario n'utilise `critical` aujourd'hui.** Si tu veux prouver la valeur pédagogique du concept (« divulgation de secret = échec immédiat »), il faut choisir un scenario où l'exemple métier est fort et le migrer. Prio 3 ci-dessus.

**Le dashboard analytics ne remonte rien de manière proactive.** C'est un pull, pas un push. Tant qu'il n'y a pas de rapport hebdo automatique (Y7 non livré), tu dois te rappeler d'aller voir la page toi-même.
