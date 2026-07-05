# Revealio — Analyse d'architecture v3 (« poste de travail »)

Document de référence produit le 5 juillet 2026. Il analyse l'intégralité de l'architecture de la version actuelle et reprend les travaux des trois derniers jours (3–5 juillet 2026). Objectif : donner une vue exhaustive et critique de l'état du système, de ses invariants, de ses forces et de sa dette.

---

## 1. Résumé exécutif

En trois jours, Revealio a changé de paradigme. On est passé d'un **player v2** (une séquence de mécaniques, chacune avec son composant plein écran) à un **poste de travail immersif v3** : le joueur évolue dans un environnement unique — Messages, Mail, Documents, Bloc-notes, Decision Engine, tableau blanc — et les « mécaniques » deviennent des **capacités du moteur sans aucune UI** qui se contentent d'*observer* ce que le joueur produit dans cet environnement. Le player v2 a été purgé (−9 800 lignes au commit de bascule).

La thèse architecturale tient en une phrase : **l'IA observe, le moteur décide, l'interface ne fait que dispatcher des actions**. Tout le reste en découle — la pureté des couches, la journalisation intégrale, le déterminisme des fins de phase, et l'analyse post-partie écrite à 100 % par l'IA sans jamais exposer la machinerie au joueur.

Chiffres actuels : ~28 400 lignes sous `app/lib/engine` + `app/workspace` + `app/mechanics`, 39 fichiers de test (450 tests verts), 20 scénarios v3 validés, 13 mécaniques headless, 8 Tools, 5 apps.

---

## 2. Les quatre couches et leur découplage

L'architecture est stratifiée, et le découplage entre couches est **testé par des garde-fous** (pas seulement documenté). C'est la propriété la plus importante du système : elle est ce qui a permis d'ajouter deux mécaniques et une feature transverse en un jour sans rien casser.

**Couche 1 — le moteur** (`app/lib/engine/`). Pur, node-safe, zéro React, zéro I/O. Il connaît l'état du workspace, les actions, les triggers, les mécaniques (par leur *manifest* seulement). Il ne connaît **aucun** Tool concret : il reçoit un `ToolOpApplier` en paramètre. Fichiers : `workspace.ts` (types + union d'actions fermée), `workspaceReducer.ts` (dispatch → journalisation → mutation → effets → verdict), `triggers.ts` (évaluation des triggers de complétion), `composerV3.ts` (validation des scénarios), `sessionV3.ts` (cycle de vie de session, routage d'exits), `criteria.ts` (application des observations en verdict).

**Couche 2 — les mécaniques headless** (`app/mechanics/`). Pures aussi. Une mécanique = un `MechanicSpec` : `manifest` + `directive(params)` (le prompt scoping des acteurs) + `buildArtifacts()` (ce que l'IA observe) + `buildOutput()` (ce qui alimente `inputs_from`) + `validateParams()`. **Aucun `.tsx` sous `app/mechanics/`** — c'est un garde-fou. Une mécanique n'a pas d'écran : elle lit le workspace via `specHelpers.ts` et rend du JSON.

**Couche 3 — les Tools** (`app/workspace/tools/`). Chaque Tool est un module autonome `spec.ts` (pur) + `model.ts` (reducer pur des `tool_op`) + `api.ts` (constructeurs d'ops + sélecteurs purs) + composant(s) React. Un Tool **ne connaît aucune mécanique ni aucun scénario** : il reçoit `{ state, config, dispatch }`. Sa seule ouverture vers le moteur est `describeForObservation(state)` — un résumé neutre pour l'IA — et son `applyOp` (reducer de `tool_op`).

**Couche 4 — les apps UI** (`app/workspace/apps/` + `WorkspaceShell`). Les fenêtres du poste de travail : Messages, Mail, Documents, Bloc-notes, Decision Engine. Elles reçoivent `WorkspaceAppProps` (l'état, `dispatch`, `openApp`) et ne portent **aucune logique moteur**. Le shell (`WorkspaceShell`) monte le rail d'apps, le ChatDock flottant, le chrono visible et les toasts.

Le sens des dépendances est strict et unidirectionnel : UI → Tools/moteur → (rien). Le moteur ne remonte jamais vers l'UI ; les mécaniques ne descendent jamais vers les Tools concrets. **C'est cet invariant qui a été violé puis rétabli** le 5 juillet quand planification/facilitation importaient les API des Tools (voir §5 et §11).

---

## 3. Le moteur v3 : tout est action, tout est observable

Le cœur (`CONTRAT_WORKSPACE.md §2`) repose sur une **union d'actions fermée** (`WorkspaceAction`) : toute interaction du joueur — envoyer un message, un mail, ouvrir un document, muter un Tool, joindre un artefact — passe par une action typée. Le reducer, pour chaque action :

1. **journalise** dans `session.actionLog` **avant tout effet** (l'observabilité est native, pas ajoutée après coup) ;
2. **applique** l'action à l'état (mutations locales, l'appelant clone) ;
3. **collecte** les effets narratifs (events `after_action`/`delay`, réponses d'acteur IA) ;
4. **évalue** le trigger de complétion du step.

Le moteur *rend* des `PendingEffect` ; l'orchestrateur (côté WorkspacePlayer) les *exécute* (les I/O IA), puis réinjecte les contenus produits. Le moteur lui-même reste pur et testable sans réseau.

**Triggers déclaratifs.** La fin d'une phase n'est jamais un jugement IA : c'est un fait observable déclaré en JSON — `mail_sent` (livrable remis), `message_sent` (seuil de volume), `timer_elapsed` (chrono, avec chrono visible dérivé), `mail_scored` (scoring IA à seuil, chantier C), ou une composition `all`/`any`. Le 4 juillet, tous les scénarios cpo ont été rendus **déterministes** : l'IA ne juge plus que gagné/perdu *après* la fin. C'est une décision de conception forte et cohérente — le joueur ne peut pas être « bloqué » par un modèle non déterministe.

**Routage.** `§4bis` a introduit les `exits` déclaratifs (goto + reset + anti-boucle), `§4ter` les acteurs dynamiques (`bind_actor`), `§4quater` le scoring à seuil jamais affiché, `§4quinquies` le timer visible. L'ensemble est validé statiquement par `composerV3.ts` (moteur) et par `scripts/validate-scenarios-v3.mjs` (parité CLI, qui relit `schema/mechanics-v3.json` car il ne peut pas importer du TS).

---

## 4. Les mécaniques headless

Registre : `app/mechanics/specs.ts` (`MECHANIC_SPECS` + `MECHANIC_SPEC_MANIFESTS`), synchronisé avec `schema/mechanics-v3.json`. La synchro (ids, manifests, pureté, `output_keys`, validation des params) est vérifiée par `app/mechanics/__tests__/specs.headless.test.ts`.

Treize mécaniques : `analyse`, `decision`, `diagnostic`, `entretien`, `feedback`, `formation`, `mediation`, `negociation`, `presentation`, `production`, `qa`, et — réintégrées le 5 juillet — `planification` et `facilitation`.

**`planification`** observe l'organisation de l'exécution (le joueur mobilise Decision Engine + Bloc-notes, mais la mécanique n'observe que le plan *formalisé* par mail et les notes). **`facilitation`** est la deuxième mécanique multi-acteurs après `mediation` : N acteurs IA dans le même fil Messages, animation d'un collectif, output `{ dialogue, outcomes }` avec `outcomes.productive` piloté par le critère conventionnel `reunion_productive`. Point d'architecture décisif : ces deux mécaniques ont d'abord été écrites en important les API des Tools — ce qui **violait l'invariant d'indépendance** (garde-fous rouges) — puis réécrites pour n'observer que ce que le joueur formalise. L'introspection fine des Tools appartient au collecteur de débrief, pas à la mécanique (voir §7).

**`qa` est en dépréciation programmée.** Elle reste au registre tant que 4 scénarios live l'utilisent (`cpo_qa`, `founder_00_cto`, `founder_01_incubator`, `vitrine_signer_le_pilote`), mais elle doit devenir un *pattern transversal* (un acteur pose une question → le joueur répond → l'observateur évalue → la mécanique parente tranche), réutilisable par `presentation`/`facilitation`/`entretien`/`negociation`.

`specHelpers.ts` est la boîte à outils partagée des mécaniques : lecture du transcript, des mails envoyés, des notes, de la dernière formalisation — **sans jamais importer un Tool** (elle lit les champs des actions journalisées, du texte).

---

## 5. Les Tools transversaux

Huit Tools : `notes` (micro-outil legacy, retiré de l'expérience), `contrat`, `editeur`, `reunion`, `bloc-notes`, `bibliotheque`, `decision-engine`, `whiteboard`.

Trois d'entre eux sont **transversaux et non réinitialisables** (`NON_RESETTABLE_TOOLS = bloc-notes, bibliotheque, decision-engine`) : ils appartiennent au joueur, persistent d'une phase à l'autre, et **aucune mécanique ne peut les importer, lire leur état, ni les épingler en `default_tools`**. Cet invariant est protégé par quatre fichiers de garde-fous distincts (un par Tool + un global). C'est délibéré : le carnet, la bibliothèque et le moteur de décision sont l'espace de travail personnel, pas un accessoire d'une mécanique donnée.

**Bloc-notes universel** (`TOOL_BLOC_NOTES.md`) : notes à blocs hiérarchiques, tâches, Kanban, base de données, **mind map intégrée à la note** (bascule Éditer/Mind map, reparentage par glisser-déposer avec anti-cycle), annotations depuis Messages/Mail/Documents, marqueur 📓 au survol. 13 ops `tool_op`.

**Gestionnaire documentaire** (`TOOL_GESTIONNAIRE_DOC.md`) : auto-index, dossiers/tags/tris, recherche plein texte, lecteur augmenté (surlignage via CSS Highlight API, commentaires, signets, extraction vers Bloc-notes), **bureaux personnalisés** (déposer des docs dans une boîte, tout ouvrir en grille), bureau multi-fenêtres. 23 ops.

**Decision Engine** (`TOOL_DECISION_ENGINE.md`) : le Tool le plus riche. Un *Decision Object* (ADR-like : options, critères, matrice de scores, hypothèses, risques enrichis prévention/guérison/résiduel) et **six moteurs de tableaux** (matrix, registry, table, kanban, timeline, graph) avec presets (MoSCoW, BMC, PESTEL, Eisenhower, roadmap, waterfall, Ishikawa, 5 Pourquoi…). Dépendances *many-to-many* entre décisions et tableaux (mère-fille orientée, sœur symétrique, anti-cycle), rail en arborescence avec reparentage au drag & drop. C'est ce Tool qui couvre, à lui seul, agenda/timeline/RACI/registre de risques — il n'y a pas de Tool « agenda » séparé.

**Tableau blanc** : post-it colorés (glisser-déposer, auteur joueur/IA), support du brainstorming.

Le contrat `tool_op` (`§2`) est la clé de l'extensibilité : le moteur journalise une op opaque (`note_created`, `board_reparented`…) et la fait appliquer par le reducer pur que le Tool a enregistré. **Le moteur n'a aucune connaissance des ops** — un nouveau Tool s'ajoute sans toucher au cœur.

---

## 6. La couche UI

`WorkspaceShell` orchestre le rail d'apps (raccourcis ⌘⌥1-5), le ChatDock flottant style Messenger, le chrono visible (dérivé du premier `timer_elapsed` du step), et les toasts (jamais sur le contenu déjà regardé, auto-dismiss 3 s). Les apps (`APP_REGISTRY`) sont montées exclusivement via ce registre — un garde-fou vérifie sa complétude et restreint ce que les apps hôtes peuvent importer des Tools (seuls les composants façade `AnnotateButton`/`NoteMarker`/`ArchiveButton` sont permis, jamais `api/model/spec`).

Le rendu markdown (`primitives/Markdown.tsx`) est partagé par les documents et les mails ; il vient d'être étendu pour intercepter les liens `artifact://` (voir §8).

---

## 7. Le débrief unifié écrit par l'IA

C'est l'un des chantiers les plus retravaillés (une refonte complète après un premier essai par mécanique). Le principe, non négociable : **le joueur n'est jamais informé des mécaniques, des phases ou des outils d'analyse**. Le scénario entier — même multi-phases — est analysé comme un **bloc unique**, par une seule passe IA, et rendu en un graphe araignée de compétences + un récit + des exemples. Les outils d'analyse non utilisés **disparaissent silencieusement** : aucune pénalité, aucune trace. Non-transparence totale vers le joueur.

Pipeline : `collect.ts` (extrait des *signaux* internes du workspace — conversation, documents, décisions, livrable, parole, négociation, plan, idées) → `/api/v2/debrief-final` (une passe `gpt-4.1-mini`, dont le prompt système interdit explicitement de mentionner « mécanique / phase / outil d'analyse ») → `DebriefView.tsx` (radar + narration) + `ScenarioDebrief.tsx` (auto-exécution au montage, persistance). Persistance via `gameHistory.ts` (localStorage) : le joueur peut **rouvrir n'importe quel bilan** depuis son espace perso (`/debriefs/[id]`).

`analysisTools.ts` est une **couche de mapping interne** `mechanic_id → analysis_tools[]` (id, titre, description, données nécessaires, affichage débrief/replay, statut V1/V2/non-implémenté), issue de neuf spécifications d'outils d'analyse. Elle est **strictement interne** : elle documente ce que chaque outil observe et alimente la passe IA ; elle n'est jamais exposée au joueur. Le *replay* n'existe pas encore (statut « non-implémenté » assumé).

Cohérence avec l'invariant : `collect.ts` vit sous `app/lib/debrief/` (hors `app/mechanics/`), il **a donc le droit** de lire l'état des Tools transversaux. C'est là — et pas dans les mécaniques — que se fait l'introspection fine (décisions produites, jalons, idées).

---

## 8. La feature du jour : joindre un artefact à un email

Besoin : sur chaque note, mind map, décision, tableau et tableau blanc, un bouton **📎 Joindre à l'email** insère dans le mail un lien cliquable qui ouvre l'artefact in-app, et dont le **contenu intégral entre dans l'analyse de l'IA**. Ce mécanisme donne, aux phases qui finissent par un mail, une vue exhaustive de ce que le joueur a réellement produit.

L'architecture retenue préserve tous les invariants :

- **Snapshot figé à l'envoi.** Le contenu de l'artefact est sérialisé exhaustivement (`app/workspace/artifacts/serialize.ts`) au moment du `mail_sent`, à partir de l'état vivant du Tool, et gravé dans le mail comme du **texte**. Conséquence : ni le moteur ni les mécaniques ne lisent jamais un Tool — le snapshot voyage dans l'action. C'est déterministe et sémantiquement juste (on juge le livrable tel que remis).
- **Le lien vivant** (`artifact://<tool>/<id>?kind=…`, `app/lib/engine/artifactLink.ts`) est intercepté par le rendu markdown et ouvre l'artefact via `openApp` (Bloc-notes sur la note, Decision Engine sur la décision/tableau). Le tableau blanc n'a pas d'app plein écran : son lien reste lisible via le snapshot mais n'ouvre rien (limite connue).
- **Action dédiée.** Le bouton (dans les Tools, qui n'ont que `dispatch`) émet `artifact_attached_to_mail` ; le reducer insère le lien dans le brouillon et enregistre la référence (déduplication). C'est le chemin d'extension sanctionné (l'union d'actions), pas un contournement.
- **Injection dans l'analyse à deux endroits** : `specHelpers.lastFormalisation` (évaluation de step) et `collect.ts` (débrief), tous deux concaténant les snapshots — sans importer de Tool.

Modules ajoutés : `serialize.ts`, `artifactLink.ts`, `AttachToMailButton.tsx`, extensions de `workspace.ts`/`workspaceReducer.ts`/`MailApp.tsx`/`Markdown.tsx`/`specHelpers.ts`/`collect.ts`. 16 tests dédiés.

---

## 9. Scénarios et validation

20 scénarios v3, tous validés (`validate-scenarios-v3.mjs`). Le chargement est **100 % dynamique** par le système de fichiers (`app/lib/scenarios.ts` lit `scenarios/*/scenario.json`) : un nouveau scénario est jouable via `/play/<id>` sans enregistrement manuel. Deux scénarios de test ont été ajoutés le 5 juillet — `cpo_planification` (fin sur `mail_sent`) et `cpo_facilitation` (réunion de 5 min, fin sur `timer_elapsed`, chrono visible) — pour éprouver les deux mécaniques réintégrées.

Double validation : le moteur (`composerV3.ts`) et le CLI (`.mjs`) vérifient la même chose de deux façons, plus `validate-founder.mjs` qui contrôle la cohérence endings ↔ `founder_rules.json`.

---

## 10. Les garde-fous (l'armature de qualité)

Cinq fichiers de garde-fous encodent les invariants sous forme de tests exécutables — c'est ce qui rend l'architecture *tenable* dans le temps :

- pureté des couches pures des Tools (spec/model/api : zéro React, zéro import moteur hors types Json) ;
- indépendance Tool ↔ mécanique (les 3 Tools transversaux jamais importés/lus/épinglés par `app/mechanics` ni par un scénario) ;
- pas de `.tsx` sous `app/mechanics/` ;
- synchro registre TS ↔ schéma JSON des mécaniques ;
- restriction des imports des apps hôtes (façades uniquement).

Ces tests ne sont pas décoratifs : ils ont **attrapé une vraie régression** le 5 juillet (mécaniques couplées aux Tools) avant tout déploiement.

---

## 11. Chronologie des trois jours

**3 juillet — fondations v3.** Contrat Workspace/Tool/Mechanic, moteur pur (reducer/triggers/composer/sessionV3), pilote founder_02, passe de fidélité du contenu Orisio, refonte admin/catalogue.

**4 juillet — la grande bascule.** Migration des 18 scénarios sur le poste de travail et purge du player v2 (−9 800 lignes). Généralisation du workspace (ChatDock, 11 specs headless, garde-fous). Exits/routage/scoring/timer déclaratifs. Construction des grands Tools : Bloc-notes universel, Gestionnaire documentaire (4 tranches), Decision Engine (Lots A→E : Matrix, Registry, Table, Kanban, Timeline, Graph), tableau blanc, bureaux personnalisés. Fins de scénario rendues déterministes.

**5 juillet — analyse et raffinement.** Enrichissement du Decision Engine (risques prévention/guérison/résiduel, dépendances many-to-many, arbre reparentable). Marqueur 📓 des notes attachées. Neuf analyses de débrief par mécanique, **puis pivot** vers le débrief unifié IA + persistance (et suppression du code mort par mécanique). Réintégration de planification/facilitation (violation d'invariant → correction). Couche `analysisTools`. Deux scénarios de test. Feature « joindre un artefact au mail ».

---

## 12. Dette technique et points de vigilance

Analyse critique — ce qui reste fragile ou inachevé :

**`qa` toujours de premier rang.** Sa dépréciation est décidée mais non exécutée : 4 scénarios live doivent d'abord migrer vers leur mécanique parente. Tant que ce n'est pas fait, le registre porte une mécanique destinée à disparaître.

**Le tableau blanc n'est pas une app plein écran.** C'est un panneau d'outil ; son lien d'artefact dans un mail ne peut donc pas « ouvrir » quoi que ce soit. Le contenu est bien analysé (snapshot), mais l'ouverture in-app est incohérente avec les autres artefacts. À traiter en faisant du whiteboard une vraie app du dock.

**Troncature du débrief.** `collect.ts` plafonne le livrable à ~4 000 caractères quand il porte des artefacts, pour ne pas faire exploser le prompt IA. L'évaluation de step, elle, reçoit le contenu non tronqué. Si l'exhaustivité au débrief devient critique, il faudra une stratégie de résumé plutôt qu'une coupe.

**`set-state-in-effect`.** Un pattern « sélection pilotée par navigation entrante » (BlocNotesApp, DecisionEngineApp) déclenche la règle react-hooks au niveau CLI. Il est toléré par le build (il ship sur `main`), mais c'est une dette de conformité à surveiller.

**Export PDF de `/history`.** Il attend l'ancien schéma de débrief (pré-unification) — à adapter ou retirer.

**Le replay n'existe pas.** La couche `analysisTools` le prévoit (statut « non-implémenté »), mais aucun composant ni route ne l'implémente. C'est un chantier à part entière.

**Déploiement manuel.** Push GitHub + `ssh … deploy.sh` (pull → build → pm2, avec gate final SHA servi = SHA attendu). Pas de CI qui lance les tests avant déploiement : `deploy.sh` ne fait que builder. Un incident du 5 juillet (commit d'archi cassé poussé sur `main`, garde-fous rouges mais build vert) illustre le risque — **il faudrait faire tourner `vitest` dans le pipeline de déploiement**, pas seulement `next build`.

---

## 13. Métriques

| Indicateur | Valeur |
|---|---|
| Lignes (`engine` + `workspace` + `mechanics`) | ~28 400 |
| Fichiers de test | 39 |
| Tests | 450 (verts) |
| Mécaniques headless | 13 |
| Tools | 8 (dont 3 non réinitialisables) |
| Apps du dock | 5 |
| Scénarios v3 | 20 |
| Moteurs de tableaux (Decision Engine) | 6 |
| Fichiers de garde-fous | 5 |

---

## 14. Jugement d'ensemble

L'architecture est **saine et remarquablement disciplinée** pour un rythme de trois jours. Sa force centrale — le découplage strict des couches, garanti par des tests et non par de la bonne volonté — est ce qui autorise l'ajout rapide de mécaniques, de Tools et de features transverses. Le principe « l'IA observe, le moteur décide » est appliqué avec cohérence jusqu'au bout, y compris dans le déterminisme des fins de phase et dans la non-transparence totale du débrief.

Les faiblesses sont périphériques et connues (qa, whiteboard-app, troncature, replay absent, pas de tests au déploiement), pas structurelles. Le principal risque n'est pas le code mais le **process de déploiement** : builder sans jouer les tests laisse passer des régressions que les garde-fous auraient attrapées. C'est le premier point à corriger.
