# Architecture du Player — état au 1er juillet 2026

> Documentation exhaustive de l'architecture du player (`app/scenarios/[scenarioId]/play/`) après refacto **PRIO 1 → PRIO 11**.
> Ce document est la source de vérité pour comprendre où vivent les mécaniques et où vivent les textes scénario.

---

## 1. Vue d'ensemble

Le player est le composant React qui **joue un scénario** (S0 → S5+) : il orchestre l'affichage de la conversation, du mail, des overlays de signature de contrats, de la présentation vocale et de tout ce qui permet au joueur d'incarner le CEO d'Orisio dans un scénario de formation.

### Chiffres clés

```
page.tsx    : 3 035 lignes  (était 5 579 → −45,6 %)
Modules     : 47 fichiers dans hooks/, handlers/, lib/, components/, contracts/
Total       : ~16 000 lignes
Contraintes : TypeScript strict vert · validate:scenarios vert
```

### Philosophie de séparation

Trois couches strictes, dans cet ordre :

| Couche | Rôle | Contient du texte scénario ? |
|---|---|---|
| **Scenario JSON** (`data/scenarios/*.json`) | Source de vérité : phases, actors, mail_config, prompts, entry_events | ✅ **Oui**, c'est son job |
| **Data layer** (`lib/*Templates.ts`, `lib/establishmentMap.ts`, `handlers/ContractHandler.ts`) | Textes hérités du player qui n'ont pas encore migré dans le JSON scénario | ⚠️ Oui, mais isolé, jamais mélangé à la logique |
| **Mechanic layer** (`handlers/*`, `lib/fetch*`, `lib/check*`, hooks) | Logique pure, réutilisable cross-scénario | ❌ **Zéro** texte scénario |

**Règle d'or** : si tu veux ajouter un scénario S6 qui suit le même pattern qu'un existant, tu ne dois modifier **aucun** fichier de la couche mécanique. Tu ajoutes le JSON, éventuellement une entrée data, et c'est tout.

---

## 2. Structure des dossiers

```
app/scenarios/[scenarioId]/play/
├── page.tsx                              # 3 035 L — l'orchestrateur central
├── ARCHITECTURE.md                       # ce fichier
│
├── ChatView.tsx                          # composant vue chat (déjà existant)
├── MailView.tsx                          # composant vue mail (refacto -20 %)
├── NotesView.tsx                         # composant vue notes mindmap
├── DocumentsView.tsx                     # composant vue documents
├── DebriefView.tsx                       # composant vue debrief de fin
│
├── hooks/                                # 14 hooks React
│   ├── useScenarioInit.ts                # boot sequence complète (auth + fetch + reprise checkpoint)
│   ├── usePhaseTimer.ts                  # timers max_duration_sec par phase
│   ├── useDebrief.ts                     # génération du debrief AI
│   ├── useTTS.ts                         # text-to-speech OpenAI + fallback Web Speech API
│   ├── useToasts.ts                      # file d'attente des toasts notifications
│   ├── useFounderCheckpoint.ts           # sync serveur des checkpoints founder (advance/clear/rollback)
│   ├── useNewItemNotifications.ts        # toast à chaque nouveau mail / message chat
│   ├── useMailSendValidation.ts          # canActuallySendMail + mailSendBlockReason
│   ├── useOnePagerEditor.ts              # état overlay one-pager S1 (3 useStates)
│   ├── useOutlineNotes.ts                # notes mindmap : text + items + feedback
│   ├── usePacteContract.ts               # état overlay pacte S0 (7 useStates)
│   ├── useNovadevContract.ts             # état overlay contrat S2 (7 useStates)
│   ├── useDevisNegotiation.ts            # état overlay devis S4 (10 useStates + ref)
│   ├── useClinicalContract.ts            # état overlay convention S3 (7 useStates)
│   └── useExceptionsContract.ts          # état overlay bon de commande S5 (6 useStates)
│
├── handlers/                             # logique métier (dispatch, actions, modules)
│   ├── index.ts                          # barrel
│   ├── registry.ts                       # resolvePhaseHandler par phase
│   ├── types.ts                          # types ModuleAction, ContractType, etc.
│   ├── applyModuleActions.ts             # dispatcher 30+ types d'actions ★
│   ├── executeMailAsyncEffect.ts         # 4 kinds mail (HARD_REJECT, pivot Clinique, …) ★
│   ├── contractNegotiationSenders.ts     # runContractNegotiation pour S0/S2/S5 ★
│   ├── dynamicActorResolution.ts         # chosen_cto / chosen_kol / establishment
│   ├── ContractHandler.ts                # config contrat (phaseTitle, phaseFocus, buildArticles, computeSign)
│   ├── InterviewHandler.ts               # config interview S0 phase 1
│   ├── MailHandler.ts                    # helper legacy mail-side
│   ├── PhaseOrchestrator.ts              # dispatch entre modules par phase
│   ├── PhaseModuleRegistry.ts            # résolution modules[] par phase
│   └── modules/                          # implémentations concrètes des modules
│       ├── MailModule.ts                 # handle mail_sent, dsi_validation, etc.
│       ├── ContractModule.ts             # handle contract_signed
│       ├── InterviewModule.ts            # handle interview flow
│       └── types.ts                      # types Module, ModuleContext
│
├── lib/                                  # helpers purs (aucun state React)
│   ├── phaseEventTracker.ts              # clés d'idempotence des entry_events
│   ├── playerUtils.ts                    # cloneSession, playNotificationSound, fmtTime, getInitials
│   ├── outlineParser.ts                  # parse "1. Item\n  1.1 Sub" en OutlineItem[]
│   ├── establishmentMap.ts               # S3/S4 : chose_chu | chose_sm | chose_clinique → {name, email, label}
│   ├── clinicalContractTemplates.ts      # S3 : buildClinicalArticles(chu|sm|clinique) — data pure
│   ├── fetchChatWithRetry.ts             # POST /api/chat avec retry 401/429/5xx/network ★
│   ├── checkCompletionRules.ts           # évaluation npc_evidence + player_evidence + min_score
│   └── getActorInfo.ts                   # resolve chosen_cto + build display tuple
│
├── components/                           # composants React UI (présentation pure)
│   ├── Avatars.tsx                       # Avatar / TypingDots / StatusDot
│   ├── PlayerHeader.tsx                  # top bar (logo, phases, clock, briefing)
│   ├── ResumeBanner.tsx                  # bannière reprise + SaveInfo strip
│   ├── ToastContainer.tsx                # file de toasts en fixed
│   ├── DebugPanel.tsx                    # panneau ?debug=1 avec jump-to-phase
│   ├── InlineDocModal.tsx                # modale d'affichage doc plein texte
│   ├── BriefingOverlay.tsx               # overlay briefing scénario + grille docs
│   ├── OnePagerEditor.tsx                # overlay one-pager S1 (contentEditable)
│   ├── PresentationModeView.tsx          # vue plein écran mode presentation + voice_qa
│   ├── LeftSidebar.tsx                   # tabs Chat/Mail/Notes + contacts + objectif
│   ├── RightPanel.tsx                    # tabs Contexte + Documents
│   └── mail/
│       ├── MailSignButton.tsx            # 6 boutons signature → 1 composant ★
│       └── ContactPickerPopover.tsx      # popover répertoire (To + Cc)
│
└── contracts/                            # sous-module contract (existait avant refacto)
    ├── index.ts                          # barrel
    ├── types.ts                          # ContractClause, ContractThreadMessage, NegotiationResult
    ├── contractModel.ts                  # buildArticles, computeS0/S2/S5Sign, DEVIS_FEATURES_DATA
    ├── contractNegotiation.ts            # sendNegotiationMessage — appel API + parse modifications
    ├── ContractOverlay.tsx               # UI signature standard (S0/S2/S5)
    ├── ContractOverlayHost.tsx           # host qui multiplexe 4 overlays (S0+S2+S4+S5)
    └── ClinicalContractOverlay.tsx       # UI signature S3 (variante à part)
```

★ = mécanique factorisée, réutilisée par plusieurs scénarios.

---

## 3. `page.tsx` — l'orchestrateur central

### Rôle

Le composant `Play` est le seul composant React de niveau route. Il coordonne :

1. **Le boot** (via `useScenarioInit`) : auth token, fetch scenario JSON, résumé checkpoint, injection entry_events initial.
2. **Les useStates partagés** que plusieurs sous-composants doivent lire/écrire (session, view, playerInput, selectedContact, mainView, showCompose, etc.).
3. **La dispatch des actions modules** (`applyModuleActions`, `dispatchEnterPhase`, `dispatchContractSigned`).
4. **Les senders chat/mail/négociation** (`sendMessage`, `handleSendMail`, `sendPacteNegotiationMessage`, `sendNovadevNegotiationMessage`, `sendExceptionsNegotiationMessage`, `sendDevisNegoMsg`, `sendClinicalNegotiationMessage`, `generateNPCMessage`, `dispatchVoiceQAMessage`).
5. **Les side effects async voix** (`startRecognition`, `stopRecognition`, `endPresentation`).
6. **Le rendu du BODY** : soit `PresentationModeView` (presentation/voice_qa), soit la mise en page 3 colonnes (`LeftSidebar` + main + `RightPanel`).

### Anatomie du fichier

```
Lignes         Section
────────────────────────────────────────────
1-100          Imports (Next, React, MailView, ChatView, tous les modules extraits)
100-350        useStates + useRefs (~50 useStates + ~15 refs)
              → hooks composés : usePacteContract, useNovadevContract, useDevisNegotiation,
                useClinicalContract, useExceptionsContract, useOnePagerEditor, useOutlineNotes,
                useToasts, useTTS, useFounderCheckpoint
355-500        Derived values (useMemo) : phases, view, currentPhaseId, currentPhaseAiActors,
              currentInteractionMode, phaseTitle, phaseObjective, inboxMails, selectedMail,
              attachableDocs, allDocuments, chosenCtoId, chosenKolId, filteredConversation, etc.
500-630        Auto-scroll, auto-focus, phase timer effects, unread badge effects
630-720        Fonctions helpers thin wrappers (resolveDynamicActors, resolveEstablishmentPlaceholders,
              injectIntroEventsOnly, handleStartInterview)
720-900        useDebrief + useScenarioInit + usePhaseTimer + useNewItemNotifications
900-1000       Voice capabilities detection, chat scroll useEffects
1000-1500      Voice pipeline : recording, pitch timer, dispatchVoiceQAMessage,
              startRecognition, stopRecognition, generateNPCMessage, endPresentation
1500-1800      sendMessage (250 L, ~25 dépendances) + applyModuleActions wrapper
              + executeMailAsyncEffect wrapper + dispatchEnterPhase + dispatchContractSigned
1800-2000      handleSendMail (140 L : MailModule dispatch + legacy fallback)
              + updateDraft + handleToggleAttachment + handleNewCompose + handleReplyAll
2000-2100      6× handleOpen*Sign (pacte, novadev, clinical, devis, exceptions, onepager)
              + 4× handleNotes* + getActorInfo wrapper
2100-2450      3× sendXxxNegotiationMessage → délègue à runContractNegotiation
              + sendDevisNegoMsg + sendClinicalNegotiationMessage + handleClinical*
2450-2860      JSX header (ToastContainer, ResumeBanner, SaveInfo, PlayerHeader) +
              ContractOverlayHost + ClinicalContractOverlay + OnePagerEditor + BriefingOverlay +
              InlineDocModal + DebugPanel
2860-3035      BODY switch : PresentationModeView | (LeftSidebar + main + RightPanel)
              + wiring des ChatView / MailView / NotesView
```

### Ce qui reste (volontairement) dans page.tsx

- **`sendMessage`** (~200 L) : la fonction principale du chat. Trop couplée à 25 dépendances internes (`resolveActor`, `currentPhaseAiActors`, `buildChatContext`, `checkNpcSuccessKeywords`, `checkNpcFailureKeywords`, `handlePhaseFailure`, `scheduleInterruption`, `updateAdaptiveMode`, etc.) pour être extraite sans props drilling massif.
- **`handleSendMail`** (~140 L) : MailModule dispatch + legacy fallback. Même problème.
- **`endPresentation`** (~250 L) : orchestration fin de présentation vocale + advance phase + eval API. 20 deps internes.
- **`dispatchVoiceQAMessage`** (~80 L après refacto) : round-robin jury + payload chat.
- **CENTER main** (~100 L de JSX) : c'est déjà 3 délégations à `ChatView` / `MailView` / `NotesView`. Extraire un wrapper reviendrait à shifter 50 props sans gain.

Ces blocs vivent dans page.tsx parce que **le seuil raisonnable de découpage est atteint**. Aller plus loin nécessiterait un React Context partagé, ce qui est un chantier à part.

---

## 4. Les mécaniques factorisées ★

C'est le cœur du refacto. **5 mécaniques centrales** qui remplacent du code dupliqué à travers les scénarios.

### 4.1 `runContractNegotiation` — la fusion pacte/novadev/exceptions

**Fichier** : `handlers/contractNegotiationSenders.ts` (143 L)

**Avant** : 3 fonctions asynchrones quasi-identiques dans page.tsx (`sendPacteNegotiationMessage`, `sendNovadevNegotiationMessage`, `sendExceptionsNegotiationMessage`), chacune ~110 L de code dupliqué avec de minuscules variations.

**Après** : 1 seule fonction `runContractNegotiation(opts)` avec les spécificités injectées via opts :

```typescript
runContractNegotiation({
  contractType: "s0_pacte" | "s2_novadev" | "s5_exceptions",
  text, isAlreadyLoading, articles, thread,
  setArticles, setThread, setLoading, clearInput,
  roleplayPrompt, narrative, playerName, apiHeaders,
  // Opt-ins pour spécificités par contrat :
  pacteFlagsHook?: {              // S0 uniquement
    mentionsExclusivity: boolean,
    applyFlagsBeforeCall,
    onAcceptanceAfterExcl,
  },
  sessionLog?: {                  // S5 uniquement
    actorId,
    log: (playerLine, counterpartReply) => void,
  },
});
```

Les 3 wrappers dans page.tsx font maintenant 25 L chacun (au lieu de 110).

**Zéro texte scénario** dans cette mécanique : `phaseTitle` et `phaseFocus` sont obtenus par le caller via `ContractHandler.getNegotiationConfig(type)` et passés en opts.

### 4.2 `MailSignButton` — 6 boutons signature → 1 composant

**Fichier** : `components/mail/MailSignButton.tsx` (147 L)

**Avant** : 6 blocs de ~50 L de JSX quasi-identiques dans MailView pour les CTA "Ouvrir et signer …" (pacte S0, contrat S2, convention S3, devis S4, bon de commande S5, one-pager S1).

**Après** : 1 composant avec 3 variantes (signed badge vert / refused badge rouge / CTA button) × 2 couleurs (gold pour contrats, purple pour one-pager).

```tsx
<MailSignButton
  signed={pacteSigned}
  signedTitle="Pacte signé"
  signedSubtitle="Renvoyez le pacte signé par mail au CTO pour finaliser."
  ctaLabel="✍️ Ouvrir et signer le pacte"
  onClick={onOpenPacteSign}
/>
```

Aucun texte hardcodé dans le composant : tout vient des props.

### 4.3 `fetchChatWithRetry` — HTTP robuste réutilisé 3 fois

**Fichier** : `lib/fetchChatWithRetry.ts` (95 L)

Gère le retry `POST /api/chat` avec :

- **401** → refresh token depuis `localStorage["auth_token"]` et retry
- **429** → attend `retryAfterMs` (cappé à 5 s) et retry
- **5xx / network** → backoff linéaire (800 ms × attempt), retry
- Retourne `{ data, error }` — jamais de throw non catché

Utilisé par : `sendMessage`, `dispatchVoiceQAMessage`, `generateNPCMessage`. Avant, chacun avait sa propre boucle de retry, avec de subtiles divergences (bugs en puissance).

### 4.4 `ContractOverlayHost` — 4 overlays multiplexés

**Fichier** : `contracts/ContractOverlayHost.tsx` (existait déjà)

Un composant qui rend jusqu'à 4 overlays (s0/s2/s4/s5) selon `visible`. La convention S3 est à part (`ClinicalContractOverlay`) parce que ses articles ont un shape différent (toxic/moderate booleans supplémentaires).

### 4.5 `applyModuleActions` — dispatcher générique

**Fichier** : `handlers/applyModuleActions.ts` (284 L)

Un switch sur 30+ types d'actions retournées par les modules (MailModule, ContractModule, InterviewModule) : `set_flags`, `add_ai_message`, `add_player_message`, `open_contract`, `schedule_mail`, `advance_phase`, `finish_scenario`, `apply_penalty`, etc.

C'est le point de convergence de tout side-effect métier issu du module system.

---

## 5. Le data layer (textes scénario isolés)

Ces fichiers **contiennent du texte scénario-spécifique** mais sont isolés dans des fichiers dédiés, jamais dans une mécanique.

### `lib/clinicalContractTemplates.ts` (S3)

3 variantes complètes du contrat de test pilote clinique :

- `CHU_ARTICLES` (11 articles, dont art_5 IP + art_6 intéressement flagués `toxic`)
- `SAINT_MARTIN_ARTICLES` (9 articles, art_7 + art_9 flagués `moderate`)
- `CLINIQUE_ARTICLES` (8 articles, propres)

Exposé par `buildClinicalArticles(type: "chu" | "sm" | "clinique")` qui renvoie une copie fraîche (pour permettre la mutation `modifiedContent` sans polluer les templates).

### `lib/establishmentMap.ts` (S3/S4)

```typescript
{
  chose_chu:          { name: "Dr. Pierre Lemaire",       email: "p.lemaire@chu-bordeaux.fr",           label: "le CHU de Bordeaux" },
  chose_saint_martin: { name: "Laurent Castex",           email: "l.castex@hp-saintmartin.fr",           label: "l'Hôpital Saint-Martin" },
  chose_clinique:     { name: "Dr. Claire Renaud-Picard", email: "c.renaud-picard@clinique-saint-augustin.fr", label: "la Clinique Saint-Augustin" },
}
```

Utilisé par `handlers/dynamicActorResolution.ts` pour résoudre `{{establishment_email}}` dans `phase.mail_config.defaults` et `{{establishment_label}}` dans `entry_events.content`.

### `handlers/ContractHandler.ts` (existait déjà)

Un switch par `contractType` qui retourne `{ actorId, phaseTitle, phaseFocus, fallbackError }` pour chaque contrat. Contient aussi `buildArticles(type, vars)` qui appelle les builders spécifiques (`buildPacteArticles`, `buildNovadevArticles`, `buildExceptionsArticles`).

### `components/OnePagerEditor.tsx` — le seul "monolithe résiduel"

Le composant contient en dur :
- Le titre "One-Pager — Orisio" (S1 spécifique)
- Le destinataire par défaut "jury@technowest.fr"
- 8 sections `SECTIONS[]` avec titre + placeholder

**C'est le seul cas où du texte scénario-spécifique n'a pas été externalisé** parce que le composant est déjà scénario-spécifique (utilisé uniquement par S1). Idéalement le titre + destinataire viendraient de `scenario.narrative` ou d'une nouvelle section `scenario.one_pager_config`. Ce serait un chantier "config-first" à part.

---

## 6. Flux de données — les 3 flux principaux

### 6.1 Envoi d'un message chat

```
Joueur tape dans ChatView
  → onSendMessage prop (bindé à sendMessage dans page.tsx)
    → sendMessage()
      → resolveActor (chosen_cto → real actor)
      → guards (mail-only actor ? phase timer expiré ?)
      → cloneSession + addPlayerMessage (optimistic)
      → buildChatContext (C3 : cofounder awareness)
      → fetchChatWithRetry(chatPayload) ★
        → returns { data, error }
      → addAIMessage + applyEvaluation
      → checkNpcSuccessKeywords / checkNpcFailureKeywords
      → S3-specific: detect pivot Clinique
      → updateAdaptiveMode + scheduleInterruption
      → setSession(final)
```

### 6.2 Envoi d'un mail

```
Joueur clique Send dans MailView
  → onSendMail prop (bindé à handleSendMail)
    → handleSendMail()
      → cloneSession + sendCurrentPhaseMail
      → fireMailSent (logging)
      → resolveModules(phase) → MailModule si active
        ▶ MailModule.handle({ type: "mail_sent", mailKind, mailBody })
          → returns ModuleAction[]
          → applyModuleActions(actions, next) ★
          → RETURN (skip legacy)
      → LEGACY FALLBACK :
        → checkCompletionRules ★ (npc_evidence + player_evidence + min_score)
        → si pass : completeCurrentPhaseAndAdvance
          + resolveDynamicActors ★ + resolveEstablishmentPlaceholders ★
          + injectPhaseEntryEvents + dispatchEnterPhase
          + reset next phase mail draft
      → setSession + setShowCompose(false)
```

### 6.3 Signature d'un contrat (ex : pacte S0)

```
Joueur clique "Ouvrir et signer le pacte" dans MailView
  → MailSignButton onClick ★ → onOpenPacteSign
    → handleOpenPacteSign()
      → si articles vides : ContractHandler.buildArticles("s0_pacte", vars)
      → setShowSignatureView(true)

ContractOverlayHost ★ affiche s0 = ContractOverlay avec articles

Joueur tape un amendment → sendPacteNegotiationMessage(text)
  → runContractNegotiation ★ ({
      contractType: "s0_pacte",
      pacteFlagsHook: { … },  # spécificité S0
      …
    })
    → sendNegotiationMessage → API /api/chat
    → applyModifications sur articles
    → détection acceptation exclusivité → set flag pacte_signed_clean

Joueur clique "Signer" → onSign
  → dispatchContractSigned("s0_pacte", extra, next)
    → ContractModule handle → ModuleAction[]
    → applyModuleActions ★
```

---

## 7. Mécaniques de jeu (par grande famille)

### 7.1 Phase system

- **Boot** : `useScenarioInit` charge le scenario, résout dynamic_actor placeholders, injecte les entry_events initiaux.
- **Avance** : `completeCurrentPhaseAndAdvance` (runtime.ts) marque la phase complétée, incrémente `currentPhaseIndex`. Ensuite `resolveDynamicActors` + `resolveEstablishmentPlaceholders` + `injectPhaseEntryEvents` + `dispatchEnterPhase` (module system).
- **Retour arrière** : `handlePhaseFailure` (runtime.ts) détecte les keywords de refus NPC et rollback le currentPhaseIndex. Cas d'usage principal : S5 HARD_REJECT (KOL refuse → retour phase_1_prospection).
- **Timer max_duration** : `usePhaseTimer` déclenche l'expiration si `max_duration_sec` dépassé.
- **Checkpoint founder** : `useFounderCheckpoint` sync le serveur à chaque advance/clear/rollback.

### 7.2 Chat AI

Piloté par `sendMessage` + `dispatchVoiceQAMessage` (voice_qa) + `generateNPCMessage` (child questions).

- **Retry HTTP** : `fetchChatWithRetry ★`
- **Enrichissement contexte** : `buildChatContext` (C3) injecte les mails envoyés et les KOL profiles pour donner à l'AI la mémoire cross-actor.
- **Évaluation** : `applyEvaluation` applique `matched_criteria`, `score_delta`, `flags_to_set` retournés par l'API.
- **Round-robin jury** : `dispatchVoiceQAMessage` fait tourner les questions entre les jurés d'une phase voice_qa multi-actors.

### 7.3 Mail

- **Envoi** : `handleSendMail` (MailModule dispatch + legacy fallback).
- **Draft persistence** : les brouillons vivent dans `session.mailDrafts[phaseId]`, avec un système de "saved drafts" pour permettre de basculer entre destinataires sans perdre le contenu (`session.savedDrafts[phaseId::to]`).
- **Attachments** : `session.mailDrafts[phaseId].attachments = [{id, label}]`, référencent `scenario.resources.documents[docId]`.
- **Async replies** : `executeMailAsyncEffect` gère les 4 kinds :
  - `mail_auto_reply` (réponse instant)
  - `mail_inbox_reply` (réponse AI avec HARD_REJECT possible et pivot Clinique S3)
  - `negotiation_chat_reply` (négociation via chat après un mail)
  - `fourviere_dynamic_mail` (mail généré dynamiquement post-pitch)

### 7.4 Contrats

- **Data** : `contracts/contractModel.ts` (buildArticles) + `lib/clinicalContractTemplates.ts` (S3 spécifique).
- **Négociation** : `runContractNegotiation ★` (S0/S2/S5) + inline (S3 clinical, S4 devis).
- **Signature** : `dispatchContractSigned` → `ContractModule.handle({ type: "contract_signed", contractType, extra })` → `ModuleAction[]` → `applyModuleActions ★`.
- **Overlay UI** : `ContractOverlayHost ★` pour S0/S2/S4/S5 + `ClinicalContractOverlay` pour S3.

### 7.5 Voice / TTS / présentation

- **Capture** : `startRecognition` / `stopRecognition` via `lib/voiceCapture` (native SpeechRecognition en priorité, MediaRecorder + `/api/transcribe` en fallback pour Firefox).
- **TTS** : `useTTS` (OpenAI TTS primary + Web Speech API fallback).
- **Présentation** : `endPresentation("manual" | "auto")` termine la capture, envoie le transcript à `/api/evaluate-presentation`, advance la phase.
- **Voice QA** : `dispatchVoiceQAMessage` (round-robin jury) + `PresentationModeView` (UI).
- **Pitch timer S3** : 40 secondes avec code couleur, cutoff auto → passe aux questions du jury.

### 7.6 Notifications & UX

- **Toasts** : `useToasts` + `useNewItemNotifications` (trigger toast à chaque nouveau mail + nouveau message chat, tant que le joueur n'est pas déjà sur cet onglet).
- **Unread badge mail** : incrémenté dans `useNewItemNotifications`, cleared quand `mainView === "mail"`.
- **Auto-scroll chat** : useEffect qui scroll `chatEndRef` à chaque nouveau message.

---

## 8. Défauts et dettes techniques 🔥

**Section critique : voici ce qui ne va pas encore.**

### 8.1 Défauts architecture

#### 🔴 Pas de React Context

Toute la coordination passe par des props. C'est OK pour les composants extraits (chacun 10-15 props), mais bloque toute extraction supplémentaire :
- `PresentationModeView` reçoit 35 props (dont 10 callbacks). C'est le max raisonnable.
- Extraire `sendMessage` ou `handleSendMail` demanderait 25+ props → props drilling ingérable.
- Extraire un `<MainContent>` (Chat + Mail + Notes wrapper) demanderait 50 props.

**Fix** : introduire un `PlayerContext` avec `{ session, view, scenario, actors, helpers, refs, setters }` avant tout refacto futur.

#### 🔴 Fonctions inline massives dans page.tsx

Toujours dans page.tsx :
- `sendMessage` : 200 L, 25 deps
- `handleSendMail` : 140 L
- `endPresentation` : 250 L
- `applyEvaluation`, `updateAdaptiveMode`, `scheduleInterruption`, `handlePhaseFailure`, `checkNpcSuccessKeywords`, `checkNpcFailureKeywords` : appellent runtime.ts mais sont wrappées dans page.tsx.

Total : ~700 L de logique métier orchestration qui pourrait vivre dans un `hooks/useGameEngine.ts` si React Context était en place.

#### 🟡 Divergence S3 clinical + S4 devis

`runContractNegotiation` n'englobe pas S3 (clinical) ni S4 (devis) :
- **S3 clinical** : le prompt construit inline avec balises `[MODIFICATION article_X]` + parser regex custom. `sendClinicalNegotiationMessage` fait 80 L à part.
- **S4 devis** : `scopeContext` (features + prix) + `parseDealTag` (extraction dealTerms). `sendDevisNegoMsg` fait 70 L à part.

Fusionner ces 2 dans la mécanique demanderait d'abstraire encore un cran (builders de prompt + parsers comme function-props). C'est possible mais transforme l'abstraction en plumbing.

#### 🟡 Fichiers `_Legacy` et code mort à côté

- `hooks/useTTS.ts` créé, branché. ✅
- `hooks/useFounderCheckpoint.ts` créé, branché. ✅
- **Mais** : dans `hooks/` il n'y a **pas** de `useVoiceCapture`, `useVoiceQA`, `usePresentation`, `usePitchTimer`. Ces logiques restent inline dans page.tsx, entre les lignes 1000-1500.

### 8.2 Bugs connus (dette réelle, tâches restantes)

Extraits du task tracker :

- 🔴 **Task #70 — BUG MAJEUR : persistence shallow**. Les `flags`, `mails` et `chat` sont perdus au reload. Le checkpoint founder ne persiste que la phase courante, pas l'état complet de session. Impact : le joueur ne peut pas quitter et reprendre en milieu de phase.
- 🟡 **Task #69 — Bouncer peut sauter des phases** si `chosen_kol_id` est set. Le rollback HARD_REJECT ne clear pas tous les états dérivés.
- 🟡 **13 scénarios "maintenance" échouent** à `validate:scenarios` (27 erreurs non-blocking). Ils utilisent des patterns d'ancienne génération (no deterministic exit trigger, etc.).

### 8.3 Défauts data

- **`OnePagerEditor`** : titre "One-Pager — Orisio" et destinataire `jury@technowest.fr` hardcodés dans le composant (S1-spécifique). Devrait venir de `scenario.narrative` ou d'une section dédiée.
- **`clinicalContractTemplates`** : les 3 variantes CHU/SM/Clinique vivent en TypeScript, pas en JSON. Impossible pour un game designer non-dev de modifier un article. Idéalement `scenario.resources.contract_templates`.
- **`ContractHandler.getNegotiationConfig`** : switch hardcodé sur 4 contractType. Ajouter un `s6_franchise` nécessite d'éditer ce switch.

### 8.4 Défauts qualité

- **Zéro tests automatisés**. Chaque refacto s'est fait à vue, avec :
  - TypeScript strict comme filet
  - `validate:scenarios` comme filet (ne teste que la data)
  - Tests manuels E2E par l'utilisateur après chaque push
- **Aucun test unitaire** sur `runContractNegotiation`, `fetchChatWithRetry`, `checkCompletionRules`, etc. Ces mécaniques sont pourtant idéales pour du unit test (pure functions).
- **Aucun test E2E automatisé** (Playwright/Cypress) sur les parcours S0 → S5.

Sans tests, aller plus loin dans le refacto (extraire `sendMessage`, introduire React Context) devient risqué : impossible de valider en 30 secondes qu'aucune régression n'a été introduite.

### 8.5 Défauts d'ergonomie du code

- **`session` est typé `any`** presque partout. Le type `PlayerSession` existe mais n'est pas propagé.
- **`scenario` est typé `ScenarioDefinition` mais avec beaucoup de `(scenario as any)`** pour les champs récents non typés (`show_objective`, `show_background_fact`, `mail_config`, `chat_context_enrichment`, `advancement`, etc.).
- **Trop de refs `Ref` en dur** (`sessionRef`, `scenarioRef`, `viewRef`, `authTokenRef`, `gameSessionIdRef`, `aiPromptRef`, `aiPromptsMapRef`, `checkpointDoneRef`, `phaseMaxDurationTriggeredRef`, `phaseStartRealTimeRef`, etc.). Chacune existe pour contourner un problème de closure. Refactoring propre : Context + immer.

---

## 9. Recommandations pour la suite

### Priorité 1 — Filet de sécurité

Avant tout autre refacto :
1. **Ajouter des tests unitaires** sur les mécaniques pures : `runContractNegotiation`, `fetchChatWithRetry`, `checkCompletionRules`, `dynamicActorResolution`, `getActorInfo`.
2. **Ajouter des tests E2E** (Playwright) sur au moins un parcours "happy path" par scénario S0 → S5.

### Priorité 2 — Bug #70 (persistence)

Le bug qui bloque le vrai usage. Il faut :
- Sérialiser `session.flags`, `session.mailDrafts`, `session.chatMessages`, `session.savedDrafts` dans le checkpoint serveur (pas juste `currentPhaseIndex`).
- Ajouter un endpoint `/api/founder/checkpoint/deep-restore` qui reconstruit une session complète.
- Migrer les checkpoints existants (script one-shot).

### Priorité 3 — React Context

Introduire `<PlayerProvider>` avec :
- `session`, `setSession`, `sessionRef`
- `scenario`, `view`
- `actors`, `getActorInfo`
- `apiHeaders`, `authTokenRef`
- Helpers : `cloneSession`, `addPlayerMessage`, `addAIMessage`, `applyEvaluation`

Ensuite `sendMessage`, `handleSendMail`, `endPresentation` peuvent devenir des hooks `useSendMessage`, `useSendMail`, `useEndPresentation` — proprement typés, testables unitairement.

### Priorité 4 — Data-first pour S1

Migrer les hardcoding du `OnePagerEditor` dans `scenario.narrative.one_pager` :
```json
{
  "narrative": {
    "one_pager": {
      "title": "One-Pager — Orisio",
      "recipient": "jury@technowest.fr",
      "recipient_label": "jury de Technowest",
      "sections": [
        { "title": "Problème", "placeholder": "…" },
        …
      ]
    }
  }
}
```

Pareil pour `clinicalContractTemplates.ts` → `scenario.resources.contract_templates.clinical.{chu, sm, clinique}`.

### Priorité 5 — Fusion S3/S4 dans runContractNegotiation (optionnel)

Étendre `runContractNegotiation` pour accepter :
- `promptBuilder: (articles) => string` (au lieu de `roleplayPrompt` fixe)
- `replyParser: (reply) => { displayReply, modifications, extras }` (au lieu du parser fixe interne)
- `applyExtras: (extras) => void` (pour dealTerms S4)

Ça permettrait de fusionner les 5 senders. Contre-partie : les fonctions API deviennent des props, l'abstraction se rapproche du plumbing.

---

## 10. Historique du refacto (PRIO 1 → PRIO 11)

Chronologique, pour comprendre les décisions :

| PRIO | Livrables | Impact page.tsx |
|---|---|---|
| **1** | `phaseEventTracker`, `applyModuleActions`, `executeMailAsyncEffect`, `useScenarioInit` | 5579 → 4572 (−1007) |
| **2** | 7 hooks feature (`usePacteContract`, `useNovadevContract`, `useDevisNegotiation`, `useClinicalContract`, `useExceptionsContract`, `useOnePagerEditor`, `useOutlineNotes`) | −42 useStates |
| **3** | `useTTS` (créé, non branché initialement) | — |
| **4** | Plumbing : `playerUtils`, `outlineParser`, `establishmentMap`, `Avatars`, `useToasts`, `useFounderCheckpoint` | — |
| **5** | 6 composants JSX chrome : `ToastContainer`, `ResumeBanner`, `PlayerHeader`, `DebugPanel`, `InlineDocModal`, `BriefingOverlay` | 4607 → 4269 (−338) |
| **6** | `MailSignButton` (fusion 6 boutons), `ContactPickerPopover` (fusion To/Cc). MailView : 40K → 32K | −20 % MailView |
| **7** | `OnePagerEditor`, `RightPanel`, `LeftSidebar` + wiring `useTTS` + `useFounderCheckpoint` | 4607 → 3728 (−879) |
| **8** | **`runContractNegotiation`** — fusion 3 senders pacte/novadev/exceptions | 3728 → 3711 (−17) |
| **9** | `clinicalContractTemplates`, `fetchChatWithRetry`, `checkCompletionRules`, `dynamicActorResolution` | 3711 → 3539 (−172) |
| **10** | **`PresentationModeView`** — extract 510 L JSX mode presentation + voice_qa | 3539 → 3122 (−417) |
| **11** | `getActorInfo`, `useMailSendValidation`, `useNewItemNotifications` + refactor `generateNPCMessage` + `dispatchVoiceQAMessage` avec `fetchChatWithRetry` | 3122 → 3035 (−87) |
| **TOTAL** | **36 modules extraits** | **5579 → 3035 (−2544, −45,6 %)** |

---

## 11. TL;DR pour un nouveau dev

1. **`page.tsx` orchestre** : il détient les states partagés et coordonne les modules extraits.
2. **Ne mets jamais de texte scénario** dans `handlers/`, `lib/`, ou `components/` (sauf les fichiers explicitement data : `clinicalContractTemplates`, `establishmentMap`).
3. **Nouveau contrat qui suit le pattern standard** ? Ajoute une entrée dans `ContractHandler.getNegotiationConfig` + un wrapper de 25 L dans page.tsx qui appelle `runContractNegotiation`. C'est tout.
4. **Nouveau bouton signature** dans mail ? Utilise `MailSignButton` avec tes propres props texte.
5. **Nouveau call `/api/chat`** ? Utilise `fetchChatWithRetry` — ne jamais recopier la boucle retry.
6. **Avant tout refacto agressif** : ajoute des tests. Sinon le prochain qui touche risque de tout casser.
7. **Les bugs critiques (#69, #70) sont plus prioritaires** que continuer à découper page.tsx.

---

*Document généré après PRIO 11. À maintenir à chaque nouvelle extraction majeure.*
