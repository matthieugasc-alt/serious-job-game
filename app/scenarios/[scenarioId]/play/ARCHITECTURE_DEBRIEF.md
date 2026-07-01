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
