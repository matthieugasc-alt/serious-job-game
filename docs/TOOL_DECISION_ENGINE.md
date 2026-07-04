# Decision Engine — contrat d'architecture (Tool universel d'aide à la décision)

**Date** : 4 juillet 2026 · **Statut** : contrat proposé, EN ATTENTE DE VALIDATION PO.
**Modèle architectural** : `docs/TOOL_BLOC_NOTES.md` (référence de TOUS les Tools) et `docs/TOOL_GESTIONNAIRE_DOC.md`. Mêmes règles : couche pure `spec/model/api`, reducer pur enregistré, journalisation générique `tool_op`, façade publique, garde-fous CI, état sérialisable jamais réinitialisé. Le Decision Engine ne connaît NI le scénario, NI les mécaniques, NI le moteur : il structure le raisonnement du joueur, le moteur l'observe.

---

## 0. Principe directeur (ce qu'on construit, ce qu'on refuse)

Un **moteur générique de décision** = **6 moteurs visuels** + **des presets JSON** + un **objet métier central (Decision Object)**. Pas 20 outils codés séparément : chaque framework (SWOT, RACI, matrice multicritère, risk matrix…) est **une configuration déclarative** d'un des 6 moteurs. On ajoute un framework en ajoutant un fichier JSON, pas du code.

Refusé explicitement (rappel du brief PO) : 20 outils séparés ; un tableur géant ; toute logique décisionnelle dans `page.tsx` / le runtime / une mécanique ; une IA qui décide à la place du joueur ; un outil qui révèle les critères de scoring du scénario ; des frameworks figés.

**Garde-fou métier fondamental** : le Decision Engine est un outil d'**auteur**. Il ne lit jamais les critères d'évaluation du scénario, ne calcule jamais de « bonne réponse », n'affiche jamais de score caché. Le moteur observe le Decision Object produit via `describeForObservation` (résumé neutre, zéro évaluation) — exactement comme le Bloc-notes.

---

## 1. Synthèse des bonnes pratiques (recherche web, juillet 2026)

- **Matrice multicritère pondérée** : 4 à 8 critères maximum (moins = simpliste, plus = ingérable) ; les **poids sont l'input le plus important** (un critère à 9 pèse 9× un critère à 1) ; scorer chaque option/critère puis somme pondérée ; **test de sensibilité** (faire varier les poids). Méthodes de pondération : SMART + swing-weighting, AHP pour les cas lourds. Ne jamais traiter le score comme une vérité absolue — une dépendance peut primer.
- **RICE / ICE** : RICE = (Reach × Impact × Confidence) / Effort ; Impact sur échelle fixe (3 massif / 2 fort / 1 moyen / 0,5 faible / 0,25 minimal) ; **Confidence = frein anti-biais** (pénalise l'incertitude) ; ICE (Impact×Confidence×Ease) plus léger pour le brainstorming. Le score classe, il ne décide pas.
- **Risk matrix / registre des risques** : grille 3×3 ou 5×5 (min. 3 niveaux) ; score = Probabilité × Impact ; seuils typiques 5×5 : 1–6 vert, 7–14 jaune, 15–25 rouge. **Un bon registre ≠ juste prob/impact** : il faut description, **propriétaire**, plan de mitigation, statut, source — c'est un document vivant, revu régulièrement.
- **Impact / Effort & MoSCoW** : le SWOT est **statique** (photo), il faut le convertir en initiatives priorisables ; MoSCoW (Must/Should/Could/Won't) d'abord pour cadrer, puis Impact/Effort pour arbitrer les « Should ». Décomposer l'effort en dimensions (financier, humain, techno, conduite du changement).
- **ADR / Decision Records** (cœur du Decision Object) : structure minimale **Context / Decision / Consequences** (Nygard) ; variantes riches **MADR** (options considérées + pour/contre) et **Y-statement** (« Dans le contexte de C, face à P, nous avons décidé O pour atteindre Q, en acceptant D ») ; **journal append-only** — on ne réécrit pas une décision actée, on la **supersède** en liant l'ancienne ; toujours **contexte + justification** sinon la trace perd sa valeur ; enregistrer le **niveau de confiance** et les **décideurs**.
- **Ishikawa / 5 Pourquoi** (V2, Graph) : catégories adaptables (People/Process/Technology/Policy/Communication/External plutôt que les 6M industriels) ; usage moderne = collaboratif, temps réel.

Enseignement transverse : **les frameworks guident, ils n'enferment pas** ; la valeur naît de critères bien définis et d'un scoring honnête, pas du gabarit. → notre UX doit rendre les presets *modifiables* (ajouter/retirer critères, colonnes, zones) et permettre le **canvas vide**.

---

## 2. Place dans l'architecture

**Un seul Tool** : `app/workspace/tools/decision-engine/`. Couche Tools, indépendant, universel.
**Sa propre app du dock** (contrairement à `bibliotheque` qui a remplacé `documents`) : nouvelle entrée `APP_REGISTRY` + `APP_ORDER` (id `decision`, icône 🧭). Disponible selon config du scénario/mécanique (comme les autres apps).
Enregistré dans `TOOL_REGISTRY` (icône, `applyOp` câblé), ajouté à `schema/mechanics-v3.json` `tools`, et à `NON_RESETTABLE_TOOLS` (TS `composerV3` + mjs `validate-scenarios`) — les décisions ne sont JAMAIS réinitialisées par une phase.

Garde-fous (identiques bloc-notes/bibliotheque) : `spec/model/api` purs (aucun React, aucun import moteur hors types `Json`) ; jamais importé par `app/mechanics` ni un scénario ; interdit dans `exits.reset.tools` ; couplage Tool→Tool uniquement par façades publiques.

---

## 3. Modèle de données (`toolStates["decision-engine"]`, sérialisable)

Deux entités de premier rang : **Decision** (l'objet métier) et **Board** (une instance d'un moteur, configurée par un preset). Un Board peut être *autonome* ou *rattaché* à une Decision.

```ts
interface DecisionEngineState {
  decisions: Record<DecisionId, DecisionObject>;
  boards: Record<BoardId, Board>;
  ui: { open_board_id?: BoardId; open_decision_id?: DecisionId }; // vue courante (persistée)
}
```

### 3.1 Decision Object (ADR-like, cœur réutilisable)

```ts
interface DecisionObject {
  id: DecisionId;
  title: string;
  context: string;
  final_decision?: string;                 // Y-statement possible
  options: DecisionOption[];               // {id, label, note?, links: SourceLink[]}
  criteria: DecisionCriterion[];           // {id, label, weight: number, note?}
  scores: Record<OptionId, Record<CriterionId, ScoreCell>>; // note + justification par (option,critère)
  method?: string;                         // preset/moteur utilisé (ex: "matrix.weighted")
  justification?: string;
  hypotheses: Hypothesis[];                // {id, text, confidence?: 0..1, status}
  risks: RiskEntry[];                      // {id, label, probability, impact, mitigation?, owner?, status}
  sources: SourceLink[];                   // documents/notes/mails/messages/tâches
  author?: string;
  created_at: number; updated_at: number; decided_at?: number;
  expected_impacts?: string;
  status: "draft" | "in_progress" | "finalized" | "archived";
  board_ids: BoardId[];                    // outils utilisés pour construire la décision
  supersedes?: DecisionId;                 // append-only : une décision en remplace une autre
}
type ScoreCell = { value: number; justification?: string };
```

`options`, `criteria`, `scores`, `risks`, `hypotheses` vivent **dans la Decision**. Un Board de type Matrix/Registry *rattaché* à une décision est une **vue** sur ces champs → c'est le mécanisme de conversion « registre ↔ matrice ↔ décision » du brief (voir §7).

### 3.2 SourceLink — la primitive de liaison universelle

```ts
type SourceLink =
  | { kind: "document"; document_id: string; label?: string }
  | { kind: "note"; note_id: string; label?: string }        // note du Bloc-notes
  | { kind: "task"; task_id: string; label?: string }        // tâche du Bloc-notes
  | { kind: "mail"; mail_id: string; subject?: string; label?: string }
  | { kind: "message"; thread_id: string; label?: string }
  | { kind: "library"; entry_id: string; label?: string }    // entrée du Gestionnaire Documentaire
  | { kind: "board"; board_id: string; label?: string }
  | { kind: "decision"; decision_id: string; label?: string };
```

### 3.3 Board (instance d'un moteur)

```ts
interface Board {
  id: BoardId;
  title: string;
  engine: EngineKind;                       // "table"|"matrix"|"graph"|"timeline"|"kanban"|"registry"
  preset_id?: string;                       // preset appliqué (null = canvas vide)
  decision_id?: DecisionId;                 // rattachement (vue sur la décision) ou autonome
  config: EngineConfig;                     // issu du preset, MODIFIABLE par le joueur
  data: EngineData;                         // données selon engine (union ci-dessous)
  created_at: number; updated_at: number;
}
```

### 3.4 Primitive commune : `DecisionItem` (permet les conversions)

Tous les moteurs à « éléments » (Table cards, Matrix options, Registry entries, Kanban cards, Graph nodes) partagent une carte générique. C'est ce socle commun qui rend les conversions possibles **sans logique spéciale** : on lit/écrit `fields`.

```ts
interface DecisionItem {
  id: ItemId;
  label: string;
  fields: Record<string, string | number | boolean | null>; // valeurs typées par le config
  tags: string[];
  color?: string;
  comment?: string;
  links: SourceLink[];
  zone_id?: string;      // Table : quelle zone/colonne
  x?: number; y?: number; // Matrix : placement visuel (0..1)
  status?: string;       // Kanban/Registry
}
```

### 3.5 Données par moteur (`EngineData`)

```ts
// Table / Canvas : zones (SWOT, BMC…) OU colonnes×lignes (RACI, comparatif)
type TableData = {
  mode: "zones" | "grid";
  zones?: { id: string; label: string; color?: string }[];       // mode zones
  columns?: { id: string; label: string }[];                     // mode grid
  rows?: { id: string; label: string }[];                        // mode grid
  cells?: Record<string, string>;                                // grid : `${rowId}:${colId}` -> valeur
  items: DecisionItem[];                                          // cartes/post-it (mode zones)
};

// Matrix : options × critères pondérés (scoré) ET/OU placement X/Y en quadrants
type MatrixData = {
  scoring: "weighted" | "axis" | "rice";                         // méthode
  axes?: { x: AxisDef; y: AxisDef };                             // axis/placement
  quadrants?: { id: string; label: string; color?: string }[];  // 4 quadrants nommés
  items: DecisionItem[];                                         // options placées (x,y) et/ou scorées
  criteria?: { id: string; label: string; weight: number }[];   // weighted/rice
};
type AxisDef = { label: string; min_label?: string; max_label?: string; scale?: number };

// Registry : schéma de champs + entrées (risques, décisions, hypothèses…)
type RegistryData = {
  fields: RegistryField[];         // schéma configurable
  items: DecisionItem[];           // entrées structurées
};
type RegistryField =
  | { id: string; label: string; type: "text" | "number" | "date" | "user" }
  | { id: string; label: string; type: "select"; options: { value: string; label: string; color?: string }[] };

// V2 :
type GraphData = { nodes: DecisionItem[]; edges: { id; from; to; label?; kind?; directed?: boolean }[]; groups?: {…}[] };
type TimelineData = { steps: TimelineStep[] };                   // {id,label,order|date?,milestone?,deliverable?,owner?,risk?,status,links}
type KanbanData = { columns: { id; label; wip?: number }[]; items: DecisionItem[] };
```

`EngineConfig` = la partie « gabarit » (issue du preset, modifiable) : pour Table les zones/colonnes ; pour Matrix les axes/quadrants/critères par défaut + le mode de scoring ; pour Registry le schéma de champs. `EngineData` = ce que le joueur produit. Séparer config (gabarit) et data (contenu) rend un preset = juste un `config` initial.

---

## 4. Structure des widgets génériques (6 moteurs)

| Moteur | Rôle | Widget V1 | Frameworks branchés (presets) |
|---|---|---|---|
| **Table / Canvas** | zones, lignes/colonnes, cartes déplaçables | **V1** | SWOT, RACI, MoSCoW, Business Model Canvas, PESTEL, SIPOC, comparatif, avantages/inconvénients, Value Proposition Canvas |
| **Matrix** | arbitrages scorés + placement visuel en quadrants | **V1** | matrice multicritère, Impact/Effort, Probabilité/Impact, Urgence/Importance, Valeur/Risque, Coût/Bénéfice, RICE/ICE, Pareto |
| **Registry** | objets structurés tracés (schéma de champs) | **V1** | registre décisions/risques/hypothèses/actions/objections/dépendances |
| **Graph** | causalités, dépendances, arbres | V2 | arbre de décision, dépendances, Ishikawa, 5 Pourquoi, cause→conséquence, acteur→décision→impact |
| **Timeline / Process** | plans séquentiels, jalons | V2 | roadmap, waterfall, cycle en V, processus, scénarios optimiste/médian/pessimiste |
| **Kanban / Backlog** | éléments actionnables | V2 | Kanban, backlog priorisé, sprint board, priorisation simple |

Chaque moteur = un composant React unique et opinionated (jamais un tableur générique) : Table rend des **zones à cartes** ou une **grille éditable inline** ; Matrix rend un **nuage de points en quadrants** + un **panneau de scoring pondéré** ; Registry rend une **liste/table d'entrées** avec champs typés, filtres, couleurs de criticité. Fonctions transverses partagées par tous : édition inline, tags, couleurs, commentaires, `links` (SourceLink), **export de synthèse → Bloc-notes**, **carte → tâche du Bloc-notes**, **carte/board → Decision Object**.

---

## 5. Presets (configurations JSON d'un moteur)

Un preset ne contient AUCUN code : `{ id, title, description, engine, config, seed? }`. `config` initialise `EngineConfig` ; `seed` (optionnel) pré-remplit quelques items d'amorçage (jamais de contenu « réponse »).

**Exemple — SWOT (Table / zones)** :
```json
{ "id": "swot", "title": "SWOT", "engine": "table",
  "config": { "mode": "zones", "zones": [
    { "id": "s", "label": "Forces", "color": "#bbf7d0" },
    { "id": "w", "label": "Faiblesses", "color": "#fecaca" },
    { "id": "o", "label": "Opportunités", "color": "#bfdbfe" },
    { "id": "t", "label": "Menaces", "color": "#fde68a" } ] } }
```

**Exemple — Matrice multicritère pondérée (Matrix / weighted)** :
```json
{ "id": "matrix.weighted", "title": "Matrice multicritère", "engine": "matrix",
  "config": { "scoring": "weighted", "criteria": [
    { "id": "c1", "label": "Impact", "weight": 3 },
    { "id": "c2", "label": "Faisabilité", "weight": 2 },
    { "id": "c3", "label": "Coût", "weight": 2 },
    { "id": "c4", "label": "Risque", "weight": 1 } ] } }
```

**Exemple — Impact / Effort & Probabilité / Impact (Matrix / axis, 4 quadrants)** :
```json
{ "id": "matrix.impact_effort", "title": "Impact / Effort", "engine": "matrix",
  "config": { "scoring": "axis",
    "axes": { "x": { "label": "Effort", "min_label": "Faible", "max_label": "Élevé" },
              "y": { "label": "Impact", "min_label": "Faible", "max_label": "Élevé" } },
    "quadrants": [
      { "id": "q1", "label": "Quick wins", "color": "#bbf7d0" },
      { "id": "q2", "label": "Gros paris", "color": "#bfdbfe" },
      { "id": "q3", "label": "À éviter", "color": "#fecaca" },
      { "id": "q4", "label": "Bouche-trous", "color": "#e5e7eb" } ] } }
```
Probabilité/Impact = même moteur, axes « Probabilité »/« Impact », quadrants risque.

**Exemple — Registre des décisions (Registry)** :
```json
{ "id": "registry.decisions", "title": "Registre des décisions", "engine": "registry",
  "config": { "fields": [
    { "id": "title", "label": "Décision", "type": "text" },
    { "id": "status", "label": "Statut", "type": "select", "options": [
       { "value": "draft", "label": "Brouillon" }, { "value": "final", "label": "Actée", "color": "#bbf7d0" } ] },
    { "id": "owner", "label": "Propriétaire", "type": "user" },
    { "id": "date", "label": "Date", "type": "date" } ] } }
```

**Analyse de risques = Registry + Matrix sur le MÊME support** : le preset `risk.analysis` crée un Board Registry (champs : risque, probabilité `select` 1–5, impact `select` 1–5, criticité dérivée, mitigation, propriétaire, statut) **rattaché** à une décision via `decision.risks`. Le même `decision.risks` s'affiche aussi en Matrix Probabilité/Impact (chaque risque = un point, x=proba, y=impact). Basculer registre↔matrice = changer de Board, pas de données.

**Presets V1 livrés** : `swot` (Table), `matrix.weighted`, `matrix.impact_effort`, `matrix.prob_impact` (Matrix), `risk.analysis` (Registry+Matrix), `registry.decisions` (Registry).
**Presets V2** : RACI, MoSCoW, BMC, PESTEL, comparatif (Table) ; RICE/ICE, Urgence/Importance, Pareto (Matrix) ; arbre de décision, Ishikawa, 5 Pourquoi, dépendances (Graph) ; roadmap, waterfall, cycle en V (Timeline) ; Kanban/backlog (Kanban).

---

## 6. API publique (`api.ts`) — constructeurs d'ops `tool_op` + sélecteurs

Chaque appel rend une action `tool_op` (journalisée puis appliquée par `applyDecisionOp` via le TOOL_REGISTRY). Mapping de la liste PO :

`createDecision`, `updateDecision`, `deleteDecision`, `finalizeDecision`, `createBoard`(≡ `createWorkspace`), `openPreset`(crée un Board depuis un preset), `deleteBoard`, `addOption`, `updateOption`, `addCriterion`, `updateCriterionWeight`, `scoreOption`(note+justif d'une cellule), `createRisk`, `updateRisk`, `createHypothesis`, `updateHypothesis`, `addItem`/`updateItem`/`moveItem`/`removeItem` (cartes/entrées/points/nœuds génériques), `setCell` (Table grid), `linkSource`(rattache un SourceLink à une décision/board/item), `exportToNotebook`(synthèse → note Bloc-notes), `createTaskFromDecision`(→ tâche Bloc-notes), `createDecisionFromTool`(Board → nouvelle Decision).
Sélecteurs purs : `getDecisionById`, `listDecisions`, `getBoard`, `listBoards`, `selectBoardsForDecision`, `scoreOf(decision, optionId)` (somme pondérée dérivée, jamais stockée), `riskLevel(item)` (proba×impact dérivé), recherche/filtre d'items.

**Couplage Tool→Tool par façade publique uniquement** : `exportToNotebook`/`createTaskFromDecision` importent `tools/bloc-notes/api` (`createNote`+`updateBlocks`, `createTask`, `taskFromSelection`) — jamais l'état interne du carnet. `linkSource` ne référence que des ids (document_id, note_id, mail_id, thread_id, entry_id) — aucune lecture d'état d'un autre Tool.

---

## 7. Cycle de vie d'un Decision Object & conversions entre vues

1. **Création** : `createDecision(title, context)` (depuis l'app, ou `createDecisionFromTool(board)` depuis un Board, ou « Créer une décision à partir de cette note » depuis le Bloc-notes).
2. **Structuration** : le joueur ajoute options/critères (poids), score les cellules (matrice pondérée dérivée en direct, **score jamais présenté comme vérité**), pose des risques/hypothèses, lie des sources (documents/notes/mails/messages).
3. **Vues multiples (conversion)** : un même `decision.risks` s'affiche en **Registry** (édition détaillée) ou en **Matrix** Probabilité/Impact (placement visuel) — deux Boards *rattachés*, une seule donnée. Idem options/critères ↔ Matrix multicritère. **V1 : rattachement Matrix multicritère ↔ Decision (options/critères/scores) + Registry risques ↔ Decision (risks). Conversion libre entre TOUS les moteurs = V2.**
4. **Finalisation** : `finalizeDecision` fige `final_decision`, `justification`, `decided_at`, `status:"finalized"`. Append-only : réviser = nouvelle décision `supersedes` l'ancienne.
5. **Réutilisation par d'autres mécaniques** : la Decision persiste dans `toolStates` (jamais reset) et est **observable** via `describeForObservation` (résumé neutre). Une mécanique ultérieure (Présentation « défendre la décision », Négociation « justifier », Production « rédiger un mail à partir de la décision », Débrief « la décision était-elle cohérente ? ») exploite ce résumé par l'observateur/acteur IA — **sans que la mécanique importe le Tool** (elle observe, elle ne lit pas l'état interne). C'est le même contrat d'indépendance que les autres Tools.

---

## 8. Intégration Workspace & apps hôtes

- **App du dock** `decision` (🧭) : shell agnostique = rail gauche (Décisions + Boards, bouton « Nouveau : preset ou canvas vide ») + canvas du moteur courant + panneau latéral (sources, synthèse, export).
- **Boutons exportés, hébergés par les autres apps** (même pattern que `AnnotateButton`/`ArchiveButton`) : `LinkToDecisionButton` — « → Décision » — hébergé par **Documents/Bibliothèque** (ajouter comme source), **Mail** (ajouter comme preuve/contrainte), **Messages** (créer hypothèse/risque/option), **Bloc-notes** (créer une décision à partir d'une note / ajouter une tâche liée). L'hôte fournit un `SourceLink` + son dispatch ; le bouton appelle `linkSource`/`createDecisionFromTool` via la façade. Garde-fou étendu : les hôtes n'importent QUE `decision-engine/LinkToDecisionButton`.
- **Vers le Bloc-notes** : `exportToNotebook(decisionId)` compose une note de synthèse (titre, décision, options, justification, risques) via `bloc-notes/api` ; `createTaskFromDecision` crée une tâche avec `source`.
- **Intégration V1 minimale** (pour livrer sans exploser le périmètre) : app `decision` complète + `exportToNotebook` + `createTaskFromDecision` + `LinkToDecisionButton` dans **Documents/Bibliothèque** uniquement. Mail/Messages/Bloc-notes = V2.

---

## 9. Journalisation (`tool_op`) — décision d'architecture à valider

Le brief liste des noms d'actions (`decision_created`, `matrix_scored`…). **Recommandation forte : ce sont des `op` du `tool_op` générique, PAS de nouveaux membres de l'union `WorkspaceAction`.** Ajouter 11 membres violerait le principe « le moteur est ignorant des ops » (`CONTRAT_WORKSPACE.md` / `TOOL_BLOC_NOTES.md §2`) et casserait le garde-fou CI. On garde un seul `tool_op` ; le champ `op` porte le nom fin, journalisé à l'identique (audit, replay, débrief).

Ops (fermées côté Tool) : `decision_created`, `decision_updated`, `decision_finalized`, `decision_deleted`, `decision_source_linked`, `option_added`, `option_updated`, `criterion_added`, `criterion_weight_updated`, `option_scored`, `risk_created`, `risk_updated`, `hypothesis_created`, `hypothesis_updated`, `board_created`, `preset_opened`, `board_deleted`, `item_added`, `item_updated`, `item_moved`, `item_removed`, `cell_set`, `exported_to_notebook`, `task_created_from_decision`, `decision_created_from_tool`. (Alias lisibles des noms PO : `matrix_scored`=`option_scored`, `canvas_card_created`=`item_added` sur Table, `graph_node_created`/`timeline_step_created`/`kanban_card_moved` = `item_added`/`item_moved` sur les moteurs V2.)

---

## 10. Persistance, garde-fous, tests

État entièrement sérialisable dans `toolStates["decision-engine"]` : décisions, boards (matrices/registres/tables), presets utilisés — tout survit aux changements de phase (NON_RESETTABLE) et au deep-save. Garde-fous CI (mêmes tests que bloc-notes/bibliotheque) : pureté `spec/model/api` ; module jamais importé par mécaniques/scénarios ; dossier dans TOOL_REGISTRY ; interdit dans `exits.reset.tools` (TS+mjs) ; hôtes n'important que le bouton exporté. Tests V1 : `model.test` (reducer, invariants, no-op défensif, score dérivé), `api.test` (constructeurs+sélecteurs), `gardefous.test`, `engine.integration.test` (bout-en-bout moteur + deep-save).

---

## 11. IA V2 (architecture réservée, jamais de décision à la place du joueur)

Route dédiée `/api/v2/decision-assist` recevant **UNIQUEMENT** l'état d'un Board/Decision (jamais le scénario, les critères d'évaluation, les prompts d'acteurs). Retourne des **ops proposées** passant par la même API publique (journalisées, refusables). Intents autorisés : reformuler des options, regrouper des critères, détecter des hypothèses implicites, repérer des contradictions, proposer une structure de matrice, transformer une discussion en registre de risques, transformer des notes en options, générer une synthèse. **Interdit** : « choisis l'option A ». Même garde-fou que le Bloc-notes V2.

---

## 12. Périmètre V1 / préparé V2 / dette

**V1 (à livrer, gates verts)** : moteurs **Table, Matrix, Registry** ; **Decision Object** complet ; presets **SWOT, matrice multicritère, Impact/Effort, Probabilité/Impact, analyse de risques, registre des décisions** ; app `decision` du dock ; journalisation `tool_op` ; intégration session (NON_RESETTABLE, deep-save) ; intégration minimale Bloc-notes (`exportToNotebook`, `createTaskFromDecision`) + `LinkToDecisionButton` dans Documents ; UI utilisable.
**Préparé V2 (structure prête, non codé)** : moteurs Graph, Timeline, Kanban ; presets RACI, MoSCoW, BMC, Ishikawa, 5 Pourquoi, roadmap, cycle en V ; assistant IA ; conversion libre entre TOUS les moteurs ; intégration avancée replay/débrief ; boutons hôtes Mail/Messages/Bloc-notes ; vue Bureau spatiale.
**Dette assumée V1** : conversion entre vues limitée à Matrix↔Decision et Registry-risques↔Decision (pas généralisée) ; pas de drag-drop avancé multi-touch ; score dérivé simple (somme pondérée / proba×impact), pas de test de sensibilité interactif (V2) ; `describeForObservation` = résumé texte (la vue replay dédiée reste à construire, dette n°4 du projet).

---

## 13. Découpage de build proposé (lots verts successifs)

1. **Lot A — socle pur + Decision Object + Matrix** : `spec/model/api` (Decision, Board, ops), reducer, presets `matrix.weighted`/`impact_effort`/`prob_impact`, tests, enregistrement (registry/schema/NON_RESETTABLE), app `decision` minimale (liste décisions + éditeur Matrix). Gate vert.
2. **Lot B — Registry + Table + presets** : moteurs Registry (registre décisions, analyse de risques) et Table (SWOT), presets, UI. Gate vert.
3. **Lot C — intégrations** : `exportToNotebook`, `createTaskFromDecision`, `LinkToDecisionButton` (Documents), finalisation/append-only. Gate vert.

Chaque lot committable indépendamment (sécurise le point de reprise — le mode d'échec récurrent du projet est l'épuisement en cours de chantier).

---

## 14. Points à valider par le PO (avant code)

1. **Journalisation `tool_op`** (non 11 nouveaux `WorkspaceAction`) — §9. Recommandé.
2. **Decision Object = magasin canonique** des options/critères/risques ; les Boards rattachés en sont des **vues** (permet la conversion) — §3/§7. Recommandé.
3. **App `decision` séparée dans le dock** (icône 🧭), disponible selon config scénario — §2/§8.
4. **Périmètre V1 = 3 moteurs + 6 presets + intégration Bloc-notes/Documents seulement** (Mail/Messages/IA/Graph/Timeline/Kanban = V2) — §12. Challenge : c'est déjà 3 lots ; je recommande de tenir cette ligne plutôt que d'élargir.
5. **Conversion « libre entre toutes les vues » = V2** ; V1 couvre Matrix↔Decision et Registry-risques↔Decision — §7/§12.
