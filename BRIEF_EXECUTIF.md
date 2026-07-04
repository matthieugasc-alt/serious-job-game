# Brief exécutif — Revealio (passation Cowork)

**Mise à jour** : 4 juillet 2026, fin de session (crédits épuisés en plein chantier Gestionnaire Documentaire).
**À lire en premier dans toute nouvelle session.** Docs de référence ensuite : `docs/CONTRAT_WORKSPACE.md` (le contrat moteur/workspace/triggers — LA bible), `docs/TOOL_BLOC_NOTES.md` (pattern de référence des Tools), `docs/TOOL_GESTIONNAIRE_DOC.md` (contrat du chantier EN COURS), `docs/MECANIQUES.md`. L'ancien contenu de ce brief (état pré-refonte) est obsolète — l'histoire complète est dans git et `archive/`.

## En 30 secondes

Revealio a été entièrement refondu en deux révolutions successives. D'abord « mécaniques » : un moteur où un scénario = un JSON déclaratif (séquence de steps, critères, endings), zéro code par scénario. Puis « poste de travail » (v3, l'actuel) : le joueur vit dans un environnement persistant type bureau — Messages (Teams-like), Mail, Documents, Bloc-notes, ChatDock flottant, outils en panneaux (contrat, éditeur, réunion). Les mécaniques sont invisibles (headless) : elles cadrent les acteurs IA et observent le travail réel. L'IA observe, le moteur décide, le RÉDACTEUR déclare les conditions de passage (triggers) — zéro implicite, garde-fous CI partout.

## État : sain et déployable

HEAD vert : `tsc` 0 erreur, **315 tests**, `validate:scenarios` 18/18 v3, `validate:founder` OK, `next build` OK. Les 18 scénarios (11 cpo_* Fluxboard mono-step, 6 founder Orisio, vitrine) tournent sur le WorkspacePlayer. Prod : https://revealio.live, vérifiable par `/api/version` (commit servi). Recette : `git push origin main` puis `ssh root@204.168.217.145 'cd /var/www/serious-job-game && ./scripts/deploy.sh'` (gate final automatique : échoue si la prod ne sert pas HEAD).

## Architecture (5 couches, garde-fous CI)

Workspace (shell ≤250 l., apps autonomes) → Tools (universels, indépendants, pattern `tool_op`/reducer pur/API publique) → Mechanics (headless, specs pures, zéro React — CI casse sinon) → Scenario (JSON v3 : steps, params, threads, documents, events narratifs, `completion.trigger`/`exits` obligatoires) → Runtime pur (`app/lib/engine/` : sessionV3, workspaceReducer, triggers, composerV3, criteria).
Primitives moteur récentes : `exits` multi-sorties avec routes (next / `goto`+reset+`max_gotos` / `end` nommé), `bind_actor` (acteurs dynamiques, ex. chosen_cto), `mail_scored`/`mail_scored_below` (scoring IA à seuil via `/api/v2/score`, score jamais affiché — mécanique prospection founder_05), timers visibles. Routes IA génériques : `/api/v2/actor`, `/observe`, `/score`, `/complete` (outcomes founder).

## CHANTIER EN COURS (interrompu) : Gestionnaire Documentaire Universel

Le contrat est écrit et commité (`docs/TOOL_GESTIONNAIRE_DOC.md`) — c'est la spec complète : bibliothèque personnelle (les docs scénario y entrent automatiquement ; mails/messages Teams UNIQUEMENT par archivage manuel « Ajouter au dossier documentaire »), lecteur augmenté (surlignage, commentaires ancrés, signets, extraction vers Bloc-notes), multi-fenêtres/layouts, comparaison côte à côte, dossiers/tags/favoris/tris/recherche plein texte, persistance totale.
**Rien d'implémenté** (un embryon a été écrit puis nettoyé pour laisser l'arbre vert). Reprise : deux agents — (1) couche pure `app/workspace/tools/bibliotheque/{spec,model,api}.ts` + tests + ajout à NON_RESETTABLE_TOOLS, en imitant strictement `tools/bloc-notes/` ; (2) UI (BibliothequeApp remplaçant le contenu de l'app documents, ReaderAugmente, CompareView, ArchiveButton hébergé par Mail/Messages). Gates habituels.

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
