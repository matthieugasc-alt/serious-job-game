# Audit complet — `app/scenarios/[scenarioId]/play/page.tsx`

**Date** : 2 mai 2026  
**Fichier** : `app/scenarios/[scenarioId]/play/page.tsx`  
**Taille** : 7 587 lignes — composant React monolithique  
**Périmètre** : lecture seule — aucune modification de fichier

---

## 1. Cartographie de page.tsx

Le fichier est un unique composant `"use client"` qui gère l'intégralité du gameplay : chat, email, documents, contrats, voix, timer, debrief. Voici le découpage par zones fonctionnelles :

| Lignes | Zone | Responsabilité |
|--------|------|----------------|
| 1–36 | Imports | 26 imports depuis `runtime.ts`, types, voiceCapture |
| 37–165 | Constantes & helpers | `ESTABLISHMENT_MAP`, `parseOutlineText`, `outlineToText`, `cloneSession`, `playNotificationSound`, `fmtTime`, `getInitials` |
| 167–245 | Sous-composants | `TypingDots`, `StatusDot`, `Avatar` — petits composants inline |
| 248–377 | State (72 useState) | Tout l'état du jeu déclaré en bloc monolithique |
| 380–598 | Fonctions helper internes | `apiHeaders`, `resolveActor`, `resolveDynamicActors`, `resolveEstablishmentPlaceholders`, `injectIntroEventsOnly`, `handleStartInterview`, `notifyCheckpointAdvance/Clear` |
| 600–646 | Refs + back button trap | Synchronisation des refs pour closures, `popstate` / `beforeunload` |
| 648–831 | Derived state + effects légers | `filteredConversation`, `contactUnreadCounts`, `canActuallySendMail`, toasts, unread tracking |
| 834–1138 | Debrief | `useEffect` debrief (200+ lignes) : appel `/api/debrief`, sauvegarde game record, extraction compétences |
| 1140–1344 | Initialisation | `useEffect` init : auth guard, chargement scénario, lock Founder, import S3→S4, anti-rollback, chargement prompts |
| 1346–1518 | Timer / clock effects | Simulated clock (1s tick), auto-advance (flags), time-based advance (`auto_advance_at`), `max_duration_sec`, flush timed events |
| 1520–1800 | Voice / présentation | Détection capabilities, TTS speech, auto-send transcript, hand raising, pitch timer 40s |
| 1800–2100 | Voice recording handlers | `startRecording`, `stopRecording`, `sendVoiceMessage`, transcription Whisper |
| 2100–2374 | Chat handler (sendMessage) | `/api/chat`, évaluation, NPC failure keywords, phase completion, dynamic actors, pivot S3 |
| 2376–2820 | Mail handler (handleSendMail) | Logique rupture CTO, scope_proposal auto-reply, negotiation_proposal extraction, pilot_pitch scoring, clinical pivot |
| 2820–2960 | Mail auto-reply S3 | Pitch évaluation, refus/acceptation établissements, contrat auto-envoi |
| 2960–3160 | AI chat for contracts | `sendNegotiationMessage` (pacte), clinical contract negotiation |
| 3160–3620 | Render helpers | `getActorInfo`, `renderMessage`, avatar rendering |
| 3627–4130 | Overlay : Pacte d'associés (S0) | ~500 lignes — HTML inline du contrat, articles, négociation thread, signature |
| 4132–4300 | Overlay : Contrat NovaDev (S2) | ~170 lignes — contrat dynamique, equity, features |
| 4303–4805 | Overlay : Devis négociation (S4) | ~500 lignes — checkboxes features, négociation chat, deal terms |
| 4807–5115 | Overlay : Contrat clinique (S3) | ~310 lignes — articles toxiques/modérés, négociation juriste |
| 5115–5320 | Overlay : One-pager (S1) | ~200 lignes — éditeur contentEditable, soumission |
| 5320–5500 | Briefing overlay + sidebar | Modal briefing, barre latérale navigation |
| 5500–6100 | Vue chat | Contact list, messages, input, voice controls |
| 6100–6700 | Vue mail | Inbox, compose, attachments |
| 6700–7100 | Vue documents | PDF viewer, inline docs |
| 7100–7400 | Vue notes (outline/mindmap) | Éditeur outline, vue arborescente |
| 7400–7587 | Debrief UI | Scores, compétences, boutons retour |

### Métriques structurelles

| Métrique | Valeur |
|----------|--------|
| `useState` | 72 déclarations |
| `useEffect` | 28 hooks |
| `useRef` | 22 refs |
| `useMemo` | 5 mémos |
| Appels API (`fetch`) | 27 appels vers 9 endpoints distincts |
| Overlays modaux | 5 (pacte, NovaDev, devis, clinique, one-pager) |
| Sous-composants inline | 3 (TypingDots, StatusDot, Avatar) |

---

## 2. Patterns de transition de phase

Chaque scénario utilise une combinaison de mécanismes pour passer d'une phase à la suivante. Voici les 8 patterns identifiés :

### Pattern 1 — Auto-advance sur flags (lignes 1361–1391)

Le `useEffect` surveille `view.canAdvance`. Quand les `completion_rules` sont satisfaites et que `auto_advance` est true dans la phase, la transition est immédiate. Utilisé par les phases de transition courtes (ex: `phase_3_accept` dans S0).

### Pattern 2 — Mail qui avance la phase (lignes 2413–2673)

`phase.mail_config.send_advances_phase = true`. L'envoi du mail déclenche `completeCurrentPhaseAndAdvance()`. Avant d'avancer, le code vérifie `completion_rules` (required_npc_evidence, min_score). Utilisé dans S1 (scope_proposal), S2 (negotiation_proposal), S3 (choice_confirmation, pilot_pitch).

### Pattern 3 — Timer max_duration_sec (lignes 1449–1504)

Compte le temps réel écoulé depuis le début de la phase. Quand `elapsed >= maxSec`, force l'avance ou termine le scénario si c'est la dernière phase. Gère les phases `manual_start` (le timer ne démarre qu'après "Faire entrer le candidat"). Utilisé dans S0 (entretiens 5min), S1 (pitch vocal 40s + Q&A).

### Pattern 4 — Auto-advance temporel simulé (lignes 1393–1429)

`auto_advance_at` référence une clé dans `scenario.timeline`. Quand le temps simulé atteint la deadline, la phase avance. Utilisé dans les scénarios avec timeline (ex: Fourvière).

### Pattern 5 — Manual start (lignes 527–574)

`phase.manual_start = true`. Le joueur voit un message d'intro (events avec `delay_ms=0`) puis doit cliquer "Faire entrer le candidat". Les events restants sont injectés seulement après le clic. Utilisé dans S0 (entretiens candidats CTO).

### Pattern 6 — Signature de contrat (lignes 3627–5115)

Les overlays de contrats (pacte, NovaDev, clinique, devis) ont chacun un bouton "Signer" qui set un flag (`pacteSigned`, `contractSigned`, `clinicalContractSigned`, `devisSigned`). Ce flag est ensuite détecté par les `completion_rules` pour débloquer l'avance.

### Pattern 7 — Voice/présentation (lignes 1523–1800)

Les phases vocales (pitch S1) utilisent un pipeline : enregistrement → transcription Whisper → envoi `/api/chat` ou `/api/evaluate-presentation`. Le pitch a un timer 40s avec auto-coupure du micro.

### Pattern 8 — NPC failure keywords (lignes 2280–2330)

Après chaque réponse IA, `checkNpcFailureKeywords()` vérifie si le NPC a prononcé des mots-clés d'échec. Si oui, `handlePhaseFailure()` déclenche un game over ou une pénalité.

---

## 3. Hard-codes — Références spécifiques aux scénarios

### 3.1 Identifiants de scénarios (18 références)

| Ligne | Référence | Contexte |
|-------|-----------|----------|
| 277 | `scenarioId === "founder_04_v1"` | Activation outil mindmap |
| 335 | `scenarioId.startsWith("founder_")` | Détection mode Founder (anti-rollback) |
| 619 | `scenarioId.startsWith("founder_")` | Redirection back button post-debrief |
| 866 | `scenarioId === "founder_00_cto"` | Debrief : calcul outcome S0 spécifique |
| 891 | `scenarioId === "founder_02_mvp"` | Debrief : calcul outcome S2 spécifique |
| 917 | `scenarioId === "founder_04_v1"` | Debrief : calcul outcome S4 spécifique |
| 1215 | `scenarioId?.startsWith("founder_04")` | Import établissement depuis S3 |
| 1217 | `cs.scenarioId === "founder_03_clinical"` | Référence croisée S3→S4 |
| 2332 | `scenarioId?.startsWith("founder_03")` | Pivot clinique dans chat handler |
| 2573 | `scenarioId?.startsWith("founder_03")` | Mail Alexandre post-choice_confirmation |
| 2593 | `scenarioId === "heritage_fourviere"` | Mail dynamique Claire (Fourvière) |
| 2781 | `scenarioId?.startsWith("founder_03")` | Évaluation pitch S3 |

### 3.2 Noms d'acteurs hardcodés (23 références)

| Acteur | Nb refs | Lignes principales |
|--------|---------|-------------------|
| `sofia_renault` | 5 | 448, 464, 2392, 2988, 3720+ |
| `marc_lefevre` | 2 | 448, 464 |
| `karim_benzarti` | 2 | 448, 464 |
| `alexandre_morel` | 8 | 1387, 2400, 2405, 2583, 2888, 2898, 2905, 5022 |
| `thomas_novadev` | 5 | 2502, 2682, 2731, 2768, 2508 |
| `contact_clinique` / `contact_chu` / `contact_saint_martin` | 3 | 2818, 2342+ |
| `claire_beaumont` | 2 | 2644, 2658 |

### 3.3 Mail kinds / mail_config (56 références)

| mailKind | Nb refs | Lignes |
|----------|---------|--------|
| `rupture_cto` | 2 | 2389–2407 |
| `scope_proposal` | 3 | 2456–2461 |
| `choice_confirmation` | 3 | 2464–2476, 2573 |
| `negotiation_proposal` | 4 | 2479–2555, 2725 |
| `pilot_pitch` | 2 | 2781–2960 |
| `analyse_rdv` | 1 | 2593 |
| `offer_cto` | 1 | 444 |
| Accès `mail_config.*` | 40+ | Dispersé (defaults, send_advances_phase, require_attachments, kind, on_send_flags) |

### 3.4 Phase IDs hardcodés (6 vérifications)

| Ligne | Phase ID | Contexte |
|-------|----------|----------|
| 2479 | `phase_2_negotiation` | Extraction prix contrat NovaDev |
| 2725 | `phase_2_negotiation` | Auto-reply Thomas en chat |
| 2339 | `phase_3_contract` | Fallback phaseId pivot clinique |
| 2581 | `phase_2_pitch_mail` | Fallback phaseId mail Alexandre S3 |
| 866–940 | multiples | Calcul d'outcome dans le debrief |

### 3.5 Flags métier hardcodés

Au moins 25 flags sont lus/écrits directement dans page.tsx :

`pacte_signed_clean`, `bad_leaver_triggered`, `cto_paid_to_leave`, `scope_reduced`, `alexandre_convinced`, `chose_chu`, `chose_saint_martin`, `chose_clinique`, `novadev_negotiated`, `switched_to_clinique`, `pivot_contract_sent`, `chose_chu`, `chose_saint_martin`, `chose_clinique` (dupliqués S3/S4), plus les flags de debrief outcome.

### 3.6 Données métier inline

| Ligne | Donnée | Description |
|-------|--------|-------------|
| 44–48 | `ESTABLISHMENT_MAP` | 3 établissements avec noms, emails, labels |
| 286–292 | `devisFeatures` | 5 features initiales du devis S4 |
| 2493–2495 | `plancherNovadev` | Plancher prix NovaDev (11 000 €) |
| 2522–2536 | `featureKeywords` | 12 mots-clés pour extraction features contrat |
| 2798–2807 | Pitch scoring | Mots-clés de scoring du pitch S3 (gratuit, valeur, data, durée) |
| 3627–4130 | Pacte HTML | Contenu intégral du pacte d'associés (articles, clauses) |
| 4132–4300 | Contrat NovaDev | Template contrat NovaDev |
| 4807–5115 | Contrat clinique | Articles contrat clinique avec flags toxique/modéré |
| 5115–5320 | One-pager | Template one-pager S1 |

---

## 4. Architecture modulaire proposée

### Vision

Remplacer le monolithe par un **shell léger** + des **handlers de phase enfichables** + des **services partagés**. Le shell gère le cycle de vie commun (auth, chargement scénario, timer, debrief). Chaque handler gère les spécificités d'un type de phase.

### Structure cible

```
app/scenarios/[scenarioId]/play/
├── page.tsx                        # Shell (~500 lignes)
├── hooks/
│   ├── useGameSession.ts           # State machine session + cloneSession
│   ├── usePhaseTimer.ts            # max_duration_sec + auto_advance_at
│   ├── useSimulatedClock.ts        # Tick 1s + flush timed events
│   ├── useVoiceCapture.ts          # Recording, TTS, transcription
│   ├── useMailComposer.ts          # Draft, validation, send
│   ├── useContactThread.ts         # Filtrage per-contact, unread counts
│   └── useDebrief.ts               # Appel API + sauvegarde
├── handlers/
│   ├── types.ts                    # PhaseHandler interface
│   ├── ChatPhaseHandler.ts         # Phases chat classiques
│   ├── MailPhaseHandler.ts         # Phases mail (envoi avance)
│   ├── VoicePhaseHandler.ts        # Pitch + Q&A vocal
│   ├── InterviewPhaseHandler.ts    # manual_start + timer
│   ├── ContractPhaseHandler.ts     # Signature contrat générique
│   └── registry.ts                 # Map interaction_mode → handler
├── overlays/
│   ├── PacteOverlay.tsx            # Pacte S0
│   ├── NovaDevContractOverlay.tsx  # Contrat S2
│   ├── DevisNegoOverlay.tsx        # Devis S4
│   ├── ClinicalContractOverlay.tsx # Contrat S3
│   ├── OnePagerOverlay.tsx         # One-pager S1
│   └── BriefingOverlay.tsx         # Modal briefing
├── views/
│   ├── ChatView.tsx                # Contact list + messages + input
│   ├── MailView.tsx                # Inbox + compose
│   ├── DocumentsView.tsx           # PDF viewer + inline docs
│   ├── NotesView.tsx               # Outline / mindmap
│   └── DebriefView.tsx             # Scores + compétences
└── services/
    ├── apiClient.ts                # fetch wrapper avec auth + retry
    ├── dynamicActors.ts            # resolveActor, resolveDynamicActors
    ├── establishmentResolver.ts    # ESTABLISHMENT_MAP + placeholders
    └── outcomeCalculator.ts        # Calcul outcome debrief par scénario
```

### Principes

**Principe 1 — Le shell ne sait rien des scénarios.** Il charge le JSON, initialise la session, orchestre les hooks communs. Il ne contient aucun `scenarioId ===` ni aucun nom d'acteur.

**Principe 2 — Les handlers sont déclaratifs.** Un handler déclare ce qu'il gère (interaction_mode, events supportés) et expose des callbacks standardisés. Le shell les appelle sans connaître leur logique interne.

**Principe 3 — Les overlays sont des composants isolés.** Chaque overlay reçoit son state via props et communique via callbacks. Aucune dépendance au session global.

**Principe 4 — Les données métier vivent dans les scenario.json.** Les `ESTABLISHMENT_MAP`, `featureKeywords`, `plancherNovadev`, templates de contrats doivent migrer vers la définition du scénario ou des fichiers de configuration dédiés.

---

## 5. Interface commune des handlers

```typescript
// handlers/types.ts

import type { ScenarioDefinition } from "@/app/lib/types";

/** Vue runtime simplifiée passée aux handlers */
interface PhaseContext {
  scenarioId: string;
  scenario: ScenarioDefinition;
  session: GameSession;
  view: RuntimeView;
  phase: PhaseDefinition;
  phaseIndex: number;
  playerName: string;
  promptsMap: Record<string, string>;
  flags: Record<string, any>;
}

/** Actions que le handler peut demander au shell */
interface PhaseActions {
  /** Remplace la session courante (immutable update) */
  updateSession: (updater: (prev: GameSession) => GameSession) => void;
  /** Envoie un message IA et applique l'évaluation */
  sendChatMessage: (message: string, toActor: string) => Promise<void>;
  /** Avance à la phase suivante */
  advancePhase: () => void;
  /** Termine le scénario */
  finishScenario: () => void;
  /** Ajoute un toast */
  addToast: (text: string, icon: string, type: "chat" | "mail") => void;
  /** Change la vue principale */
  setMainView: (view: MainView) => void;
  /** Sélectionne un contact */
  setSelectedContact: (actorId: string) => void;
  /** Joue un son de notification */
  playNotification: () => void;
}

/** Interface commune pour tous les handlers de phase */
interface PhaseHandler {
  /** Identifiant unique du handler */
  id: string;

  /** Détermine si ce handler gère la phase donnée */
  canHandle: (phase: PhaseDefinition, scenarioId: string) => boolean;

  /** Appelé quand la phase démarre (injection entry_events, etc.) */
  onPhaseEnter?: (ctx: PhaseContext, actions: PhaseActions) => void;

  /** Appelé quand le joueur envoie un message chat */
  onPlayerMessage?: (
    ctx: PhaseContext,
    actions: PhaseActions,
    message: string,
    toActor: string
  ) => Promise<void>;

  /** Appelé quand le joueur envoie un mail */
  onMailSent?: (
    ctx: PhaseContext,
    actions: PhaseActions,
    mail: MailDraft
  ) => Promise<void>;

  /** Appelé chaque seconde (pour timers, auto-advance) */
  onTick?: (ctx: PhaseContext, actions: PhaseActions, elapsedSec: number) => void;

  /** Appelé quand un flag change (pour réactions conditionnelles) */
  onFlagChange?: (
    ctx: PhaseContext,
    actions: PhaseActions,
    flagName: string,
    value: any
  ) => void;

  /** Retourne les overlays à afficher (contrats, etc.) */
  getOverlays?: (ctx: PhaseContext) => React.ReactNode[];

  /** Retourne les contrôles supplémentaires pour la zone d'input */
  getInputControls?: (ctx: PhaseContext) => React.ReactNode | null;

  /** Nettoyage quand on quitte la phase */
  onPhaseExit?: (ctx: PhaseContext, actions: PhaseActions) => void;
}
```

### Exemple d'implémentation : InterviewPhaseHandler

```typescript
// handlers/InterviewPhaseHandler.ts

const InterviewPhaseHandler: PhaseHandler = {
  id: "interview",

  canHandle: (phase) =>
    phase.interaction_mode === "chat" && !!phase.manual_start,

  onPhaseEnter: (ctx, actions) => {
    // N'injecte que les events delay_ms=0 (message d'intro Alexandre)
    injectIntroEventsOnly(ctx.session);
    actions.updateSession(() => ctx.session);
  },

  onTick: (ctx, actions, elapsedSec) => {
    const maxSec = ctx.phase.max_duration_sec;
    if (!maxSec) return;
    if (elapsedSec >= maxSec) {
      actions.advancePhase();
    }
  },

  getInputControls: (ctx) => {
    if (!ctx.session.interviewStarted) {
      return <button onClick={() => startInterview(ctx)}>
        Faire entrer le candidat
      </button>;
    }
    return null;
  },
};
```

---

## 6. Plan de migration progressif

### Étape 1 — Extraction des hooks (risque faible)

**Objectif** : réduire page.tsx de ~2000 lignes sans changer aucun comportement.

**Actions** :

- Extraire `useGameSession` : les 72 useState + cloneSession + refs de synchronisation. Le hook retourne un objet `{ session, setSession, scenario, ... }` et les méthodes de mutation.
- Extraire `usePhaseTimer` : les 3 useEffect de timer (simulated clock, auto-advance, max_duration_sec). Paramètres : session, scenario. Retourne : elapsed, simulatedTime.
- Extraire `useVoiceCapture` : les 8 useState voice + les 4 useEffect voice + les handlers start/stop/send. Retourne : isRecording, transcript, capabilities, controls.
- Extraire `useDebrief` : le useEffect debrief (lignes 834–1138). Paramètres : view, session, scenario. Retourne : debriefData, loading, error.

**Validation** : chaque hook est testé isolément avec le même page.tsx qui l'importe. Pas de changement de comportement observable.

**Taille estimée** : page.tsx passe de 7587 à ~5500 lignes.

### Étape 2 — Extraction des overlays (risque faible)

**Objectif** : sortir les 5 overlays contractuels dans des composants séparés.

**Actions** :

- Chaque overlay (PacteOverlay, NovaDevContractOverlay, etc.) devient un composant dans `overlays/`.
- L'interface est props-driven : le composant reçoit `session`, `flags`, `onSign`, `onClose`, etc.
- Le contenu HTML des contrats (actuellement inline dans le JSX) est externalisé dans des fichiers JSON ou des templates.

**Validation** : visuellement identique, même flow de signature.

**Taille estimée** : page.tsx passe de ~5500 à ~3800 lignes.

### Étape 3 — Extraction des vues (risque moyen)

**Objectif** : sortir ChatView, MailView, DocumentsView, NotesView, DebriefView.

**Actions** :

- Chaque vue reçoit via props tout ce qu'elle affiche et émet des events (onSendMessage, onSendMail, onSelectContact, etc.).
- Le shell page.tsx devient un orchestrateur : routing entre vues + sidebar + overlays.
- Les handlers de mail (handleSendMail, 450 lignes) et de chat (sendMessage, 280 lignes) restent dans le shell à cette étape — ils seront déplacés dans les handlers à l'étape 4.

**Validation** : tests end-to-end sur tous les scénarios actifs (founder_00 à founder_05).

**Taille estimée** : page.tsx passe de ~3800 à ~2000 lignes.

### Étape 4 — Handlers de phase (risque élevé)

**Objectif** : supprimer tous les `scenarioId ===` et noms d'acteurs hardcodés de page.tsx.

**Actions** :

- Implémenter le PhaseHandler interface et le registry.
- Migrer chaque branche conditionnelle vers un handler :
  - `InterviewPhaseHandler` ← logique manual_start, timer 5min
  - `MailAdvanceHandler` ← logique send_advances_phase, completion_rules check
  - `ContractSignatureHandler` ← ouverture overlay, flags de signature
  - `PitchVoiceHandler` ← timer 40s, enregistrement, évaluation
  - `NegotiationHandler` ← extraction prix/features, plancher, auto-reply
  - `S3PivotHandler` ← choix établissement, pivot clinique, pitch scoring
- Déplacer les données métier (ESTABLISHMENT_MAP, featureKeywords, plancherNovadev) dans les scenario.json sous une clé `ui_config` ou `handler_config`.
- Déplacer les templates de contrats dans des fichiers dédiés (JSON ou HTML).

**Validation** : test headless engine sur les 6 scénarios Founder + test manuel.

**Taille estimée** : page.tsx passe de ~2000 à ~500 lignes (shell pur).

---

## 7. Garanties anti-régression

### 7.1 Tests existants

Le framework de test headless (`scripts/test-scenarios/`) peut exécuter les 6 scénarios Founder avec 10 profils d'agents. Il couvre le flow complet (init → phases → debrief) mais ne teste pas le rendu UI.

### 7.2 Risques identifiés

| Risque | Sévérité | Mitigation |
|--------|----------|------------|
| **Closures stale** : les 22 refs sont utilisées dans des closures asynchrones (setTimeout, fetch.then). L'extraction dans des hooks risque de casser les références si le hook ne renvoie pas les mêmes refs. | Haute | Chaque hook conserve ses propres refs internes. Le shell ne passe pas de refs en props. |
| **Ordre d'exécution des effects** : les 28 useEffect ont des dépendances implicites entre eux (ex: init doit précéder timer). L'extraction dans des hooks séparés pourrait changer l'ordre. | Haute | Les hooks sont appelés dans le même ordre que les effects actuels. Aucun hook conditionnel. |
| **State partagé entre overlays et handlers** : le pacte overlay lit `chosenCtoId` qui dépend de `session.sentMails`. Si le state est fragmenté entre hooks, les mises à jour pourraient être désynchronisées. | Moyenne | Un seul hook `useGameSession` possède le state session. Les autres hooks le reçoivent en lecture. |
| **Mail handler side effects** : `handleSendMail` fait 450 lignes avec 8 branches conditionnelles qui toutes modifient `session` ET appellent `setSession` à des moments différents (certaines avec `return` précoce). | Haute | Migrer handleSendMail en dernier (étape 4). Chaque branche devient un handler distinct. Tester chaque handler isolément. |
| **Contrats inline** : le HTML des contrats est directement dans le JSX avec des expressions dynamiques (`chosenCtoId \|\| "sofia_renault"`). L'extraction nécessite de paramétrer chaque variable. | Moyenne | Inventorier toutes les variables dynamiques avant extraction. Template avec placeholders remplacés au runtime. |
| **Debrief outcome hardcodé** : le calcul d'outcome (lignes 866–940) contient des `scenarioId ===` avec une logique métier différente par scénario. | Moyenne | Déplacer la logique d'outcome dans les scenario.json (clé `outcome_rules`) ou dans un module `outcomeCalculator.ts`. |

### 7.3 Garde-fous recommandés

**Avant chaque étape** :

1. Snapshot du comportement actuel : exécuter les 6 scénarios Founder avec le test headless et sauvegarder les logs comme référence.
2. Capture des métriques : nombre de phases traversées, scores, outcomes, mails envoyés, flags finaux.

**Pendant chaque étape** :

3. Règle stricte : chaque extraction produit un diff qui ne modifie PAS le comportement observable. Le test headless doit produire les mêmes métriques.
4. Pas de refactor opportuniste : ne pas corriger de bugs ni améliorer la logique pendant l'extraction.
5. Un PR par extraction : chaque hook, chaque overlay, chaque vue = un PR indépendant.

**Après chaque étape** :

6. Ré-exécuter le test headless sur les 6 scénarios.
7. Test manuel des flows critiques : signature pacte (S0), envoi mail scope (S1/S2), pitch + refus (S3), négociation devis (S4), rupture CTO (S0).
8. Vérifier que le validateur (`npm run validate:scenarios`) passe toujours sans erreur sur les scénarios actifs.

---

## Annexe — Endpoints API utilisés

| Endpoint | Méthode | Lignes | Usage |
|----------|---------|--------|-------|
| `/api/auth/session` | GET | 1154 | Validation token au démarrage |
| `/api/scenarios/{id}` | GET | 1172 | Chargement scenario.json |
| `/api/scenarios/{id}/prompts/{actorId}` | GET | 1320 | Chargement prompts IA |
| `/api/founder/campaigns` | GET | 1184 | Vérification campagne active |
| `/api/founder/checkpoint` | POST | 579, 593, 1247 | Anti-rollback (enter/advance/clear) |
| `/api/chat` | POST | 1883, 2125, 2242, 2620, 2688, 2746, 2995, 3110, 4410 | Chat IA (9 appels) |
| `/api/tts` | POST | 2053 | Text-to-speech |
| `/api/debrief` | POST | 1028 | Génération debrief |
| `/api/evaluate-presentation` | POST | 1642 | Évaluation pitch vocal |
| `/api/profile/save-game` | POST | 1095 | Sauvegarde partie |
| `/api/profile/extract-skills` | POST | 1126 | Extraction compétences |
| `/api/download` | GET | 3893, 5269, 6242, 6546, 7396 | Téléchargement documents |
