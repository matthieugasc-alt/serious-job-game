# Audit critique — Revealio comme moteur universel de simulation professionnelle

**Date** : 1er juillet 2026
**Auteur** : équipe moteur
**Statut** : exercice d'audit stratégique, aucun code produit
**Périmètre** : évaluation honnête de l'architecture actuelle contre la vision « moteur organisé autour des mécaniques »

Le PO a explicitement demandé un audit sans complaisance. Ce document tient cette ligne, y compris sur des chantiers récents (F/V/E/W/X/Y/Z/CF/VS/AS) que j'ai livrés et qui, malgré leur qualité individuelle, sont pour certains structurellement incompatibles avec la vision cible.

---

## Verdict synthétique

L'architecture actuelle est **partiellement compatible** avec la vision cible. La partie *runtime pur + auditabilité + garde-fous automatiques* est excellente et transposable telle quelle. La partie *player / modules / composants UI* est structurellement organisée autour de la notion de « phase de scénario » et non autour de la notion de « mécanique de jeu » — c'est le mauvais pivot.

Concrètement :

- Ce qui est excellent et à garder tel quel : le runtime pur, `applyPhaseObservation`, la séparation IA observe / moteur décide, les garde-fous automatiques, le vocabulaire déclaratif (severity, competencies, error_type), le pattern MODULE_REGISTRY, la culture des tests.
- Ce qui va devoir être réécrit : le MailModule (53KB de spécificités scenario), le ContractModule (branches S0/S2/S5), PresentationModeView (mélange mécanique universelle + contenu S3), page.tsx (5500 lignes qui font tout), la conflation *PhaseModule = mécanique*, le fourre-tout `ModuleAction` (30+ types).
- Ce qui manque complètement : la notion de « mécanique » comme entité de premier ordre, les outils métier (kanban, mindmap, grille de découverte), un contrat d'entrée/sortie typé par mécanique, une couche `MechanicRunner`, la composition mécanique-par-mécanique dans le scenario JSON.

Si tu construis 50 scénarios avec l'architecture actuelle, tu vas passer 80% du temps à modifier le player pour chaque scénario. Si tu inverses le modèle maintenant (mécaniques d'abord, scenarios ensuite), tu passeras 80% du temps à écrire des JSON. C'est le vrai enjeu.

---

## Réponses détaillées aux 7 questions

### 1. L'architecture actuelle est-elle compatible avec cette vision ?

**Non structurellement, oui partiellement.**

Le pivot actuel est *scenario → phases → modules*. Une phase déclare des `modules: ["mail", "contract"]` qui s'active pendant cette phase. Un module = un handler pour un aspect (envoi de mail, signature de contrat, entretien). Cela ressemble à ta vision mais **ce n'est pas la même chose**.

Ta vision : *scenario = séquence de mécaniques*, chaque mécanique est une expérience joueur complète (qualifier un prospect, produire un one-pager, négocier un accord). Une mécanique embarque son UI, ses outils, son évaluateur, ses tests, sa doc. Le player ne fait qu'invoquer `runMechanic(id, context)`.

Architecture actuelle : le player est un chef d'orchestre qui **connaît** le mail, le contract, le voice_qa, la présentation. Il expose 60+ fields dans PlayerContext. Il choisit quelle vue rendre selon `currentInteractionMode`. Chaque nouvelle mécanique = touche au player.

Le décalage n'est pas cosmétique. Le player actuel *présuppose* qu'un scenario est fait de « chat + mail + éventuellement présentation ». La mécanique « facilitation d'atelier collectif » ou « planification kanban » ne rentre pas dans ce moule. Aucun code n'existe pour les accueillir.

### 2. Quels éléments actuels devront forcément être réécrits ?

Liste factuelle :

**MailModule (53 KB).** Aujourd'hui c'est un dépôt de spécificités scenario. Il gère : cold email KOL, réponse DSI hospitalière, mail template action, pivot clinique, HARD_REJECT, similarité de mails, whitelisting de destinataires. Ce n'est pas une mécanique universelle « envoyer un livrable écrit », c'est un mille-feuille de contenus S1/S3/S5. À exploser :
- une mécanique universelle « production_livrable_ecrit » (destinataire, sujet, corps, PJ, envoi)
- une mécanique « qualification_par_mail » (échange itératif jusqu'à décision côté NPC)
- les branches spécifiques (HARD_REJECT, similarity, whitelist) sont du **contenu** de scenario, pas de la mécanique — devraient partir en `scenario.json`

**ContractModule.** Idem, branches S0/S2/S5 pour les 3 types de contrats. La mécanique universelle « négociation d'un accord contractuel » existe (proposer, contre-proposer, signer, refuser), mais aujourd'hui elle est éclatée en 3 pipelines qui vivent chacun leur vie. `contractNegotiationSenders.ts` est le symptôme.

**PresentationModeView (610 lignes).** Contient à la fois :
- la mécanique universelle « présenter à un jury » (mic, timer, transcript, evaluation)
- du contenu S3 (jury Yuki Tanaka, enfants du CMJ, hand-raising)

Refactor cible : la mécanique universelle vit dans `mechanics/presentation/`. Le contenu S3 vit dans `scenarios/pediatric_pitch/actors.json`. La vue passe les acteurs comme paramètre, ne les nomme pas.

**page.tsx (5500 lignes).** Le pire acteur. Il fait tout : boot, auth, capability probe, timer, chat, mail, contract, présentation, deep_save, resume banner, briefing overlay, one-pager editor, TTS, evaluation dispatch, feature flags. Aujourd'hui *impossible* d'ajouter une mécanique sans y toucher.

Refactor cible : page.tsx devient un shell qui charge le scenario, initialise la session, boucle sur la séquence de mécaniques (`for each mechanic in scenario.sequence: runMechanic(mechanic.id, mechanic.context)`), gère les transitions. **Aucune connaissance métier**.

**Le JSON scenario actuel.** Contient des sections nommées comme les composants actuels : `mail_config`, `presentation_config`, `voice_qa_config`, `contract_config`. Ces noms ne survivront pas au refactor mécanique.

Refactor cible : le JSON devient une séquence explicite :
```json
{
  "sequence": [
    { "mechanic": "qualification", "params": {...}, "success_criteria": {...} },
    { "mechanic": "synthesis",     "params": {...}, "inputs_from": "qualification.output" },
    { "mechanic": "decision",      "params": {...}, "inputs_from": "synthesis.output" }
  ]
}
```

**Le fourre-tout `ModuleAction` (30+ types).** `applyModuleActions.ts` dispatch un `type` string vers un handler impératif. C'est le symptôme d'une abstraction qui ne prend pas : chaque nouveau module ajoute des types, jamais on ne retire. Chaque mécanique devrait retourner un `MechanicOutput` typé propre, pas une union globale.

**Le PhaseModule interface.** Design correct mais mal câblé. `PhaseModule.onEnterPhase()`, `onMailSent()`, `onContractSigned()` — les événements sont couplés à *l'aspect* (mail, contract) plutôt qu'à l'expérience joueur. Refactor : `Mechanic.start(context) → observation stream → end()`.

### 3. Quels choix actuels sont excellents et doivent être conservés ?

**Le runtime pur** (`app/lib/runtime.ts`, `applyPhaseObservation`, `initializeSession`, `cloneSession`). Zéro React, zéro I/O, 100% testable. C'est le socle qui survit à toutes les refontes. Tel quel.

**La séparation IA observe / moteur décide** (`applyPhaseObservation`). C'est le pattern architectural correct pour toute mécanique — universel. Chaque mécanique aura son propre `Evaluator` qui produit une observation structurée, le moteur central applique les règles. Reproductible tel quel.

**Le vocabulaire déclaratif** (`severity: critical|required|bonus|minor` + `competencies[]` + `error_type`). Complètement réutilisable dans un modèle mécanique-orienté. Il vit sur les critères d'évaluation, pas sur les phases — donc il traverse le refactor sans problème.

**Les garde-fous automatiques** (`validate:scenarios` avec 10+ codes d'erreur, tests de couverture, deprecation gate). La culture est excellente et doit s'étendre : chaque mécanique aura son propre garde-fou de contrat d'entrée/sortie.

**Le pattern MODULE_REGISTRY auto-discoverable** (F4). L'idée est bonne : un fichier registry, une source de vérité, un test qui vérifie schema ↔ code ↔ tests. On peut appliquer le même pattern à `mechanics/*/manifest.ts` avec un `MECHANIC_REGISTRY` généré.

**Les capabilities (V-chantier)**. Le pattern `capability → pickBestMode → fallback` est extensible tel quel à webcam, VR, téléphone. À garder.

**`evaluation_history` avec snapshot des conditions** (VS-chantier). L'idée du « git blame » de l'évaluation est correcte et généralisable. Chaque exécution de mécanique devrait produire une trace équivalente.

**La discipline des tests**. 202 tests, 21 fichiers, 100% de couverture sur les fonctions pures. Cette culture doit être maintenue mécanique par mécanique.

### 4. Quels couplages risquent d'empêcher cette évolution ?

Cinq couplages structurels majeurs.

**Couplage #1 : le player connaît le contenu.**
`page.tsx` importe MailView, ContractOverlay, PresentationModeView, OnePagerEditor. Il branche `currentInteractionMode` avec un switch. Ajouter une mécanique aujourd'hui = ajouter un import + une branche dans le switch. **Le player devrait ne rien savoir**.

**Couplage #2 : le PlayerContext est un god-object.**
60+ fields. Chaque module consomme un sous-ensemble. Aucune isolation. Refactor cible : chaque mécanique reçoit un `MechanicContext` typé qui ne contient QUE ce dont elle a besoin. Le player n'expose pas le context au monde entier.

**Couplage #3 : `applyModuleActions` est un god-dispatcher.**
30+ types d'actions dans une union discriminée globale. Le fichier fait ~500 lignes. Chaque nouvelle mécanique ajoute des cas. Personne n'ose retirer. C'est un anti-pattern reconnu. Refactor cible : chaque mécanique retourne son propre `Output` typé, l'agrégateur applique déclarativement sur la session (par exemple via un `Applier<Output>` livré avec la mécanique).

**Couplage #4 : les composants UI vivent dans `play/components/`, pas dans les modules.**
MailView n'est pas dans handlers/modules/mail/. C'est un fichier séparé, importé par page.tsx. Impossible de livrer un module comme paquet autonome. Refactor cible : `mechanics/qualification/Component.tsx` — colocation.

**Couplage #5 : le JSON scenario est câblé aux composants actuels.**
`mail_config`, `presentation_config`, `voice_qa_config` sont des sections du scenario dont les noms reflètent l'implémentation actuelle. Migrer le composant signifie migrer le JSON, ce qui signifie une rupture de contrat pour tous les scenarios existants. Refactor cible : le JSON parle des *mécaniques* (qui sont stables sémantiquement), pas des *composants* (qui bougent).

### 5. Y a-t-il une couche d'abstraction importante manquante ?

**Oui, cinq couches manquent.**

**Couche 1 — `Mechanic` comme entité de premier ordre.**
Aujourd'hui `PhaseModule` est un objet avec des lifecycle hooks orientés *aspect* (mail_sent, contract_signed). Il faut une abstraction `Mechanic` qui définit :
- un contrat d'entrée typé (`InputSchema` / TypeScript)
- un contrat de sortie typé (`OutputSchema`)
- une UI React (`Component: FC<{context, onComplete}>`)
- un évaluateur (`Evaluator: state × actions → Observation`)
- une liste d'outils (`tools: Tool[]`)
- un manifeste versionné (`manifest: { id, version, requires: [] }`)

**Couche 2 — `MechanicRunner`.**
Le shell qui charge une mécanique, lui passe son contexte, la laisse tourner, récupère son output, l'applique au runtime. Aujourd'hui c'est éclaté entre page.tsx (dispatch) + PhaseOrchestrator (module resolve) + applyModuleActions (side effects). À unifier dans une seule couche mince.

**Couche 3 — `Tool`.**
Un outil métier réutilisable (kanban, mindmap, grille de découverte, éditeur de synthèse) qui peut être embarqué par plusieurs mécaniques. Aujourd'hui : *aucune abstraction, aucun code*. Il faudra tout créer.

Design cible :
```ts
export interface Tool<State> {
  id: string;
  Component: FC<{state: State; onChange: (s: State) => void}>;
  serialize: (s: State) => JSON;
  deserialize: (json: JSON) => State;
  evaluate?: (s: State) => Observation;  // outil optionnellement auto-évaluant
}
```

Un kanban est un `Tool<KanbanState>`. Une timeline est un `Tool<TimelineState>`. Une mécanique de planification embarque `[kanban, timeline, dependencies]`.

**Couche 4 — `MechanicOutput` typé.**
Chaque mécanique retourne un output propre. Négociation retourne `{ agreement: Deal | null, concessions: Concession[], relationship: Score }`. Qualification retourne `{ needs: Need[], budget: Budget | null, timeline: Date | null, decision_criteria: string[] }`. Le player consomme via un contrat, pas via un discriminated union global.

**Couche 5 — `ScenarioComposer`.**
Le lecteur du JSON scenario qui produit un `SequencePlan: MechanicInvocation[]` et l'exécute pas à pas. Aujourd'hui : `phases` sont lues linéairement par le player. À remplacer par une composition explicite qui peut inclure des branches, des boucles, des invocations conditionnelles.

### 6. La séparation actuelle Player / Runtime / Mechanics / Modules est-elle suffisante ?

**Player** : trop lourd. Devrait devenir un shell générique de ~500 lignes qui monte une session, boucle sur la séquence, gère les transitions et le persistence. Aujourd'hui : 5500 lignes.

**Runtime** : correct. À garder tel quel, ne dépend de rien d'UI. Petites extensions attendues pour supporter les contrats d'entrée/sortie des mécaniques.

**Mechanics** : **n'existent pas encore comme entité de premier ordre**. Aujourd'hui `mechanics/` n'existe pas comme dossier. On a `handlers/modules/` qui contient des choses proches conceptuellement mais qui ne sont pas de vraies mécaniques (elles n'ont ni UI, ni outils, ni contrats stricts). Il faut créer le dossier et migrer.

**Modules** : la conflation *PhaseModule = Mécanique* est le problème central. Un `PhaseModule` d'aujourd'hui = un handler pour un aspect scenario. Une `Mechanic` cible = une expérience joueur complète. Ce ne sont pas les mêmes choses. Il faut arrêter d'appeler « module » ce qui n'en est pas.

Ma proposition de nomenclature :
- **Player** = shell UI générique
- **Runtime** = fonctions pures d'état de session
- **Mechanic** = unit expérience joueur (avec UI + logic + tools + eval + tests + doc)
- **Tool** = brique UI+state réutilisable (kanban, mindmap...)
- **Scenario** = JSON décrivant la séquence de mécaniques et le contenu
- **Composer** = lecteur du scenario qui pilote le runner

Terminologiquement, il faut **retirer le mot « module »** ou en changer le sens. Aujourd'hui il désigne deux choses différentes (handler d'aspect vs mécanique).

### 7. Architecture cible proposée

Si je construisais Revealio aujourd'hui avec ta vision, voici la structure que j'adopterais :

```
app/
├─ lib/
│  ├─ runtime/                    # fonctions pures, aucune UI
│  │  ├─ session.ts
│  │  ├─ applyObservation.ts
│  │  └─ competencies.ts
│  ├─ engine/                     # API publique du moteur
│  │  ├─ index.ts
│  │  └─ Mechanic.ts              # interface Mechanic<I, O>
│  └─ scenario-composer/          # lecteur JSON + exécution séquence
│     ├─ compose.ts
│     └─ transitions.ts
│
├─ mechanics/                     # UNE mécanique = UN dossier autonome
│  ├─ qualification/
│  │  ├─ manifest.ts              # {id, version, tools, inputSchema, outputSchema}
│  │  ├─ Component.tsx            # UI joueur
│  │  ├─ Evaluator.ts             # actions joueur → observation
│  │  ├─ Runtime.ts               # logique pure (si nécessaire)
│  │  ├─ prompts/                 # prompts génériques, paramétrables par le scenario
│  │  ├─ tools/
│  │  │  ├─ grille-decouverte/
│  │  │  └─ checklist/
│  │  ├─ __tests__/
│  │  └─ docs/
│  │     ├─ QUAND_UTILISER.md
│  │     └─ EXEMPLES.md
│  ├─ synthesis/
│  ├─ decision/
│  ├─ production/                 # production de livrables écrits
│  ├─ negotiation/
│  ├─ presentation/
│  ├─ qa/
│  ├─ facilitation/
│  ├─ planning/
│  ├─ prioritization/
│  └─ coordination/
│
├─ tools/                         # outils partagés entre plusieurs mécaniques
│  ├─ kanban/
│  ├─ mindmap/
│  ├─ timeline/
│  ├─ dependencies-graph/
│  └─ highlighter/
│
├─ player/                        # shell UI générique
│  ├─ Shell.tsx                   # ~500 lignes max
│  ├─ MechanicRunner.tsx          # charge et exécute une mécanique
│  └─ TransitionOverlay.tsx
│
└─ admin/                         # inchangé, sauf pour intégrer les nouvelles mécaniques
```

Un scenario devient purement déclaratif :

```json
{
  "scenario_id": "vendre_solution_erp",
  "meta": { "title": "Vendre une solution ERP à Laurent", "difficulty": "senior" },
  "actors": [ { "actor_id": "laurent", "role": "DAF hésitant", "prompt_file": "..." } ],
  "documents": [ { "id": "sales_deck", "file_path": "..." } ],
  "competencies": ["negotiation", "relation_client", "communication"],
  "sequence": [
    {
      "step_id": "s1",
      "mechanic": "qualification",
      "params": {
        "target_actor": "laurent",
        "expected_signals": ["budget", "decision_process", "pain_points"]
      },
      "success_criteria": {
        "observed_criteria": [
          { "id": "identified_pain", "severity": "required", "competencies": ["analyse"] }
        ],
        "required_criteria": ["identified_pain"]
      }
    },
    {
      "step_id": "s2",
      "mechanic": "production",
      "params": {
        "livrable_type": "email",
        "template": "commercial_ajuste",
        "recipient": "laurent"
      },
      "inputs_from": "s1.output",
      "success_criteria": { ... }
    }
  ]
}
```

Le player devient un shell générique qui ne connaît **rien** du domaine :

```tsx
function Shell({scenarioId}) {
  const scenario = useScenario(scenarioId);
  const session = useSession(scenario);
  const currentStep = session.sequence[session.currentIndex];
  const Mechanic = registry[currentStep.mechanic];
  return (
    <MechanicRunner
      mechanic={Mechanic}
      context={buildContext(session, currentStep)}
      onComplete={(output) => applyOutputAndAdvance(session, output)}
    />
  );
}
```

C'est tout. 500 lignes maximum, aucune référence à mail/contract/voice.

---

## Challenge de la liste des mécaniques

Ta liste :
Qualification, Analyse/Synthèse, Décision, Production, Négociation, Présentation, Q&A, Facilitation, Planification, Priorisation, Coordination.

Mon audit :

**Ce qui manque, à mon sens :**

**Diagnostic / Investigation.** Différent de Qualification. Qualification = découvrir les besoins d'un client. Diagnostic = investiguer la cause d'un problème (bug technique, incident, dysfonctionnement organisationnel). Signaux différents, dynamique différente (hypothèses successives, élimination), outils différents (arbre des causes, 5 pourquoi, timeline forensique).

**Gestion de crise / d'incident.** Ce n'est pas juste une négociation sous pression. C'est une mécanique propre qui combine décision rapide en info incomplète, communication multi-parties, allocation de ressources d'urgence, priorisation dynamique. À isoler.

**Feedback / Debrief.** Donner du feedback structuré à quelqu'un (subordonné, pair, prestataire). C'est le symétrique de Q&A mais avec un joueur *émetteur* de retour, pas *récepteur*. Utile pour les scenarios management.

**Formation / Transmission.** Expliquer un concept, transmettre un savoir-faire. Ce n'est pas une présentation (qui vise à convaincre) ni Q&A (qui vise à évaluer). C'est une mécanique où le joueur enseigne.

**Modération / Régulation de conflit.** Différent de Facilitation (qui est neutre). Cas particulier utile pour management, syndical, family business.

**Ce qui est peut-être en trop, à mon sens :**

**Priorisation.** À mon avis, c'est un **cas particulier de Décision** avec un contrainte de rareté (temps, budget). Ou alors c'est un **outil** (matrice Eisenhower, MoSCoW) plutôt qu'une mécanique. Je la retirerais comme mécanique de premier ordre et j'en ferais un outil embarquable dans Décision, Planification, Coordination.

**Facilitation de travaux collectifs.** Trop vague. C'est en réalité une composition (Q&A + Décision + Coordination + parfois Négociation). Je découperais : la « facilitation » n'est pas une mécanique atomique, c'est un scenario type qui enchaîne d'autres mécaniques. À retirer de la liste des mécaniques primitives.

**Coordination.** Idem, très large. À découper en briques atomiques : synchronisation d'agendas, allocation de ressources, communication multi-parties, escalade. Certaines de ces briques sont des outils, d'autres sont des cas particuliers de Décision ou de Négociation. Coordination comme mécanique atomique unique n'a probablement pas de sens.

**Ma proposition de liste révisée :**

**Mécaniques primitives** (indépendantes, universelles) :
1. **Qualification** — découverte de besoin
2. **Diagnostic** — investigation de cause
3. **Analyse / Synthèse** — traitement documentaire
4. **Décision** — arbitrage entre alternatives (avec ou sans contrainte de rareté)
5. **Production** — livrable écrit ou multimédia
6. **Négociation** — construction d'accord
7. **Présentation** — communication d'une idée à un auditoire
8. **Q&A** — répondre aux questions d'un tiers
9. **Feedback** — émission de retour structuré
10. **Formation** — transmission de savoir
11. **Planification** — construction d'un plan d'action
12. **Gestion de crise** — décision rapide sous pression multi-parties

**Non-mécaniques** (à retirer et redistribuer) :
- Priorisation → outil de Décision
- Facilitation → scenario type, composition
- Coordination → à découper, plusieurs briques

---

## Chemin de migration réaliste

Ne réécris pas tout d'un coup. Voici l'ordre que je proposerais si tu valides la cible :

**Phase 1 — Prépare le socle (~2 sessions).**
- Créer `mechanics/` (dossier vide, structure)
- Définir les interfaces `Mechanic<I, O>`, `Tool<S>`, `MechanicOutput`
- Créer `MECHANIC_REGISTRY` avec garde-fou automatique
- Ne migrer aucun code encore. Juste poser les rails.

**Phase 2 — Migrer 1 mécanique en pilote (~1-2 sessions).**
- Choisir la plus simple : **Q&A** ou **Présentation solo**.
- La construire proprement dans `mechanics/qa/` avec son UI, son evaluator, ses tests, sa doc.
- Créer un scenario minimal qui l'utilise via la nouvelle séquence.
- Faire tourner en prod.
- Le player *shell* devient une version restreinte (n'accepte que cette mécanique).

**Phase 3 — Migrer une seconde mécanique + le tool associé (~1-2 sessions).**
- **Qualification** avec son outil « grille de découverte ». Prouve que le pattern *mécanique embarque outil* fonctionne.

**Phase 4 — Migrer Négociation en la libérant du couplage contrat (~2 sessions).**
- Le plus gros risque. Cette mécanique est aujourd'hui coincée dans les 3 branches S0/S2/S5 du ContractModule. Il faut la libérer + transformer les 3 contrats scenarios en contenu.

**Phase 5 — Migrer Production (livrable écrit) en libérant du MailModule (~2 sessions).**
- Idem pour le mail. Séparer la mécanique (envoyer un livrable écrit à quelqu'un) du contenu (branches KOL, DSI, etc.).

**Phase 6 — Bâtir les nouvelles mécaniques manquantes (~1 session par mécanique).**
- Diagnostic, Feedback, Formation, Analyse/Synthèse, Décision, Planification, Gestion de crise.

**Phase 7 — Retirer le legacy player, generaliser le shell (~2 sessions).**
- Une fois tous les scenarios existants migrés, retirer les composants scenario-specific du player et généraliser le shell.

**Durée totale estimée : 15-20 sessions.**

**Risques principaux :**
- Le refactor casse des scenarios en prod pendant la transition. Nécessité d'un mode double (ancien scenario JSON continue de tourner via l'ancien player, nouveau scenario JSON via le nouveau shell). Complexité pendant ~2 mois.
- Régression sur des cas limites qu'on découvrira uniquement en migrant (HARD_REJECT KOL, pivot Clinique, contract negotiation timing).
- Perte de vélocité sur les nouveaux scenarios pendant la transition (le nouveau système n'est utilisable qu'après phase 6).

---

## Ce que j'ai livré récemment qui va survivre au refactor, et ce qui ne survivra pas

**Survit tel quel :**
- Runtime + `applyPhaseObservation` (E-chantier)
- Vocabulaire severity + competencies + error_type (W + CF)
- Garde-fous automatiques et validate:scenarios
- Référentiel de compétences Z
- Versioning VS (le pattern, à généraliser aux mécaniques)
- Assistant AS (à recâbler sur les métriques par mécanique au lieu de phase)
- Vue admin replay (à généraliser)
- Capabilities V (parfait tel quel, extensible à video/VR)

**Ne survit pas tel quel, à refondre :**
- Le player (page.tsx) doit passer de 5500 à ~500 lignes
- MailModule, ContractModule, InterviewModule à découper en mécaniques + contenu
- PresentationModeView à séparer entre mécanique universelle et contenu S3
- ModuleAction fourre-tout à remplacer par MechanicOutput typé par mécanique
- Les configs JSON (mail_config, presentation_config, voice_qa_config) à remplacer par des `params` sous chaque `mechanic` invocation
- PlayerContext (60+ fields) à découper en MechanicContext typés

**Ne survit pas et à retirer :**
- La conflation « module = mécanique »
- Le champ `interaction_mode` sur les phases (remplacé par le choix de mécanique)
- Les branches spécifiques dans `/api/chat` (`prospection_evaluation`, `dsi_validation`) qui sont du contenu déguisé en logique — à devenir des params de mécanique

---

## Verdict final

**Est-ce que l'architecture actuelle permet d'atteindre la vision « moteur universel » sans réécriture majeure ?**

**Non.** Il faudra une réécriture significative du player et des « modules » actuels. Environ 15-20 sessions de travail. Ce n'est pas une catastrophe si tu le fais **maintenant**, avec 10 scenarios en prod. Ce sera un cauchemar si tu attends d'en avoir 50.

**Est-ce que la culture technique est prête ?**

**Oui.** La discipline des tests, des garde-fous, de la séparation IA/moteur, du vocabulaire déclaratif est excellente et se transpose directement au modèle mécanique. On ne réécrit pas la culture, on réécrit l'architecture. C'est plus facile.

**Est-ce que le pivot vaut le coup ?**

**Oui, sans hésitation.** Le modèle actuel scale linéairement avec le nombre de scenarios (chaque nouveau scenario = touche au player). Le modèle cible scale sublinéairement : les scenarios sont du JSON + contenu, les mécaniques sont finies (~15) et réutilisées.

**Recommandation opérationnelle :**

Ne fais pas de nouveau scenario majeur d'ici la fin du refactor. Chaque nouveau scenario dans le modèle actuel augmente la dette de migration. Concentre-toi sur la phase 1-3 du chemin de migration (~5 sessions), livre un premier scenario nouvelle génération pour prouver le modèle, puis migre les existants un par un.

Si le budget de refactor est indisponible, la version pragmatique : **arrête d'ajouter des sections au JSON scenario** qui pointent vers des composants (`mail_config`, `contract_config`...). Chaque nouveau scenario doit produire *au maximum* des critères d'évaluation, des prompts, du contenu. Les nouvelles mécaniques attendent que le refactor commence. C'est le minimum pour ne pas creuser la dette.
