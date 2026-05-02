# AUDIT DE STABILISATION — Système de scénarios SJG

**Date** : 2 mai 2026  
**Périmètre** : 23 scénarios (6 Founder + 17 classiques), moteur de jeu, API IA  
**Statut** : Lecture seule — aucune modification de code

---

## 1. ARCHITECTURE ACTUELLE

### 1.1 Comment les scénarios sont définis

Chaque scénario est un dossier `/scenarios/{id}/` contenant :

- `scenario.json` — définition complète : meta, narrative, actors, channels, resources (documents), phases, endings, completion_rules, constraints
- `prompts/{actor_id}.md` — prompt IA par personnage, avec variables `{{phaseTitle}}`, `{{message}}`, `{{recentConversation}}`

Le moteur charge le JSON via `loadScenario()` dans `app/lib/scenarios.ts`, et le prompt via `loadPrompt()`.

**Point critique** : le champ `scenario` dans `SessionState` est typé `any`. Aucune validation de schéma à l'exécution. Un champ mal nommé (ex: `competencies` au lieu de `scoring.criteria`) passe silencieusement et casse la mécanique sans erreur visible.

### 1.2 Comment les phases sont enchaînées

Le moteur supporte **6 mécaniques de transition** différentes, vérifiées à des endroits différents du code :

| Mécanisme | Où c'est vérifié | Fichier |
|-----------|-----------------|---------|
| `auto_advance: true` + `canAdvance` | useEffect ligne 1360 | page.tsx |
| `auto_advance_at` (temps simulé) | useEffect ligne 1393 | page.tsx |
| `max_duration_sec` (temps réel) | useEffect ligne 1449 | page.tsx |
| `send_advances_phase` (envoi mail) | `handleSendMail()` ligne 2376 | page.tsx |
| `failure_rules` (loop-back NPC) | handler chat ligne ~2316 | page.tsx |
| Validation par scoring IA | `isCurrentPhaseValidatedByRules()` | runtime.ts |

La validation par scoring passe par `isCurrentPhaseValidatedByRules()` dans `runtime.ts` qui vérifie dans cet ordre :
1. `required_player_evidence` (hard gate — keywords dans messages joueur)
2. `required_npc_evidence` (hard gate — keywords dans messages NPC)
3. `min_score` (score IA >= seuil)
4. `any_flags` (un flag parmi la liste)
5. `all_flags` (tous les flags de la liste)
6. `max_exchanges` (nombre de messages)

Si aucun de ces critères n'est rempli et qu'il n'y a pas de timer (`max_duration_sec`), **le joueur est bloqué indéfiniment**.

### 1.3 Comment les triggers fonctionnent

Les triggers sont de deux types :

**Déterministes** (fiables) :
- Timer wall-clock (`max_duration_sec`)
- Timer simulé (`auto_advance_at` + timeline)
- Action joueur (envoi mail avec `send_advances_phase: true`)
- Flags explicites (`on_send_flags` sur le mail)

**Non-déterministes** (fragiles) :
- Score IA (`min_score`) — dépend de la qualité de l'évaluation LLM
- Keywords NPC (`failure_rules.npc_keywords`) — dépend du texte exact généré par l'IA
- `required_npc_evidence` — dépend de ce que l'IA dit en roleplay

### 1.4 Comment les documents sont chargés

Trois types de documents coexistent avec des chemins de rendu différents :

| Type | Champ dans JSON | Rendu dans l'UI |
|------|----------------|-----------------|
| PDF | `file_path: "/documents/foo.pdf"` | Boutons "Ouvrir" / "Télécharger" via `/api/download` |
| Image | `image_path: "/documents/photo.jpg"` | Rendu `<img>` direct |
| Texte inline | `content: "FICHE PRODUIT..."` | Modal texte via bouton "Lire" |

La visibilité est contrôlée par `available_from_phase` et `hidden_until_phase`, gérés par `filterDocumentsByPhase()` dans runtime.ts. Cette fonction construit un graphe de progression via la chaîne `next_phase`.

**Fragilité** : si un `next_phase` est mal orthographié, le graphe de progression est cassé et les documents deviennent invisibles/visibles au mauvais moment.

### 1.5 Comment les acteurs sont injectés

Les acteurs sont définis dans `scenario.json` → `actors[]` avec un `actor_id`, un `prompt_file`, et un `controlled_by`.

Pour les phases, `ai_actors[]` liste les acteurs actifs. Le moteur résout le prompt via `/api/scenarios/{id}/prompts/{actor_id}` puis l'envoie au LLM.

**Problème majeur : les acteurs dynamiques**. Le scénario 0 utilise `"chosen_cto"` comme placeholder dans `ai_actors`, `entry_events`, et `mail_config`. La résolution se fait côté client via `resolveDynamicActors()` — une fonction appelée **manuellement à 8+ endroits** dans page.tsx. Si un seul appel est oublié, le placeholder reste non résolu et l'IA reçoit un prompt vide.

Même pattern avec `resolveEstablishmentPlaceholders()` pour le scénario 3 (CHU/Saint-Martin/Clinique).

### 1.6 Comment les transitions de phase sont validées

Deux systèmes **en parallèle** :

1. **runtime.ts** : `isCurrentPhaseValidatedByRules()` → met `canAdvance = true` → le useEffect auto-advance détecte et avance
2. **page.tsx** `handleSendMail()` : re-implémente **sa propre vérification** de `required_npc_evidence`, `required_player_evidence` et `min_score` (lignes 2417-2452) avant de laisser passer `send_advances_phase`

**C'est une duplication de logique métier**. Si on change les règles dans runtime.ts sans mettre à jour handleSendMail, le comportement diverge.

### 1.7 Comment l'IA est utilisée dans la boucle

`/api/chat/route.ts` fait **2 appels LLM en parallèle** :

1. **Roleplay** : prompt personnage + CONVERSATION_CONTRACT + historique structuré → réponse NPC
2. **Évaluation** : prompt d'évaluation strict + messages joueur uniquement → `{matched_criteria, score_delta, flags_to_set}`

Côté client, `applyEvaluation()` (runtime.ts) incrémente le score et set les flags. Puis `isCurrentPhaseValidatedByRules()` vérifie si la phase est validée.

**Guard anti-régression** : les flags déclarés dans `mail_config.on_send_flags` sont "réservés" — le scoring IA ne peut pas les setter. Seul `handleSendMail()` peut. Ça empêche l'IA d'avancer une phase mail-gated prématurément.

---

## 2. PROBLÈMES STRUCTURELS

### 2.1 Le fichier monolithique — page.tsx (7 587 lignes)

C'est **la source principale de régression**. Ce fichier unique contient :
- Le moteur de jeu client (state, transitions, timers)
- L'UI complète (chat, mail, documents, contacts, debug panel)
- La logique métier spécifique à chaque type de scénario
- **60+ références hardcodées** à des scénarios spécifiques : `thomas_novadev`, `chosen_cto`, `scope_proposal`, `rupture_cto`, `choice_confirmation`, `negotiation_proposal`, `pilot_pitch`, `founder_03`, `contrat_novadev`, etc.

Chaque nouveau scénario Founder a ajouté des `if (mailKind === "xxx")` et `if (scenarioId.startsWith("founder_0N"))` dans ce fichier. **Modifier un scénario = modifier page.tsx = risquer de casser tous les autres.**

### 2.2 Dépendances implicites entre scénarios

Il n'y en a pas au niveau des données (les JSON sont indépendants). Mais il y en a **massivement dans le code** :

- `handleSendMail()` contient des blocs spécifiques pour `scope_proposal`, `choice_confirmation`, `negotiation_proposal`, `pilot_pitch`, `rupture_cto` — tous des mailKinds Founder
- `resolveDynamicActors()` ne sert qu'au scénario 0 mais tourne pour tous
- `resolveEstablishmentPlaceholders()` ne sert qu'au scénario 3
- La détection `isFounderScenario = scenarioId.startsWith("founder_")` conditionne le debrief, le checkpoint, le bouton "Continuer la campagne"

**Conséquence** : toucher la logique mail pour un scénario classique peut casser un scénario Founder, et vice versa.

### 2.3 Validations basées sur l'IA (non-déterministes)

Les 13 scénarios en maintenance dépendent **uniquement** de `min_score` pour avancer. Ce score vient d'un appel LLM (`gpt-4.1-mini`) qui évalue les messages du joueur contre des critères textuels.

Problèmes observés :
- Le LLM peut être trop strict (score reste à 0 → joueur bloqué)
- Le LLM peut être trop laxiste (score monte trop vite → phase sautée)
- Le LLM peut halluciner des `flags_to_set` qui n'existent pas dans le scénario
- L'évaluation est fire-and-forget : pas de log, pas de traçabilité, pas de replay

### 2.4 State non maîtrisé

Le `SessionState` vit **entièrement côté client** dans un `useState<SessionState>`. Pas de persistence serveur, pas de validation.

Conséquences :
- Un refresh de page perd tout l'état du jeu
- Pas de replay possible
- Pas de vérification côté serveur que l'avancement est légitime
- Le scénario JSON est **muté en place** par `resolveDynamicActors()` (ligne 482 : `phase.ai_actors = phase.ai_actors.map(...)`) — on modifie le scenario source, pas une copie

### 2.5 Sources de bugs récurrents

**Placeholders non résolus** :
- `chosen_cto` → résolu manuellement en 8+ endroits ; si oublié → prompt vide → IA générique
- `{{establishment_label}}` → résolu dans page.tsx uniquement
- `{{playerName}}` → interpolé côté serveur dans `/api/chat` mais pas validé

**Documents manquants** :
- Un `file_path` vers un PDF inexistant → bouton "Ouvrir" qui renvoie une 404
- Un `content` inline sur un scénario Founder → le viewer PDF essaie de l'ouvrir en PDF → échoue silencieusement
- Pas de validation au chargement que les documents existent

**Timing incohérent** :
- `delay_ms` sur les `entry_events` crée des `pendingTimedEvents` → si la phase change avant le flush, l'événement est obsolète (corrigé par un guard, mais ajoute de la complexité)
- `max_duration_sec` est en temps réel (wall-clock) mais `auto_advance_at` est en temps simulé (sim_speed_multiplier) — deux systèmes de temps concurrents

**Répétitions IA** :
- L'anti-repetition guard compare par Jaccard > 80% — contournable si l'IA reformule légèrement
- Le retry avec temperature 1.0 peut produire du contenu hors-personnage

**Logique Founder vs classique mélangée** :
- Le debrief a deux chemins : `isFounderDebrief` vs classique
- Le bouton "Continuer la campagne" n'apparaît qu'en Founder
- Le checkpoint/notify ne se fait qu'en Founder
- Tout ça dans le même fichier, entremêlé avec la logique générique

### 2.6 Le champ `competencies` vs `scoring.criteria`

Bug systémique découvert récemment : 15 scénarios classiques utilisaient `competencies` dans leur JSON. Mais le moteur lit **uniquement** `phase.scoring.criteria`. Le champ `competencies` est complètement ignoré → les phases ne scorent jamais → ne valident jamais → joueur bloqué.

**Cause racine** : aucune validation de schéma. Un JSON valide syntaxiquement mais avec les mauvais noms de champs passe sans erreur.

---

## 3. PROPOSITION D'ARCHITECTURE DE STABILISATION

### A. Invariants par scénario — Schéma de validation

Créer un fichier `app/lib/scenarioValidator.ts` qui valide un `scenario.json` au chargement :

```
Vérifications obligatoires :
1. Chaque phase a un phase_id unique
2. Chaque phase.ai_actors référence un actor_id existant dans actors[]
3. Chaque phase.active_channels référence un channel_id existant dans channels[]
4. Chaque phase a AU MOINS un trigger de sortie déterministe :
   - max_duration_sec, OU
   - send_advances_phase: true, OU
   - auto_advance_at, OU
   - any_flags / all_flags avec des flags settables par mail ou scoring
5. Chaque phase avec scoring.criteria a des criteria avec criterion_id uniques
6. Chaque next_phase pointe vers un phase_id existant
7. Chaque document avec file_path pointe vers un fichier existant dans /public
8. Chaque actor avec prompt_file a un fichier correspondant dans /prompts
9. Pas de champ "competencies" orphelin (doit être scoring.criteria)
10. Chaque entry_event a un actor qui existe dans actors[]
```

Ce validateur retourne une liste d'erreurs/warnings. Il ne bloque pas le chargement (sauf erreurs critiques) mais log clairement.

### B. Validation déterministe — Éliminer la dépendance au scoring IA pour l'avancement

**Principe fondamental** : l'IA évalue la qualité de la performance (pour le score et le debrief). L'IA ne décide **jamais** si une phase avance.

L'avancement de phase doit **toujours** venir de :
1. **Une action joueur** : envoyer un mail (`send_advances_phase`), signer un contrat, cliquer un bouton
2. **Le temps** : `max_duration_sec` (wall-clock) ou `auto_advance_at` (simulé)
3. **Un flag explicite** set par une action joueur (mail, bouton), pas par le scoring IA

Le `min_score` ne devrait plus être un trigger d'avancement de phase. Il reste utile pour :
- Le calcul de la fin (endings.conditions)
- Le debrief (score final, points forts/faibles)
- L'adaptive mode (guided/standard/autonomy)

Pour les scénarios classiques actuels (chat uniquement), la transition peut être :
- `max_exchanges` (nombre de messages) comme fallback
- `max_duration_sec` comme safety net
- Le scoring continue mais n'est utilisé que pour le debrief

### C. Contrat global IA — Renforcement

Le `CONVERSATION_CONTRACT` actuel dans `/api/chat/route.ts` est bon (identité stable, anti-boucle, une intention par message). Points à renforcer :

1. **Interdiction de setter des flags dans la réponse** : l'IA ne devrait jamais pouvoir influencer l'avancement. Ça passe par `mailReservedFlags` mais c'est incomplet — le guard actuel ne bloque que les flags mail.

2. **Injection du périmètre de phase** : `phase_focus` est déjà injecté mais pas systématiquement défini dans les scénarios. Chaque phase devrait avoir un `phase_focus` obligatoire.

3. **Contrainte de longueur par type** : le contrat dit "2 phrases max" pour le chat mais ne dit rien pour les mails IA (reply auto après envoi joueur). Les mails IA devraient aussi être contraints.

### D. Validation automatique pré-push

Script `scripts/validate-scenarios.ts` qui :

```
Pour chaque scénario dans /scenarios/ :
  ✓ Parse le JSON (syntaxe valide)
  ✓ Vérifie le schéma (invariants du point A)
  ✓ Vérifie les documents (file_path → fichier existe dans /public)
  ✓ Vérifie les prompts (prompt_file → fichier existe dans /prompts)
  ✓ Vérifie les placeholders résiduels ({{xxx}} dans les prompts → tous listés dans les variables d'interpolation)
  ✓ Vérifie les incohérences de phase (next_phase circulaire, phase orpheline)
  ✓ Vérifie qu'aucune phase ne dépend uniquement de min_score
  ✓ Vérifie que chaque acteur AI dans ai_actors a un prompt_file ou system_prompt

Résultat : liste d'erreurs (bloquantes) et warnings (informatifs)
Exit code 1 si erreurs → bloque le push
```

---

## 4. PLAN D'IMPLÉMENTATION SÉCURISÉ

### Étape 1 — Validateur de scénarios (ajout non destructif)

**Quoi** : Ajouter `app/lib/scenarioValidator.ts` + `scripts/validate-scenarios.ts`

**Impact** : ZÉRO. C'est un nouveau fichier. Ne modifie rien d'existant. Ne touche ni page.tsx ni runtime.ts.

**Livrable** :
- `scenarioValidator.ts` : fonction `validateScenario(json) → { errors: string[], warnings: string[] }`
- `validate-scenarios.ts` : script CLI qui parcourt tous les scénarios et affiche le rapport
- Exécution : `npx ts-node scripts/validate-scenarios.ts`

**Vérification** : Le script tourne sur les 23 scénarios existants. Les scénarios actifs (Founder + 4 classiques) doivent passer sans erreur. Les 13 en maintenance doivent remonter des warnings (pas de trigger déterministe).

### Étape 2 — Refactoring de handleSendMail (isolation)

**Quoi** : Extraire la logique spécifique par `mailKind` dans des handlers séparés, déclarables depuis le `scenario.json`.

**Principe** : au lieu de `if (mailKind === "scope_proposal") { ... }` hardcodé dans page.tsx, le `mail_config` déclare les effets :

```json
"mail_config": {
  "kind": "scope_proposal",
  "send_advances_phase": true,
  "on_send_flags": { "scope_reduced": true, "alexandre_convinced": true },
  "on_send_trigger_chat": {
    "actor": "thomas_novadev",
    "use_ai": true,
    "delay_ms": 800
  }
}
```

Le moteur lit cette config et exécute les effets sans code spécifique au scénario.

**Impact** : Modifie `handleSendMail()` dans page.tsx MAIS ne change pas le comportement observable. Chaque scénario Founder est migré un par un avec vérification.

**Vérification** : Avant/après, le même input produit le même output. Test manuel de chaque scénario Founder.

### Étape 3 — Refonte des 13 scénarios classiques (un par un)

**Quoi** : Pour chaque scénario en maintenance, remplacer `min_score` comme trigger d'avancement par un trigger déterministe.

**Principe par type de scénario** :

Pour un scénario **chat uniquement** (ex: "Le bug du vendredi") :
- L'avancement se fait par `max_exchanges` (ex: 8 échanges) + `max_duration_sec` comme safety net
- Le `scoring.criteria` reste pour le debrief mais n'influence plus l'avancement
- Le score conditionne le `ending` (succès / partiel / échec)

Pour un scénario **chat + mail** (ex: "Le client qui hésite") :
- Phase chat : avance par `max_exchanges` ou `max_duration_sec`
- Phase mail : avance par `send_advances_phase: true`
- Le temps n'est PAS un fallback sur les phases mail (conformément à ta règle)

Pour un scénario **multi-phase complexe** (ex: "Due diligence sous tension") :
- Chaque phase avance par action joueur (mail, réponse structurée)
- Le scoring reste pour le debrief

**Impact** : Uniquement les fichiers `scenario.json` des scénarios en maintenance. Aucun changement dans le moteur.

**Vérification** : Le validateur (étape 1) confirme que chaque scénario refactoré a des triggers déterministes. Test manuel de chaque scénario avant de retirer le status "maintenance".

### Étape 4 — Extraction de la logique Founder de page.tsx (activation progressive)

**Quoi** : Créer `app/lib/founderHandlers.ts` qui contient toute la logique spécifique Founder extraite de page.tsx.

**Principe** :
- `handleFounderMailSideEffects(mailKind, session, scenario)` — logique rupture_cto, scope_proposal, negotiation_proposal, etc.
- `resolveFounderDynamicActors(session, chosenCtoId)` — résolution chosen_cto
- `getFounderCheckpoint(session, scenario)` — gestion des checkpoints campagne

page.tsx appelle ces fonctions au lieu de contenir le code inline.

**Impact** : page.tsx perd ~500 lignes de code Founder-spécifique. Le comportement ne change pas.

**Vérification** : TypeScript compile. Les 6 scénarios Founder fonctionnent identiquement.

---

## 5. GARANTIE ANTI-RÉGRESSION

### 5.1 Validateur de scénarios (prévention)

Le script `validate-scenarios.ts` tourne **avant chaque modification**. Si un scénario actif remonte une erreur après un changement, le changement est rejeté.

Ce que le validateur détecte :
- Documents inexistants
- Acteurs manquants
- Placeholders visibles dans les prompts
- Incohérences de phase (next_phase cassé, phase orpheline)
- Champs mal nommés (competencies au lieu de scoring.criteria)
- Phases sans trigger de sortie déterministe

### 5.2 Tests headless (détection)

Le framework de test headless existant (agents joueurs) peut être utilisé pour valider les scénarios après modification :
- Lancer 1 agent sur le scénario modifié
- Vérifier qu'il atteint la fin (pas bloqué)
- Vérifier que les phases avancent dans l'ordre attendu
- Comparer le nombre de phases traversées avec le nombre de phases du scénario

### 5.3 Feature flags (isolation)

Chaque scénario a déjà un `meta.status` : `"active"` ou `"maintenance"`. On l'utilise comme feature flag :
- Un scénario en `maintenance` est invisible pour les users normaux
- Un `super_admin` peut le lancer en debug
- On ne passe un scénario en `active` qu'après validation complète (validateur + test headless + test manuel)

### 5.4 Étapes réversibles

Chaque étape du plan est conçue pour être réversible :
- Étape 1 (validateur) : ajout pur, supprimable sans effet
- Étape 2 (refactoring handleSendMail) : si un scénario casse, on peut revert le JSON et garder l'ancien code en fallback
- Étape 3 (refonte classiques) : chaque scénario est indépendant, on peut les migrer un par un
- Étape 4 (extraction Founder) : refactoring interne, le comportement externe ne change pas

### 5.5 Checklist de validation par scénario

Avant de passer un scénario de `maintenance` à `active` :

```
□ Le validateur passe sans erreur
□ Un agent headless complète le scénario sans blocage
□ Test manuel complet (toutes les phases, tous les chemins)
□ Le debrief s'affiche correctement
□ Les documents sont accessibles
□ Les transitions de phase sont toutes déterministes
□ Aucune phase ne dépend uniquement de min_score
```

---

## 6. RÉSUMÉ DES LIVRABLES

| # | Livrable | Risque | Dépendances |
|---|----------|--------|-------------|
| 1 | `scenarioValidator.ts` + script CLI | Nul (ajout pur) | Aucune |
| 2 | Refactoring handleSendMail | Faible (même comportement) | Validateur prêt |
| 3 | Refonte des 13 classiques (JSON only) | Faible (un par un, feature-flagged) | Validateur prêt |
| 4 | Extraction logique Founder | Moyen (refactoring de code actif) | Étapes 1-3 |

**Ordre recommandé** : 1 → 3 → 2 → 4

L'étape 1 est un prérequis absolu. L'étape 3 est la plus urgente (débloquer les scénarios classiques). L'étape 2 réduit la dette technique. L'étape 4 est du long terme.

---

## ANNEXE — État des 23 scénarios

| Scénario | Type | Status | Trigger avancement | Risque |
|----------|------|--------|-------------------|--------|
| founder_00_cto | Founder | active | flags + mail + timer | ✅ |
| founder_01_incubator | Founder | active | mail + voice + timer | ✅ |
| founder_02_mvp | Founder | active | mail + flags | ✅ |
| founder_03_clinical | Founder | active | mail + flags | ✅ |
| founder_04_v1 | Founder | active | mail + flags | ✅ |
| founder_05_sales | Founder | active | mail + flags + failure_rules | ✅ |
| art_du_malentendu | Classique | active | max_duration_sec | ✅ |
| atterrissage | Classique | active | max_duration_sec | ✅ |
| client_qui_hesite | Classique | active | max_duration_sec | ✅ |
| heritage_fourviere | Classique | active | any_flags | ✅ |
| amendement_derniere_minute | Classique | maintenance | min_score SEUL | ⛔ |
| bug_du_vendredi | Classique | maintenance | min_score SEUL | ⛔ |
| closing_sous_pression | Classique | maintenance | min_score SEUL | ⛔ |
| compromis_qui_coince | Classique | maintenance | min_score SEUL | ⛔ |
| due_diligence_sous_tension | Classique | maintenance | min_score SEUL | ⛔ |
| feature_qui_divise | Classique | maintenance | min_score SEUL | ⛔ |
| inclusion_urgence | Classique | maintenance | min_score SEUL | ⛔ |
| mot_des_parents | Classique | maintenance | min_score SEUL | ⛔ |
| permanence_debordee | Classique | maintenance | min_score SEUL | ⛔ |
| question_gouvernement | Classique | maintenance | min_score SEUL | ⛔ |
| relance_qui_coince | Classique | maintenance | min_score SEUL | ⛔ |
| retour_utilisateur | Classique | maintenance | min_score SEUL | ⛔ |
| sortie_annulee | Classique | maintenance | min_score SEUL | ⛔ |
