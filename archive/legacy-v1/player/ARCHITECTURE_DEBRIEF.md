# Debrief architecture — état au 1er juillet 2026

> Écrit à froid après la journée de refacto PRIO 1→4 + la régression
> `checkCompletionRules` remontée en fin de journée. Ce document fait
> l'état des lieux et **surligne explicitement les zones à risque
> régression du même type**.

---

## 1. État chiffré à date

```
page.tsx          : 5 579  →  2 643 lignes   (−52,6 %)
MailView.tsx      :   40K  →     32K         (−20 %)
Modules extraits  : 40 fichiers dans hooks/ handlers/ lib/ components/ contracts/ contexts/
Tests unit vitest : 46 tests (7 fichiers)
Deploy pipeline   : scripts/deploy.sh versionné (npm install + fail-fast + smoke test)
Persistence       : deep snapshot founder — flags/mails/chat survivent au reload
```

**Ce qui fonctionne :**
- TypeScript strict vert sur tout le repo
- `validate:scenarios` vert (10 actifs)
- 46/46 tests vitest verts en 9 s
- Build production reproductible (dernier BUILD_ID `2QGQv6y6Fd-6X4lzCw4vV`)

**Ce qui reste ouvert :**
- Task #69 pending : bouncer peut sauter des phases si `chosen_kol_id` set (edge case S5)
- Task #74 in_progress : vérif E2E founderAccess avec compte test
- Le 500 sur `/api/profile/extract-skills` blindé mais cause exacte pas encore reproduite

---

## 2. Anatomie de la régression `checkCompletionRules` — leçon centrale

C'est le pattern d'erreur le plus dangereux que j'ai commis aujourd'hui, et il peut se reproduire ailleurs si on n'est pas vigilant. Comprendre son mécanisme est plus important que la fix elle-même.

### Cause racine

Dans PRIO 9 j'ai créé `lib/checkCompletionRules.ts` en **regardant le code inline dans page.tsx**, pas la spec. Le code inline testait 3 règles :
- `required_npc_evidence`
- `required_player_evidence`
- `min_score`

J'ai copié ce code tel quel dans un fichier séparé. Mais la vraie source de vérité vivait dans `app/lib/runtime.ts` (`isCurrentPhaseValidatedByRules`), qui elle gère 6 règles + un fallback :
- Les 3 ci-dessus
- `any_flags`
- `all_flags`
- `max_exchanges`
- fallback `min_player_messages` (quand aucune règle définie)

**Conséquence concrète** : pour toute phase avec `completion_rules: { any_flags: [...] }` (12 phases dans le repo), ma fonction retournait `true` par défaut, car aucune des 3 règles connues n'était présente donc elle passait tous les checks — n'importe quel mail envoyé faisait avancer la phase.

### Pourquoi TypeScript ne l'a pas vu

Parce que le type `CompletionRules` que j'ai défini dans mon fichier **listait seulement les 3 règles**. TypeScript vérifie la cohérence entre le type et l'implémentation, pas entre les 2 fichiers indépendants qui gèrent la même donnée. Sur le papier, `checkCompletionRules(phase, conv, scores)` était type-safe.

### Pourquoi les tests initiaux ne l'ont pas vu

Les tests de PRIO 2 ont validé le comportement de `checkCompletionRules` sur **ses règles à elle** (les 3 qu'elle implémentait). Ils ne testaient pas la SPEC métier "phase advance quand un flag any_flags est truthy" — parce que cette spec vit dans runtime.ts.

### Le fix appliqué

- `useSendMail` utilise désormais `isCurrentPhaseValidatedByRules(next)` directement — **la source de vérité canonique**.
- `lib/checkCompletionRules.ts` transformé en redirect deprecated.
- 9 tests de régression écrits qui couvrent les **6 règles** en appelant la fonction canonique.

### La leçon générale

**Extraire une helper depuis du code inline sans identifier la vraie source de vérité ailleurs = duplication silencieuse.** Le code inline pouvait être une simplification d'une logique plus riche qui existe déjà ailleurs. Toujours faire :

1. `grep -rn "nomDeLaFonction\|logicSimilaire"` pour voir si une version canonique existe déjà.
2. Si oui : importer-la, pas la re-implémenter.
3. Si vraiment nouvelle : écrire les tests **par spec** (tous les cas prévus par les inputs), pas par implémentation (tous les branches du code écrit).

---

## 3. Audit systématique — extractions à risque similaire

Pour chaque extraction significative faite dans les 10 commits PRIO 1→4, je note :
- **Source** : d'où venait la logique originale ?
- **Extraction** : qu'ai-je créé ?
- **Écart potentiel** : est-ce que j'ai potentiellement omis des cas ?
- **Risque** : 🔴 haut / 🟡 moyen / 🟢 bas
- **Test coverage** : est-ce que les tests actuels détecteraient une régression ?

### 3.1 `handlers/applyModuleActions.ts` — dispatcher 30+ action types 🟡

- **Source** : gros switch inline dans page.tsx (~280 L)
- **Extraction** : function pure prenant `ModuleAction[] + next + deps`
- **Écart potentiel** : le switch a 30+ cases. Si un module ajoute un nouveau `type` d'action, mon dispatcher tombera sur le `default` sans warning. Actuellement pas de test qui valide chaque type d'action.
- **Test coverage** : ❌ aucun test unit
- **Comment détecter** : un test qui envoie CHAQUE type de `ModuleAction` et vérifie le side effect attendu.
- **Priorité** : moyenne — cassure serait visible immédiatement en jouant le scenario.

### 3.2 `handlers/executeMailAsyncEffect.ts` — 4 kinds de mail async 🔴

- **Source** : ~555 L inline dans page.tsx
- **Extraction** : 4 branches : `mail_auto_reply`, `mail_inbox_reply` (avec HARD_REJECT), `negotiation_chat_reply`, `fourviere_dynamic_mail`
- **Écart potentiel** : la branche `mail_inbox_reply` pilote le HARD_REJECT S5 (rollback phase 2→1) et le pivot Clinique S3. Ces mécaniques ont eu 3-4 bugs sévères historiquement (tasks #55-#67, #75-#78). Si mon extraction a subtilement décalé un ordre d'opérations, un rollback peut mal tourner sans crasher.
- **Test coverage** : ❌ aucun test unit
- **Comment détecter** : test qui simule un mail HARD_REJECT en S5 et vérifie que `chosen_kol_id` est nettoyé + phase revient à 1 + `burned_kols` est mis à jour. Idem pour pivot Clinique.
- **Priorité** : haute — ces flows sont critiques et déjà bogués historiquement.

### 3.3 `handlers/contractNegotiationSenders.ts` — 3 senders fusionnés 🟡

- **Source** : 3 fonctions asynchrones quasi-identiques dans page.tsx (S0 pacte, S2 novadev, S5 exceptions)
- **Extraction** : 1 seul `runContractNegotiation(opts)` avec opts par contract type
- **Écart potentiel** : 
  - S0 pacte a un `pacteFlagsHook` (détection exclusivity + flag update)
  - S5 exceptions a un `sessionLog` (écriture messages debrief)
  - S2 novadev n'a rien de particulier
  - Si un scénario S6 à venir a une 4e spécificité, il faudra ajouter un nouveau hook opt-in au type. Refactor propre mais nécessite d'y penser.
- **Test coverage** : ❌ aucun test unit
- **Comment détecter** : 3 tests qui mockent `sendNegotiationMessage` et vérifient que les 3 opts (pacte/novadev/exceptions) déclenchent bien leurs effets spécifiques.
- **Priorité** : moyenne — bug visible immédiatement en jouant les 3 scénarios.

### 3.4 `handlers/dynamicActorResolution.ts` — chosen_cto + chosen_kol + establishment 🟢

- **Source** : ~65 L inline dans page.tsx
- **Extraction** : 2 fonctions pures
- **Écart potentiel** : aucun connu, code copié verbatim
- **Test coverage** : ✅ 9 tests couvrant chosen_cto S0, chosen_kol S5, establishment S4, idempotence
- **Priorité** : basse — bien couvert.

### 3.5 `lib/fetchChatWithRetry.ts` — retry 401/429/5xx/network 🟢

- **Source** : boucle inline dans `sendMessage`
- **Extraction** : function pure avec `{ apiHeaders, authTokenRef }` en deps
- **Écart potentiel** : `dispatchVoiceQAMessage` avait sa PROPRE boucle retry (plus courte) — j'ai remplacé par un appel à `fetchChatWithRetry`. Le comportement peut avoir légèrement changé (par exemple, il n'attendait pas les 429 avec `retryAfterMs`). Si un scenario voice_qa hit un rate limit, le comportement est meilleur (plus robuste) mais différent.
- **Test coverage** : ✅ 7 tests couvrant 401/429/5xx/network, MAX_RETRIES
- **Priorité** : basse — bien couvert et changement va dans le sens du plus robuste.

### 3.6 `lib/phaseEventTracker.ts` — clés d'idempotence entry events 🟢

- **Source** : bug historique (S0 Alex doublé, task #81)
- **Extraction** : format canonique `${phaseId}::${eventId}` avec 4 helpers
- **Écart potentiel** : le fallback `resolveEventId` construit un id basé sur le content pour les events sans id explicite. Si deux events ont le même content dans la même phase, mêmes clés → un des 2 n'est pas injecté. Le risque est faible car en pratique les events ont toujours un `event_id`.
- **Test coverage** : ✅ 5 tests dont guard régression cross-phase
- **Priorité** : basse.

### 3.7 `hooks/useSendChatMessage.ts` — 200 L de sendMessage 🔴

- **Source** : `sendMessage` inline dans page.tsx (PRIO 3)
- **Extraction** : function pure prenant `PlayerContextValue` en deps
- **Écart potentiel** : la fonction manipule beaucoup de state (session, view, phaseMaxDurationTriggeredRef, etc.) via refs. Elle contient :
  - Guards (mail-only actor, phase timer, etc.)
  - Optimistic update
  - `fetchChatWithRetry`
  - `applyEvaluation`
  - `checkNpcSuccessKeywords` + `checkNpcFailureKeywords`
  - `handlePhaseFailure` + `resolveDynamicActors` + `resolveEstablishmentPlaceholders`
  - Détection pivot Clinique S3 (bloc scenario-spécifique)
  - `updateAdaptiveMode` + `scheduleInterruption`
- **Risque spécifique** : chacune de ces sous-mécaniques importées de `@/app/lib/runtime` peut évoluer. Ma fonction les appelle dans un ordre précis. **Si runtime.ts ajoute une nouvelle side-effect à `applyEvaluation` par exemple, mon extraction ne le sait pas.**
- **Test coverage** : ❌ aucun test unit (trop couplé pour test unit facile)
- **Comment détecter** : test E2E happy-path qui joue une conversation complète en S0 ou S5 avec assertions sur les flags résultants. Sans E2E, on est aveugle.
- **Priorité** : haute — c'est la fonction la plus critique de l'app.

### 3.8 `hooks/useSendMail.ts` — 140 L de handleSendMail 🟡

- **Source** : `handleSendMail` inline (PRIO 3)
- **Extraction** : function pure prenant deps
- **Écart potentiel** : bug déjà trouvé (`checkCompletionRules` incomplet, corrigé). Reste : le legacy fallback n'est utilisé que pour 4 phases spécifiques (voir commentaire dans le code). Si un nouveau scenario oublie de déclarer `modules: ["mail"]` et se retrouve dans le legacy fallback, il aura le comportement legacy. Documentation présente mais facile à rater.
- **Test coverage** : ✅ 9 tests sur les completion_rules (le check qui bloquait)
- **Priorité** : moyenne — bug corrigé, garde-fou en place, mais reste couplé à runtime.ts.

### 3.9 `hooks/useEndPresentation.ts` — 130 L 🔴

- **Source** : `endPresentation` inline (PRIO 3)
- **Extraction** : function pure prenant deps
- **Écart potentiel** : gère 3 cas (error, empty, success) + advance phase + eval API background. Si un des 3 cas est mal géré, le spinner peut rester bloqué (bug historique explicitement documenté dans le code). Le eval background n'a pas de fallback si `applyEvaluation` change de signature.
- **Test coverage** : ❌ aucun test unit
- **Comment détecter** : test qui mock `stopRecognition()` avec les 3 shapes de résultat et vérifie que les setters sont appelés dans l'ordre attendu.
- **Priorité** : haute — la présentation vocale est un feature UX critique et fragile.

### 3.10 `hooks/useScenarioInit.ts` — 297 L de boot 🔴

- **Source** : le useEffect init de 240 L inline (PRIO 1)
- **Extraction** : function pure avec deps massives
- **Écart potentiel** : le boot sequence est ULTRA critique. Auth + fetch + founder lock + resume checkpoint + entry events + logging + prompts fetch. J'ai récemment (PRIO 1) ajouté la logique de **deep hydrate** pour fix #70 — si un scenario n'a pas de `sessionSnapshot` dans son checkpoint, il retombe sur le path legacy. Le path legacy et le deep-hydrate ont des side effects différents (le deep hydrate skip la remise à zéro du mail draft par exemple, pour préserver un draft en cours).
- **Test coverage** : ❌ aucun test unit (trop couplé pour test unit facile)
- **Comment détecter** : test E2E qui joue un scenario, quitte, revient — vérifie que tout (flags/mails/drafts) est restauré. Sans ça, on est aveugle.
- **Priorité** : haute — le fix #70 est neuf, pas encore battle-testé en prod.

### 3.11 `hooks/useDeepSave.ts` — 137 L (fix #70) 🟡

- **Source** : nouveau, ajouté pour fix #70
- **Extraction** : nouveau — pas d'extraction d'existant
- **Écart potentiel** : cadence 10s + beforeunload beacon. Le beacon a besoin d'un token dans le body car sendBeacon ne peut pas envoyer de header Authorization. Le serveur accepte ce token via `_unloadToken`. Si un jour on ajoute une signature CSRF, il faut penser à ce chemin.
- **Test coverage** : ✅ 6 tests sur `deepSaveCheckpoint` (côté server), aucun sur le client hook
- **Priorité** : moyenne — les tests couvrent le server-side, le client est simple.

### 3.12 `components/OnePagerEditor.tsx` — 470 L extrait (PRIO 7 + 10) 🟡

- **Source** : 285 L inline dans page.tsx
- **Extraction** : composant pur avec prop `config?` optionnel (PRIO 4 data-first) + refonte UX click-to-clear (PRIO récente)
- **Écart potentiel** : le submit handler reste dans page.tsx (pas dans le composant). Il assemble le mail body à partir de plusieurs sources (config JSON + hardcoded fallbacks + text du contentEditable). Si le shape de config JSON change, il faut modifier 2 fichiers en même temps.
- **Test coverage** : ❌ aucun test unit
- **Priorité** : basse — bien isolé, changement UX récent mais logique inchangée.

### 3.13 `lib/clinicalContractTemplates.ts` — 3 variantes CHU/SM/Clinique 🟢

- **Source** : hardcoded inline (PRIO 1 extraction) + PRIO 4 refacto data-first
- **Extraction** : `buildClinicalArticles(type, scenario?)` qui lit d'abord scenario.resources.clinical_contract_templates, puis fallback constantes
- **Écart potentiel** : si le JSON scenario a une entrée mais mal typée (ex: `content: null`), le résultat sera bizarre. Les guards `String(raw.content)` peuvent produire "null" au lieu de crash.
- **Test coverage** : ✅ 5 tests couvrant data-first / fallback / defaults / no mutation leak
- **Priorité** : basse.

### 3.14 `components/PresentationModeView.tsx` — 480 L extrait 🟡

- **Source** : 510 L de JSX inline dans page.tsx
- **Extraction** : 1 composant avec 2 modes (presentation + voice_qa)
- **Écart potentiel** : passe 35 props. Si une prop est mal typée ou renommée sans grep total, l'erreur peut se cacher dans une branche rarement empruntée (ex: children_names pour CMJ, jury multi-actor pour S3).
- **Test coverage** : ❌ aucun test unit (React component avec 35 props → E2E plus adapté)
- **Priorité** : moyenne.

### 3.15 `handlers/PhaseOrchestrator.ts` + `handlers/PhaseModuleRegistry.ts` 🟢

- **Source** : existait déjà avant mon refacto
- **Extraction** : je n'y ai pas touché
- **Priorité** : basse — pas mon code, pas mon risque.

---

## 4. Zones de fragilité identifiées à surveiller

### 4.1 Le pattern "extract inline → miss the canonical source"

C'est **la** régression du jour. Elle peut se reproduire sur toute extraction future si le développeur regarde uniquement le code visible. Réflexe à installer :

```bash
# Avant d'extraire une helper, grep systématique
grep -rn "similarFunctionName\|logicKeyword" app/lib
```

Si une fonction canonique existe dans `app/lib`, **l'importer plutôt que la re-écrire**.

### 4.2 Les 3 fonctions cross-module lourdes non testées

`sendMessage`, `handleSendMail`, `endPresentation` sont extraites en hooks mais leurs deps viennent de runtime.ts + module system. Sans tests E2E, une évolution de runtime.ts peut casser silencieusement leur comportement.

**Recommandation** : au moins 1 test E2E par scenario en happy-path, exécuté en CI avant chaque merge.

### 4.3 Le module system (MailModule, ContractModule, InterviewModule)

Ces modules retournent des `ModuleAction[]` que mon `applyModuleActions` dispatch via un gros switch. Si un module ajoute un nouveau type d'action et oublie de le documenter, mon switch tombe sur `default` silencieusement.

**Recommandation** : ajouter un check TypeScript exhaustif via un `never`-check dans le default case du switch.

### 4.4 Le deep-hydrate de sessions (fix #70)

Récent, pas encore battle-testé. Le shape du snapshot vit dans 3 endroits :
- Type serveur : `FounderCheckpoint.sessionSnapshot` (`app/lib/founder.ts`)
- Type client : `DeepSaveSnapshot` (`hooks/useFounderCheckpoint.ts`)
- Reader client : `useScenarioInit.ts` (lit et re-assigne au session)

Si un champ est ajouté à `PlayerSession` (ex: nouveau ref, nouveau state critique), il faut updater les 3. Facile à rater.

**Recommandation** : au moins garder les 3 shapes synchronisées via un type shared. Idéalement, ajouter un test qui prend un `PlayerSession` de référence, la round-trippe via serialize→deep_save→resume, et vérifie l'égalité.

### 4.5 Le `PlayerContext`

Le context a 60+ champs. Chaque nouvelle prop ajoutée dans page.tsx doit être ajoutée au context ET à `PlayerContextValue` ET dans le playerCtx literal. Facile de rater un des 3.

**Recommandation** : ajouter un test qui instantie un `PlayerProvider` avec un mock et vérifie qu'aucun champ ne rend `undefined` inattendument.

### 4.6 Les scenarios JSON avec `send_advances_phase` + rules non-triviales

Comme l'audit du fix récent l'a montré, 12 phases utilisent `send_advances_phase` combiné avec `any_flags` / `all_flags` / `max_exchanges`. Ma régression a temporairement pété la logique pour ces 12 phases. Fix appliqué + 9 tests garde-fou.

**Recommandation** : ne jamais dupliquer la logique de completion_rules — toujours importer `isCurrentPhaseValidatedByRules` de runtime.ts.

---

## 5. Recommandations concrètes pour éviter le prochain incident

### 5.1 Filet de sécurité — priorités par impact

| Priorité | Livrable | Impact |
|---|---|---|
| 🔴 P0 | Playwright + 1 test E2E happy-path par scenario S0→S5 | Détecte 90% des régressions cross-cutting |
| 🔴 P0 | Test unit sur `handlePhaseFailure` + `updateAdaptiveMode` + `scheduleInterruption` (imports runtime dans sendMessage) | Verrouille les fonctions critiques que mon hook appelle |
| 🟡 P1 | Test unit sur les 4 kinds de `executeMailAsyncEffect` (HARD_REJECT, pivot Clinique, etc.) | Verrouille les flows historiquement bogués |
| 🟡 P1 | Exhaustive-check dans `applyModuleActions` default case | Erreur compile-time si nouveau ModuleAction non géré |
| 🟢 P2 | Type shared pour le snapshot deep-save (server ↔ client) | Empêche drift des 3 fichiers |
| 🟢 P2 | Test d'intégration : `PlayerContextValue` complet (aucun undefined) | Détecte si un ajout de state oublie de propager |

### 5.2 Convention d'extraction à respecter

Pour toute nouvelle extraction de fonction/helper depuis code inline :

1. **`grep -rn` pour vérifier qu'aucune version canonique existe** dans `app/lib` ou ailleurs.
2. Si oui : **importer**, pas re-écrire.
3. Si non : écrire un test qui couvre **la spec métier** (tous les inputs prévus par le scenario JSON), pas seulement les branches du code inline copié.
4. Ne pas paraphraser un type si le type existe déjà dans le module d'origine — importer le type aussi.

### 5.3 Convention de deploy

Toujours passer par `scripts/deploy.sh` — la one-liner est bannie parce qu'elle skip `npm install`.

---

## 6. Ce que ça donne dans la vie quotidienne du dev

**Pour ajouter un nouveau scénario S6** :
1. Créer `scenarios/founder_06_xxx/scenario.json` (data uniquement)
2. Ajouter les entrées data dans les fichiers dédiés si le scenario utilise des templates existants (`clinicalContractTemplates`, `establishmentMap`, `ContractHandler.getNegotiationConfig`)
3. **Aucun** fichier `handlers/`, `lib/`, `hooks/`, `components/` ne devrait bouger si le scenario suit les patterns existants
4. Ajouter au moins 1 test unit qui valide les completion_rules des phases (spec)
5. Ajouter 1 test E2E happy-path (quand Playwright sera en place)

**Pour modifier une mécanique existante** (ex: comportement d'un send de mail) :
1. Localiser le vrai fichier source dans `app/lib/runtime.ts` ou `handlers/modules/`
2. **Ne pas modifier une extraction** (`useSendMail.ts`, `useSendChatMessage.ts`) sans avoir mis à jour la source de vérité
3. Ajouter un test qui verrouille le nouveau comportement
4. Vérifier que les tests existants passent toujours

**Pour toucher aux completion_rules d'une phase** :
1. Modifier UNIQUEMENT le JSON scenario
2. Vérifier que `isCurrentPhaseValidatedByRules` gère bien le shape utilisé
3. Si nouvelle règle inconnue → étendre `isCurrentPhaseValidatedByRules` dans runtime.ts (jamais dans une extraction)

---

## 7. TL;DR pour un nouveau dev

- **`page.tsx` orchestre**, il ne fait plus la logique métier — la logique vit dans `handlers/`, `hooks/`, `lib/`
- **La source de vérité pour la validation de phase est `isCurrentPhaseValidatedByRules` dans `app/lib/runtime.ts`** — NE JAMAIS la dupliquer
- **Data-first** : textes scenario dans les `scenario.json`, pas dans les fichiers TypeScript
- **Deploy** : `./scripts/deploy.sh` toujours, jamais la one-liner
- **Tests** : `npm run test` avant chaque push, 46 tests actuels + tout ce qu'on ajoute
- **Avant d'extraire** : `grep -rn` pour vérifier qu'une version canonique n'existe pas déjà. Si oui, importer.

---

*Document généré le 1er juillet 2026 après régression `checkCompletionRules` — à maintenir à chaque évolution majeure. Mise à jour prévue quand P0 (E2E Playwright) sera en place.*

---

## 8. Matrice de maturité des mécaniques (retour PO — 1er juillet 2026)

Framework proposé par le product officer pour évaluer où investir. Chaque mécanique du player évaluée sur 4 axes :

- **Data-driven** : la logique/textes vivent dans `scenario.json` (✅) vs hardcodés en TypeScript (❌)
- **Testée** : couverture unit et/ou E2E réelle (✅) vs zéro test (❌)
- **Réutilisable** : un nouveau scenario peut l'utiliser sans toucher de TS (✅) vs nécessite modif code (❌)
- **Stable** : battle-testée en prod sans régression récente (✅) vs récente/bogué historiquement (❌)

Convention : ✅ solide · ⚠️ partiel/récent · ❌ rien

### 8.1 Matrice — toutes les mécaniques du player

| Mécanique | Data-driven | Testée | Réutilisable | Stable | Zone critique |
|---|:---:|:---:|:---:|:---:|---|
| **Mail (send flow)** | ✅ | ⚠️ | ✅ | ⚠️ | Régression `checkCompletionRules` corrigée ce jour |
| **Chat (sendMessage)** | ⚠️ | ❌ | ⚠️ | ✅ | Bloc pivot Clinique S3 hardcodé dans le hook |
| **Contrats S0/S2/S5 (`runContractNegotiation`)** | ⚠️ | ❌ | ✅ | ⚠️ | Textes dans `ContractHandler.getNegotiationConfig` (TS) |
| **Contrat clinique S3** | ✅ | ✅ | ✅ | ⚠️ | Migré JSON (PRIO 4), 5 tests, pivot récent |
| **Devis S4 (`sendDevisNegoMsg`)** | ⚠️ | ❌ | ⚠️ | ✅ | `scopeContext` + `parseDealTag` inline page.tsx, S4-spécifique |
| **Présentation vocale (`endPresentation`)** | ⚠️ | ❌ | ✅ | ⚠️ | Spinner-block historique, background eval fragile |
| **Voice QA (jury / children)** | ⚠️ | ❌ | ✅ | ✅ | Round-robin jury + pitch timer, stable en prod |
| **Interruptions (timed events)** | ✅ | ❌ | ✅ | ✅ | Purement déclaratif, jamais bogué |
| **Scoring (`applyEvaluation`)** | ✅ | ❌ | ✅ | ✅ | `criteria` en JSON, IA renvoie matches |
| **Phase advancement (`isCurrentPhaseValidatedByRules`)** | ✅ | ✅ | ✅ | ✅ | Source de vérité + 9 tests régression |
| **Résolution `chosen_cto`/`chosen_kol`/establishment** | ⚠️ | ✅ | ⚠️ | ✅ | `establishmentMap` hardcodé (3 entrées S3/S4) |
| **Notifications (toasts + unread badge)** | ❌ | ❌ | ✅ | ✅ | Emojis en dur, mais universel |
| **Persistence founder (deep snapshot)** | ✅ | ✅ | ✅ | ⚠️ | Livré ce jour (fix #70), pas battle-testé longuement |
| **One-pager (S1)** | ✅ | ❌ | ⚠️ | ⚠️ | Config JSON (PRIO 4), UX refonte du jour |
| **Mindmap / notes** | ✅ | ❌ | ✅ | ✅ | Pur client-side |
| **HARD_REJECT S5 (rollback KOL)** | ✅ | ❌ | ⚠️ | ⚠️ | Refonte récente, pas de test unit |
| **Pivot Clinique S3** | ⚠️ | ❌ | ❌ | ⚠️ | Détection hardcodée dans `useSendChatMessage` |
| **Debrief AI (fin scenario)** | ✅ | ❌ | ✅ | ✅ | `criteria` + `scenarioCompetencies` en JSON |
| **Checkpoint founder (advance/clear/rollback)** | ✅ | ✅ | ✅ | ✅ | 6 tests + fix #70 sur deep snapshot |

### 8.2 Score global

```
Total mécaniques évaluées : 19
Data-driven ✅ : 13 (68 %)  ⚠️ : 5 (26 %)  ❌ : 1 (5 %)
Testée      ✅ : 5  (26 %)  ⚠️ : 1 (5 %)   ❌ : 13 (68 %)
Réutilisable ✅ : 13 (68 %)  ⚠️ : 4 (21 %)  ❌ : 1 (5 %)
Stable      ✅ : 10 (53 %)  ⚠️ : 8 (42 %)  ❌ : 0
```

**Verdict** : le refacto a bien fait bouger les curseurs *Data-driven* et *Réutilisable* (∼70 % vert), mais **la couverture de tests reste à 26 %** — c'est LA fragilité majeure. La stabilité est à 53 % vert / 42 % orange, ce qui reflète les changements très récents (fix #70, checkCompletionRules corrigé, UX one-pager, S3 clinical migration).

### 8.3 Où investir en priorité

En croisant les axes, les zones où il faut concentrer l'effort :

#### 🔴 Zones "❌ Testée + ⚠️ Stable" — investir immédiatement

Ce sont les mécaniques récentes ou refactorées sans tests. Une régression est probable dans les 2 semaines qui viennent.

1. **`endPresentation` + Voice QA** — spinner-block historique, refonte récente, zéro test. Test unit qui mock `stopRecognition()` avec les 3 shapes (error/empty/success).
2. **HARD_REJECT S5** — mécanique la plus bogée historiquement (tasks #55→#67 dans le tracker), aucun test unit. Test qui simule un mail HARD_REJECT et vérifie rollback + wipe chosen_kol_id.
3. **Pivot Clinique S3** — hardcodé dans `useSendChatMessage`, ni data-driven ni testé. Doublement fragile : un changement de scenario S3 ou du hook peut casser sans crasher.
4. **One-pager S1** — UX du jour + config JSON du jour. Test smoke qui valide que le mail final contient bien le body attendu.

#### 🟡 Zones "⚠️ Data-driven" — sortir en JSON pour la V2

Ces mécaniques marchent bien mais restent hardcodées. Migration data-first à planifier :

1. **Contrats S0/S2/S5** : `ContractHandler.getNegotiationConfig` reste un switch TS avec phaseTitle/phaseFocus/fallbackError. Peut vivre dans `scenario.narrative.contract_negotiation` par contract type.
2. **Establishment map** : 3 entrées hardcodées dans `lib/establishmentMap.ts`. Peut vivre dans `scenario.resources.establishments`.
3. **Devis S4** : `DEVIS_FEATURES_DATA` (5 features avec prix) + `parseDealTag` (regex). Migration délicate mais faisable.
4. **Bloc pivot Clinique S3** : Détection `scenarioId?.startsWith("founder_03") && switched_to_clinique` dans `useSendChatMessage`. À sortir en `scenario.chat_context_enrichment.pivot_config` ou équivalent.

#### 🟢 Zones "✅ tout vert" — capitaliser

- **Phase advancement** : source de vérité claire, 9 tests, extension via runtime.ts uniquement. **Ne jamais dupliquer.**
- **Checkpoint founder** : contrat serveur/client aligné, tests, fix #70 fresh mais couvert.
- **Interruptions** + **Scoring** + **Notifications** + **Mindmap** : mécaniques universelles, aucun scenario-specific à gérer.

### 8.4 Recommandation "V2 Revealio comme plateforme"

Le PO a raison sur le fond : passer d'app à plateforme = **une mécanique n'est finie que quand elle est data-driven + testée + réutilisable + stable**.

Roadmap pour y arriver :

| Phase | Livrable | Impact matrice |
|---|---|---|
| **1 (2 semaines)** | Playwright + 5 tests E2E happy-path (1 par scenario S0→S5) | 5 rangées passent de ❌ à ⚠️ sur *Testée* |
| **2 (1 semaine)** | Test unit sur `applyEvaluation` + `handlePhaseFailure` + `updateAdaptiveMode` + `scheduleInterruption` (runtime.ts) | Verrouille les 4 fonctions critiques importées par tous les hooks |
| **3 (2 semaines)** | Sortir Contrats S0/S2/S5 + establishment map en JSON | 3 rangées passent de ⚠️ à ✅ sur *Data-driven* |
| **4 (2 semaines)** | Sortir bloc pivot Clinique S3 en config JSON générique | 1 rangée ❌ → ✅ sur *Réutilisable* |
| **5 (1 semaine)** | Test unit sur `runContractNegotiation` + `executeMailAsyncEffect` (4 kinds) | 2 rangées ⚠️ → ✅ sur *Testée* |

Après ces 5 phases (8 semaines), la matrice devrait être à **∼90 % vert sur les 4 axes**, condition pour claimer "Revealio est une plateforme, pas une application".

### 8.5 Ma recommandation d'ordre

**Semaine 1** : Playwright + les 5 tests E2E → filet de sécurité qui protège TOUT le reste du refacto ci-dessus. Impossible d'avancer sereinement sans ça.

**Semaine 2** : Tests unit sur les 4 fonctions runtime.ts critiques (les mêmes qui ont causé la régression `checkCompletionRules` — si on avait testé `isCurrentPhaseValidatedByRules` avant, on aurait vu le problème).

**Semaines 3-4** : Migrations data-first (contrats, establishment) sans risque grâce au filet des semaines 1-2.

Le message central est simple : **la couverture de tests est la priorité absolue, tout le reste peut suivre**. Sans tests, chaque migration data-first ou refacto ajoute un risque de régression du même type que celle de `checkCompletionRules`.

---

## 9. Vision "framework" (retour advisor — 1er juillet 2026)

Retour formulé par un advisor produit : *"Avant : découper page.tsx. Aujourd'hui : faire du moteur de jeu un framework."* Nouvelle pyramide cible :

```
GameEngine
    Engine
        Runtime
            Modules
                Scenario JSON
```

Le jour où on y arrive : **créer un nouveau serious game = 1 scenario JSON + quelques prompts + des documents + éventuellement 1 nouveau module** si la mécanique est vraiment nouvelle.

### 9.1 Diagnostic vs cette cible

**Les 5 couches existent déjà dans le codebase après le refacto de la journée.** Ce qui manque c'est la surface publique, pas la substance.

| Couche | Existant | Gap "framework" |
|---|---|---|
| **GameEngine** | `page.tsx` (2643 L) composant React | Pas de point d'entrée programmatique. Rien qui dise "voici comment on lance un jeu depuis l'extérieur". |
| **Engine** (hooks) | `useSendChatMessage`, `useSendMail`, `useEndPresentation`, `useScenarioInit`, `useDeepSave`, `PlayerContext` | Aucun `index.ts` barrel qui exporte l'API publique. Un dev externe ne sait pas quoi importer. |
| **Runtime** | `app/lib/runtime.ts` (~1500 L, fonctions pures) | Types en `any` partout (`SessionState` existe mais `scenario as any` répandu). Aucune JSDoc systématique. |
| **Modules** | `handlers/modules/{Mail,Contract,Interview}Module.ts` + registry | Registre hardcodé (`registry.ts` mappe types → modules). Ajouter un module = modifier ce fichier. Aucun kit "how to write a module". |
| **Scenario JSON** | 10 scenarios actifs + 13 maintenance | **Aucun schéma JSON versionné**. Aucune doc de référence. Aucun scaffolding pour créer un nouveau. |

### 9.2 Le vrai gap : DX & packaging, pas refonte technique

Aujourd'hui, si tu veux créer un nouveau scenario `founder_06_launch` :

1. Tu dois copier un scenario existant (ex: `founder_02_mvp`), le renommer partout
2. Tu ouvres le JSON, tu essaies de deviner ce que chaque champ fait — il n'y a pas de schéma
3. Si tu veux utiliser MailModule, tu ne sais pas quelles clés `mail_config` sont supportées sans lire `MailModule.ts`
4. Si tu veux une mécanique custom, tu ne sais pas comment écrire un module — il faut lire les 3 modules existants et le registry

**Aucune de ces étapes ne casse le refacto de la journée. Elles restent juste opaques.** Un dev externe (ou même un game designer non-dev) n'a pas les outils pour créer un scenario en autonomie.

### 9.3 Ce qu'il faut livrer pour passer d'app à framework

En 4 chantiers modestes (chacun ∼1 semaine) :

#### Chantier F1 — Schéma JSON versionné du scenario

Créer `packages/scenario-schema/scenario.schema.json` (JSON Schema Draft 2020-12) qui documente :
- Chaque champ de `scenario.json` avec sa description et son type
- Les patterns par module (`mail_config` si `modules: ["mail"]`, etc.)
- Les valeurs enum acceptées (`interaction_mode`, `contract_type`, etc.)

Puis :
- Wire dans `validate:scenarios` : valider chaque scenario contre le schéma
- Générer les types TypeScript depuis le schéma (`json-schema-to-typescript`) → remplace tous les `(scenario as any)`
- Publier le schéma sur `revealio.live/scenario.schema.json` pour que Cursor/VSCode fasse l'autocomplete quand on édite un scenario JSON

**Impact** : un game designer voit l'autocomplete de chaque champ dans son IDE.

#### Chantier F2 — API publique `@revealio/engine`

Créer un barrel `app/lib/engine/index.ts` qui exporte :
- `startGame(scenario, callbacks)` — point d'entrée programmatique
- Types : `Scenario`, `Phase`, `Actor`, `Session`, `ModuleAction`
- Les 4 handlers publics : `Mail`, `Contract`, `Interview`, `Voice`
- Les hooks React : `usePlayer`, `useSendMessage`, `useSendMail`, `useEndPresentation`
- Documentation JSDoc systématique sur chaque export

Puis `README.md` du package avec un exemple minimal (10 lignes de code qui joue un scenario Hello World).

**Impact** : quand un dev arrive, il ouvre `app/lib/engine/README.md` et sait tout de suite quoi importer.

#### Chantier F3 — Scaffolding CLI

Créer `scripts/scaffold-scenario.mjs` :

```bash
npm run scaffold:scenario -- --id founder_06_launch --title "Lancer la V2"
```

Génère :
- `scenarios/founder_06_launch/scenario.json` (template minimal avec 2 phases préconfigurées, valide au schéma)
- `scenarios/founder_06_launch/prompts/example_actor.md` (template de prompt)
- `scenarios/founder_06_launch/documents/README.md` (comment ajouter des PDFs)

**Impact** : un game designer crée un scenario en 30 secondes au lieu de 30 minutes.

#### Chantier F4 — Module registry déclaratif

Aujourd'hui `handlers/registry.ts` mappe hardcodé `{ mail: MailModule, contract: ContractModule, interview: InterviewModule }`. Le rendre découvrable :

- Convention `handlers/modules/{name}Module.ts` avec un export nommé `{name}Module: ModuleDefinition`
- `resolveModules(phase)` glob le folder et charge les modules déclarés dans `phase.modules`
- Doc `MODULE_GUIDE.md` : "comment écrire un nouveau module en 4 étapes"

**Impact** : ajouter un module custom `LeadCaptureModule.ts` ne demande plus de toucher au registry.

### 9.4 Ordre recommandé — F1 avant tout

- **Sans F1 (schéma JSON) rien d'autre ne tient** : les 3 autres chantiers dépendent de types clairs et d'un contrat data-first documenté.
- F2 et F3 sont indépendants, peuvent être faits en parallèle après F1.
- F4 peut attendre : ajouter un nouveau module reste rare (∼1× par an ?).

### 9.5 Ce que ça donne à 3 mois si les 4 chantiers sont livrés

**Créer un nouveau serious game "Directeur RH en crise"** :

1. `npm run scaffold:scenario -- --id rh_crisis --title "Directeur RH en crise"` (30 s)
2. Éditer `rh_crisis/scenario.json` dans VSCode avec autocomplete Zod-like (10-20 min pour poser la structure des phases)
3. Écrire les prompts pour les acteurs IA (30 min-2 h selon densité)
4. Ajouter les PDFs dans `documents/`
5. Lancer `npm run test` — le schema validation passe → prêt à jouer

**Zéro TypeScript à écrire.** C'est ça, la véritable cible de Revealio.

### 9.6 Cohérence avec la matrice du § 8

- F1 (schéma JSON) fait passer les rangées ⚠️ *Data-driven* à ✅ en donnant un cadre clair de ce qui doit vivre en JSON
- F2 (API publique) fait passer *Réutilisable* à ✅ en donnant des points d'entrée stables
- F3 (scaffolding) rend concrète la promesse "nouveau scenario en 30 min"
- F4 (module registry) rend concrète la promesse "1 nouveau module si vraiment nouveau"

**Les 4 chantiers ensemble transforment Revealio d'application en plateforme.** C'est cohérent avec l'analyse du PO, et c'est faisable en 4 semaines calendaires (∼1 sprint chacun) une fois les tests E2E de la Section 8 en place.

### 9.7 Ma recommandation d'ordre final (mise à jour du § 8.5)

1. **Semaine 1** : Playwright + 5 tests E2E happy-path (filet obligatoire)
2. **Semaine 2** : Tests unit runtime.ts critiques
3. **Semaines 3-4** : F1 — schéma JSON + types stricts + validation
4. **Semaine 5** : F2 — API publique + README
5. **Semaine 6** : F3 — scaffolding CLI
6. **Semaine 7** : F4 — module registry (optionnel, peut attendre)

Après 6-7 semaines : **Revealio est un framework, plus une app.** Un game designer non-dev peut prototyper un scenario, un dev externe peut ajouter un module custom sans lire tout le codebase, et un futur pivot produit (revendre la plateforme à des écoles / assureurs / hôpitaux qui veulent leurs propres scénarios) devient techniquement crédible.
