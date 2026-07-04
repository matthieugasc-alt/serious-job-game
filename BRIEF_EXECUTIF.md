# Brief exécutif — Revealio (passation Cowork)

**Mise à jour** : 4 juillet 2026, fin de session (crédits épuisés en plein chantier Gestionnaire Documentaire).
**À lire en premier dans toute nouvelle session.** Docs de référence ensuite : `docs/CONTRAT_WORKSPACE.md` (le contrat moteur/workspace/triggers — LA bible), `docs/TOOL_BLOC_NOTES.md` (pattern de référence des Tools), `docs/TOOL_GESTIONNAIRE_DOC.md` (contrat du chantier EN COURS), `docs/MECANIQUES.md`. L'ancien contenu de ce brief (état pré-refonte) est obsolète — l'histoire complète est dans git et `archive/`.

## En 30 secondes

Revealio a été entièrement refondu en deux révolutions successives. D'abord « mécaniques » : un moteur où un scénario = un JSON déclaratif (séquence de steps, critères, endings), zéro code par scénario. Puis « poste de travail » (v3, l'actuel) : le joueur vit dans un environnement persistant type bureau — Messages (Teams-like), Mail, Documents, Bloc-notes, ChatDock flottant, outils en panneaux (contrat, éditeur, réunion). Les mécaniques sont invisibles (headless) : elles cadrent les acteurs IA et observent le travail réel. L'IA observe, le moteur décide, le RÉDACTEUR déclare les conditions de passage (triggers) — zéro implicite, garde-fous CI partout.

## État : sain et déployable

HEAD vert : `tsc` 0 erreur, **383 tests** (36 bibliothèque + 2 garde-fous hôtes + 30 Decision Engine Lot A), `validate:scenarios` 18/18 v3, `validate:founder` OK, `next build` OK (compile + 40 pages générées ; sur la sandbox Cowork le build échoue UNIQUEMENT au nettoyage `rmdir` du dossier fuse `.next`, à lancer sur le Mac pour le gate réel). Les 18 scénarios (11 cpo_* Fluxboard mono-step, 6 founder Orisio, vitrine) tournent sur le WorkspacePlayer. Prod : https://revealio.live, vérifiable par `/api/version` (commit servi). Recette : `git push origin main` puis `ssh root@204.168.217.145 'cd /var/www/serious-job-game && ./scripts/deploy.sh'` (gate final automatique : échoue si la prod ne sert pas HEAD).

## Architecture (5 couches, garde-fous CI)

Workspace (shell ≤250 l., apps autonomes) → Tools (universels, indépendants, pattern `tool_op`/reducer pur/API publique) → Mechanics (headless, specs pures, zéro React — CI casse sinon) → Scenario (JSON v3 : steps, params, threads, documents, events narratifs, `completion.trigger`/`exits` obligatoires) → Runtime pur (`app/lib/engine/` : sessionV3, workspaceReducer, triggers, composerV3, criteria).
Primitives moteur récentes : `exits` multi-sorties avec routes (next / `goto`+reset+`max_gotos` / `end` nommé), `bind_actor` (acteurs dynamiques, ex. chosen_cto), `mail_scored`/`mail_scored_below` (scoring IA à seuil via `/api/v2/score`, score jamais affiché — mécanique prospection founder_05), timers visibles. Routes IA génériques : `/api/v2/actor`, `/observe`, `/score`, `/complete` (outcomes founder).

## CHANTIER TERMINÉ : Gestionnaire Documentaire Universel (Lot 1 + Lot 2)

Contrat : `docs/TOOL_GESTIONNAIRE_DOC.md`. **Lot 1 (couche pure) et Lot 2 (UI) livrés, verts.** Le Tool `bibliotheque` est complet et jouable.
**LOT 1 — couche pure** (`app/workspace/tools/bibliotheque/{spec,model,api}.ts`, calqués sur `bloc-notes/`) : 23 ops `tool_op` (index scenario_doc idempotent, archivage mail/fil dédupliqué par source = règle « un choix » §2, dossiers/tags/pin/favori, surlignage/commentaire/signet, liens doc↔doc bidirectionnels, bureau windows/layout/compare), reducer pur/immutable/défensif, `searchEntries(state, query, resolveContent)`. Enregistré : TOOL_REGISTRY (icône 🗂️), schema `tools`, `NON_RESETTABLE_TOOLS` (TS + mjs). 36 tests.
**LOT 2 — UI** (4 tranches) : (1) l'app **Documents** est la coquille hôte qui monte `BibliothequeApp` (auto-index des `DocumentDef` du step, gate état+ref pour éviter le bruit journal ; navigateur : dossiers/tags/tris/recherche plein texte/épingles/favoris/vues ; `document_opened` préservé pour les triggers). (2) `ReaderAugmente` : sélection → surligner (4 couleurs)/commenter ancré/signet/extraire « → Bloc-notes » (via `bloc-notes/api` public), panneau d'annotations retirables. (3) `ArchiveButton` hébergé par Mail (mail ouvert) et Messages (fil), popover dossier/tags, dédup idempotente ; garde-fou hôtes étendu (Mail/Messages n'importent QUE `bibliotheque/ArchiveButton`). (4) `DeskView` : bureau multi-fenêtres (onglets, layouts single/split-v/split-h/grid) + comparaison côte à côte (scroll indépendant), piloté par `desk`.
**Simplification V1 assumée** : le re-peint in-texte des surlignages marche sur les mails/fils archivés (rendus en texte, correspondance exacte de l'extrait) ; les **documents markdown du scénario** gardent leur rendu riche et listent leurs surlignages dans le panneau (peinture in-texte des docs riches = V2). Autres V2 du contrat : vue Bureau spatiale (positions libres, champ `desk.positions` réservé), annotations sur PDF binaires, suggestions IA de classement, archivage d'une SÉLECTION de messages (V1 = fil entier).
**Vigilance** : warning lint pré-existant `MessagesApp.tsx:31` (effet de navigation, hors périmètre) — pas une régression.

## CHANTIER EN COURS : Decision Engine / Decision Toolbox

Contrat validé et commité (`docs/TOOL_DECISION_ENGINE.md`) : Tool universel `decision-engine`, 6 moteurs génériques (Table/Matrix/Graph/Timeline/Kanban/Registry) + presets JSON + **Decision Object** central (ADR-like). Partis-pris validés PO : journalisation `tool_op` (pas de nouveaux `WorkspaceAction`), Decision Object = magasin canonique (Boards rattachés = vues → conversions), **app dédiée** du dock (`decision` 🧭).
**LOT A FAIT (vert)** : couche pure `app/workspace/tools/decision-engine/{spec,model,api,presets}.ts` (26 ops `tool_op` : décision/options/critères/scoring dérivé jamais stocké/risques/hypothèses/boards/items) ; presets Matrix `weighted`/`impact_effort`/`prob_impact` (+ swot/risk.analysis/registry.decisions préparés Lot B) ; app `DecisionEngineApp` (rail décisions + `DecisionEditor` matrice multicritère/risques/tableaux liés + `MatrixBoard` nuage de points en quadrants glisser-déposer) ; enregistrement (TOOL_REGISTRY, APP_REGISTRY/APP_ORDER, schema `tools`, `NON_RESETTABLE` TS+mjs) ; 30 tests.
**LOT B À FAIRE** : moteur **Registry** (registre décisions, analyse de risques via `decision.risks` en vue registre) + moteur **Table** (SWOT/zones à cartes) + UI de ces presets. **LOT C** : intégrations — `exportToNotebook` + `createTaskFromDecision` (via `bloc-notes/api`), `LinkToDecisionButton` hébergé par Documents, finalisation append-only (`supersedes`) exposée dans l'UI.
**V2 (structure prête)** : moteurs Graph/Timeline/Kanban, presets RACI/MoSCoW/BMC/Ishikawa/roadmap, assistant IA (`/api/v2/decision-assist` — jamais de choix), conversion libre entre toutes les vues, boutons hôtes Mail/Messages/Bloc-notes.

## Le Bloc-notes Universel (terminé — modèle de tous les Tools)

`app/workspace/tools/bloc-notes/` : éditeur de blocs (hiérarchie, todos, tags), tâches + Kanban + vue Base de données, QuickPanel ouvrable partout, AnnotateButton dans Messages/Mail/Documents (annotation sans interruption, SourceRef navigable), 13 ops journalisées finement via `tool_op`. V2 prévue : agent IA d'organisation (jamais de résolution), mind map, dessin.

## Dettes et vigilances (par priorité)

1. **La boucle IA réelle n'a JAMAIS été testée avec un humain** (acteurs, observateur, scoring gpt-4.1-mini). Jouer founder_05 puis founder_02 en local/prod est LE test décisif avant toute démo. Calibration probable des prompts `/api/v2/actor|observe|score`.
2. Harnais de playthrough v3 : seul founder_02 a un test bout-en-bout ; les 17 autres n'ont que la validation statique. Un harnais générique par dispatch (comme l'ex-v2) est le chantier qualité n°1.
3. Sessions par localStorage uniquement (pas de compte joueur côté player) : déverrouillage par navigateur, pénalités d'abandon founder inopérantes, `/api/v2/complete` non authentifié (campaign_id = capability).
4. Replay/débrief admin à reconstruire sur la matière v3 (actionLog + exitLog + evaluationHistory — tout est journalisé, la vue n'existe pas).
5. Studio gelé (produit du v1, incompatible) ; PDF binaires : annotation désactivée (V2) ; TTS retiré (STT conservé).
6. Founder : deltas dynamiques partiellement statiques (equity fo2, devis fo4 — TODO-DEBT dans `/api/v2/complete`) ; garde des 10 mails fo5 : le 10ᵉ envoi tire avant son scoring (9 vraies cartouches) ; `max_gotos` par step, pas global.

## Gotchas repo

Sandbox Cowork : locks git (`rm -f .git/*.lock` après chaque commit — autoriser la suppression de fichiers via l'outil dédié une fois par session). Push/pull impossibles depuis la sandbox (credentials sur le Mac de Matthieu) : lui donner systématiquement les commandes push/déploiement en fin de travail. Vitest = node pur, jamais de rendu React. Chaque scénario garde ses rollbacks (`scenario.v2.json`, parfois `scenario.v3-old.json`) ; archives legacy : `archive/legacy-v1/`, `archive/legacy-v2/`.

## Façon de travailler avec Matthieu (PO)

Plans avant code sur les gros chantiers (contrats d'architecture dans docs/, il les valide) ; ensuite autonomie totale entre jalons, gates verts à chaque commit. Direct, dense, honnête — il préfère une critique solide à une validation confortable, et VEUT qu'on marque clairement le non-déterminisme, les régressions et les dettes. Immersion = la valeur produit n°1 : jamais d'écran « exercice », jamais de formulaire, tout doit ressembler à une journée de travail. Ne jamais annoncer « généralisation » pour un travail partiel : si un lot ne couvre pas tout, le dire explicitement.
