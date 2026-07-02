# Débrief — Chantier unique « Refonte moteur mécaniques »

**Date** : 2 juillet 2026
**Périmètre acté** : mécanique-first, suppression du legacy, vitrine v2, founder migré, studio gelé, aucun scénario v1 sacré.
**Bilan git** : 319 fichiers touchés, +13 807 / −40 548 lignes (net **−26 741**). 72 fichiers créés (hors archive), 138 supprimés, 22 modifiés.
**Gates finaux** : `tsc --noEmit` ✓ · `vitest` 171/171 ✓ · `validate:scenarios` (v2) 7/7 ✓ · `validate:founder` (réécrit v2) ✓ · `next build` 40/40 pages ✓.

---

## 1. Fichiers créés (72, l'essentiel)

**Moteur** (`app/lib/engine/`) : `criteria.ts` (applyStepObservation — le moteur décide), `mechanics.ts` (Mechanic/Manifest/Context/IO/Result, ScenarioV2), `sessionV2.ts` (état pur sérialisable), `composer.ts` (validation + résolution `inputs_from`), `index.ts` réécrit (API publique v2).
**Mécaniques** (`app/mechanics/`) : 7 mécaniques + harnais `_noop`, chacune = manifest + Runtime pur + Component + module + tests + doc `QUAND_UTILISER.md`. Registres : `manifests.ts`, `index.ts`, `schema/mechanics.json` + garde-fou de triple cohérence.
**Player** (`app/player/` + `app/play/[scenarioId]/`) : Shell 181 l., MechanicRunner 88 l., TransitionOverlay 40 l., liveIO 69 l., route+client 236 l. — **614 lignes au total**, zéro connaissance métier.
**API générique** (`app/api/v2/`) : `actor` (acteur IA), `observe` (observation des critères, jamais de verdict), `complete` (persistence + outcomes founder).
**Contenu** : `scenarios/vitrine_signer_le_pilote/` (6 steps, 6 mécaniques). **Docs** : `docs/MECANIQUES.md` (arbitrages), `archive/legacy-v1/ARCHIVE.md`.

## 2. Fichiers supprimés (138, par catégorie)

Player v1 complet `app/scenarios/[scenarioId]/**` (~20 500 l. : page 2743 l., PlayerContext 60+ champs, PhaseOrchestrator, MailModule 1228 l., ContractModule, InterviewModule, applyModuleActions, MailView, ContractOverlay, PresentationModeView, hooks) · 17 scénarios v1 + `.bak` (−12 166 l.) · `/api/chat` (1 247 l. avec branches contenu) · routes v1 (`debrief`, `evaluate-presentation`, `tts`, `download`, `founder/apply-outcome|checkpoint|rules`) · libs v1 (`runtime.ts` 1572 l., `types.ts` 1384 l., `scenarioValidator`, `adaptScenario`, `applyPhaseObservation`, `mailSimilarity`, `scenarioVersioning`, etc.) · admin v1 (`edit-criterion`, `replay`, `scenario-diff`, `scenario-patch`) · schéma v1 + scripts v1 + harness tests v1 (−33 574 l.).
Tout est relisible dans `archive/legacy-v1/` (17 scénarios v1 + les 6 founder v1 pré-réécriture + docs player + schéma) et dans git (dernier commit tout-legacy : `17ba9c6`).

## 3. Fichiers fortement modifiés (22)

`app/page.tsx` (home → `/play/<id>`, v2 uniquement), `app/founder/[campaignId]/page.tsx` + `intro` (lancements → Shell v2), `app/lib/scenarios.ts`, `app/lib/founder.ts` (consommé par `/api/v2/complete`), `package.json` (scripts), `vitest.config.ts` (coverage v2), `app/studio/[studioId]/page.tsx` (bandeau gel), `validate-founder.mjs` (réécrit : endings v2 ↔ `founder_rules.json`).

## 4. Dettes supprimées

La conflation module=mécanique · le player-dieu (5 500→614 l., plus aucun import métier) · PlayerContext god-object · `ModuleAction` fourre-tout (30+ types) → `MechanicResult` typé par mécanique · les sections JSON câblées aux composants (`mail_config`, `presentation_config`, `voice_qa_config`, `contract_config`) → `params` de steps · les branches contenu dans `/api/chat` (`prospection_evaluation`, `dsi_validation`) → prompts d'acteurs + critères déclaratifs · `interaction_mode` · le versioning mort (`archiveScenarioVersion` jamais appelé) · les scénarios "maintenance" tolérés en échec (13) · **et la dette signalée au brief : les criticals/competencies/error_type sont désormais réellement nourris** (vitrine + founder v2 les utilisent partout, le prompt d'observation les reçoit).

## 5. Dettes restantes (assumées, documentées)

1. **Calibration IA non éprouvée en réel** : `/api/v2/actor` et `/api/v2/observe` (gpt-4.1-mini) n'ont pas encore tourné avec de vrais joueurs. C'est LE risque résiduel n°1.
2. Admin `replay`/`edit-criterion`/`scenario-diff` supprimés — à reconstruire sur la matière v2 (meilleure : `evaluationHistory` + transcripts par step).
3. Deep-save v2 en localStorage uniquement (pas de checkpoint serveur) ; pénalités d'abandon founder inopérantes (TODO-DEBT).
4. Deltas founder dynamiques partiellement mappés (equity founder_02, devis founder_04 : statiques + TODO-DEBT) ; `/api/v2/complete` non authentifié (campaign_id = capability).
5. Studio gelé : compile, bannière visible, produit du v1 inutilisable — migration = chantier dédié.
6. Abstraction `Tool` non créée (décision figée : au premier outil réel). TTS supprimé (STT conservé pour presentation).

## 6. Mécaniques finales (7)

`entretien`, `qa`, `presentation`, `analyse`, `production`, `decision`, `negociation` — arbitrages complets (fusions : qualification, diagnostic, crise, priorisation ; écarts YAGNI : feedback, formation, facilitation, coordination) dans `docs/MECANIQUES.md`. Chaque mécanique est consommée par ≥3 scénarios.

## 7. Scénario vitrine

`vitrine_signer_le_pilote` (`/play/vitrine_signer_le_pilote`, ~45 min) : ingénieur commercial e-santé décroche un pilote en CH. entretien (découverte PUI) → analyse (data pack) → production (proposition) → qa (objections DSI) → negociation (termes du pilote) → presentation (COPIL). Vocabulaire complet (4 criticals, competencies, error_type), outputs chaînés de bout en bout. **Créé sans toucher une ligne de code moteur — c'est la preuve du modèle.**

## 8. Founder migré

Les 6 scénarios sont des séquences v2 (28 steps au total), ending ids strictement alignés sur `founder_rules.json` (garde-fou `validate:founder` réécrit). Flow : dashboard → `/play/<id>?campaign=<id>` → Shell → `/api/v2/complete` → outcome/deltas/microDebrief → dashboard. Le player founder dédié n'existe plus ; le dashboard reste (KPIs, timeline).

## 9. Chantiers suivants recommandés

1. **Session de jeu réelle + calibration des prompts actor/observe** (vitrine puis founder_01) — avant toute démo.
2. Replay admin v2 (transcripts + evaluationHistory par step, la vue « pourquoi ce verdict » que E-chantier promettait).
3. Premier `Tool` réel (grille de découverte pour `entretien`, ou kanban pour un futur scénario planification).
4. Persistence serveur des sessions v2 (remplace localStorage, ré-ouvre pénalités d'abandon founder).
5. Studio v2 (émettre des séquences de mécaniques — le gel saute).
6. Recréation de 2-3 scénarios catalogue depuis l'archive (~1 session pièce, du JSON pur — c'est la démonstration du scaling sublinéaire).

## 10. En quoi l'architecture est meilleure

Avant : ajouter un scénario = modifier le player (imports, switch, branches contenu dans modules et `/api/chat`). Scaling linéaire, 80 % du temps dans le code.
Après : le moteur est fini et fermé (7 mécaniques, 3 routes API génériques, un shell de 614 lignes) ; un scénario = un JSON + des prompts + des critères. La vitrine et founder_05 (6 steps, 5 mécaniques, inputs chaînés) existent sans une ligne de code spécifique. Les garde-fous sont triples (registry ↔ manifests ↔ schéma ; composer statique ; validateurs CLI) et le principe « l'IA observe, le moteur décide » est désormais structurel : aucune mécanique ne peut rendre un verdict, c'est le type system qui l'interdit. Le repo a perdu 26 700 lignes en gagnant de la capacité.
