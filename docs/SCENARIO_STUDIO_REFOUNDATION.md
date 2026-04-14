# Refondation du Scenario Studio — Proposition exploitable

> Objectif : transformer le studio d'un éditeur de champs en **atelier de création assisté par IA**, sans casser le moteur runtime existant.
> Principe non-négociable : l'IA **propose**, l'humain **valide**. Aucune écriture silencieuse.

---

## 1. Principes directeurs

1. **Runtime intouché** — `ScenarioDefinition` et le pipeline `compileScenario` restent la source de vérité. Tout ce qu'on ajoute est une *couche éditoriale* au-dessus.
2. **Études diff-first** — toute modification IA produit un *patch structuré* (JSON Patch / RFC 6902 subset) visualisable avant application.
3. **Bounded AI** — chaque appel IA reçoit uniquement le scénario courant (+ version éventuelle). Pas de fuite inter-scénarios.
4. **MVP d'abord** — on livre des briques indépendantes fonctionnelles, pas une réécriture big-bang.
5. **Humain toujours dans la boucle** — chaque suggestion IA = carte avec `Appliquer` / `Ignorer` / `Modifier`.

---

## 2. Architecture cible (vue d'ensemble)

```
app/
├── admin/page.tsx                    (existe — studio UI)
├── api/studio/
│   ├── route.ts                      (existe — list/create)
│   ├── [studioId]/
│   │   ├── route.ts                  (existe — CRUD)
│   │   ├── validate/route.ts         (existe — validation structurelle)
│   │   ├── compile/route.ts          (existe — build)
│   │   ├── upload/route.ts           (existe — assets)
│   │   ├── ai-review/route.ts        ★ NOUVEAU — revue IA (erreurs / warnings / pistes)
│   │   ├── ai-patch/route.ts         ★ NOUVEAU — actions "corriger / améliorer / durcir / fluidifier"
│   │   ├── actor-generate/route.ts   ★ NOUVEAU — transforme briefing narratif → prompt + règles
│   │   ├── assistant/route.ts        ★ NOUVEAU — copilote intégré (3 modes)
│   │   └── import-extract/route.ts   ★ NOUVEAU — drag-and-drop → extraction structurée
│   └── job-families/route.ts         ★ NOUVEAU — CRUD référentiel familles de métiers
├── lib/
│   ├── studioCompiler.ts             (existe)
│   ├── studioAI.ts                   ★ NOUVEAU — client OpenAI + schémas Zod partagés
│   ├── aiPatch.ts                    ★ NOUVEAU — apply/preview JSON Patch sur StudioScenario
│   └── jobFamilies.ts                ★ NOUVEAU — persistance referential
data/
├── studio/<id>/studio.json           (existe)
├── studio/<id>/ai-reviews.json       ★ NOUVEAU — historique des revues IA
├── studio/<id>/assistant.json        ★ NOUVEAU — historique copilote
└── job-families.json                 ★ NOUVEAU — taxonomie
```

---

## 3. Modèle de données additif (sans casser l'existant)

### 3.1 `StudioScenario` — champs ajoutés (tous optionnels, donc retro-compatibles)

```ts
interface StudioScenario {
  // ... tous les champs existants inchangés
  jobFamilies?: string[];        // NEW — remplace progressivement `jobFamily`
  isTeaserVisible?: boolean;     // NEW — pour la Part 4 (brouillon visible aux joueurs)
  teaserBanner?: string;         // NEW — message custom "Bientôt disponible"
  aiReviewId?: string;           // NEW — pointe sur la dernière revue
  actorBriefings?: Record<string, ActorBriefing>; // NEW — inputs narratifs par actor.id
}

interface ActorBriefing {
  role: string;
  personalityTraits: string[];
  backstory: string;
  motivations: string[];
  fears: string[];
  biases: string[];
  relationToPlayer: string;
  personalGoals: string[];
  openness: number;       // 0=rigide, 1=ouvert
  tension: number;        // 0=détendu, 1=tendu
  rigidity: number;
  speechElements: string; // tics, vocabulaire, ton
  generatedAt?: string;
  generatedPrompt?: string;
}
```

### 3.2 `AIReview` (nouvelle entité, stockée dans `ai-reviews.json`)

```ts
interface AIReview {
  id: string;
  scenarioId: string;
  versionHash: string; // sha1 du studio.json au moment de la revue
  createdAt: string;
  blockingErrors: ReviewItem[];
  warnings: ReviewItem[];
  suggestions: ReviewItem[];
}

interface ReviewItem {
  id: string;
  path: string;            // ex: "phases[2].transitions[0]"
  title: string;           // "Transition vague de phase 2 → 3"
  description: string;     // explication
  severity: "blocker" | "warning" | "suggestion";
  proposedPatch?: JSONPatchOp[]; // optionnel — action "Appliquer"
  rationale?: string;
}
```

### 3.3 `JobFamily`

```ts
interface JobFamily {
  id: string;
  label: string;
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Découpage en 3 phases (aligné sur votre directive)

### Phase 1 — **Fondations** (MVP, livrable rapidement)
| # | Chantier | Fichiers clés |
|---|---|---|
| 1.1 | Endpoint `ai-review` + carte UI dans studio | `ai-review/route.ts`, `studioAI.ts`, `page.tsx` (section "Revue IA") |
| 1.2 | Actions de correction/amélioration (boutons) | `ai-patch/route.ts` + diff viewer UI |
| 1.3 | Référentiel `JobFamily` (CRUD + intégration) | `job-families/route.ts`, `jobFamilies.ts`, `page.tsx` (section admin) |
| 1.4 | Générateur de prompt d'acteur depuis briefing narratif | `actor-generate/route.ts` + `ActorBriefing` form |

### Phase 2 — **UX produit fort**
| # | Chantier | Fichiers clés |
|---|---|---|
| 2.1 | Teaser scénarios brouillons (bannière "Bientôt") | `isTeaserVisible` + page listing joueur |
| 2.2 | Copilote Studio intégré (texte) | `assistant/route.ts` + panneau bas UI |

### Phase 3 — **Accélération créative**
| # | Chantier | Fichiers clés |
|---|---|---|
| 3.1 | Drag-and-drop intelligent | `import-extract/route.ts` + modale de review |
| 3.2 | Dictée vocale dans copilote | réutilise `voiceCapture.ts` + `/api/transcribe` |
| 3.3 | Enrichissements avancés (actions "durcir", "fluidifier", "renforcer réalisme") | extension de `ai-patch` |

---

## 5. Endpoints détaillés (contrats)

### `POST /api/studio/[studioId]/ai-review`
Entrée : `{}` (le scénario est lu sur disque)
Sortie :
```json
{
  "review": { "id": "...", "blockingErrors": [...], "warnings": [...], "suggestions": [...] }
}
```
Logique : lit `studio.json` → prompt OpenAI gpt-4.1-mini avec JSON schema strict → persiste → renvoie.

### `POST /api/studio/[studioId]/ai-patch`
Entrée :
```json
{ "action": "fix-inconsistency" | "improve" | "harden" | "smooth" | "realism", "targetPath?": "phases[2]" }
```
Sortie :
```json
{ "patch": [ { "op": "replace", "path": "...", "value": "..." } ], "rationale": "..." }
```
**Important** : le backend *n'applique pas* le patch. Il renvoie la proposition, l'UI prévisualise le diff, l'utilisateur clique `Appliquer` qui appelle le PUT existant `/api/studio/[studioId]`.

### `POST /api/studio/[studioId]/actor-generate`
Entrée : `{ actorId: string, briefing: ActorBriefing }`
Sortie : `{ prompt: string, behaviorRules: string[], limits: string[], style: string }`
L'UI injecte ensuite dans `actor.systemPrompt` (avec `Regénérer` / `Éditer`).

### `POST /api/studio/[studioId]/assistant`
Entrée : `{ mode: "free" | "fill" | "patch", message: string, sectionPath?: string, history?: AssistantMessage[] }`
Sortie :
- mode `free` : `{ answer: string }`
- mode `fill` : `{ fields: Record<string, unknown> }`
- mode `patch` : `{ patch: JSONPatchOp[], rationale: string }`

### `POST /api/studio/[studioId]/import-extract`
Entrée : `multipart/form-data` (file) — types acceptés : `txt`, `md`, `docx`, `pdf`, `png`, `jpg`
Sortie :
```json
{
  "confident": { "title": "...", "phases": [...] },
  "uncertain": { "difficulty": { "value": "senior", "confidence": 0.5 } },
  "missing": ["endings", "defaultEndingId"],
  "conflicts": []
}
```

### `GET/POST/PATCH/DELETE /api/studio/job-families`
CRUD standard sur `data/job-families.json`.

---

## 6. UI — emplacements dans `app/admin/page.tsx`

1. **Bandeau "Revue IA"** au-dessus du formulaire d'édition : badge nombre d'erreurs/warnings/suggestions, bouton `Lancer une revue`.
2. **Barre d'actions IA** dans chaque section : 5 boutons (`Corriger`, `Améliorer`, `Durcir`, `Fluidifier`, `+Réalisme`) qui appellent `ai-patch` avec `targetPath`.
3. **Sélecteur multi-familles** (Phase 1.3) — remplace le champ texte `jobFamily`.
4. **Onglet par acteur** : formulaire `ActorBriefing` + bouton `Générer le comportement IA` → affiche prompt généré en lecture seule + bouton `Injecter dans l'acteur`.
5. **Panneau copilote** fixé en bas de page (Phase 2.2), toggleable.
6. **Zone drag-and-drop** (Phase 3.1) en haut du studio.
7. **Bandeau joueur côté listing** : si `isTeaserVisible && status=="draft"` → carte non cliquable avec message.

---

## 7. IA — modèles et prompts

- **Modèle principal** : `gpt-4.1-mini` (rapide, bon suivi d'instructions, `response_format: json_schema`).
- **Schémas Zod partagés** dans `app/lib/studioAI.ts` pour garantir la forme des sorties.
- **Bornage systématique** : chaque prompt commence par `"Tu es assistant du studio de scénarios pédagogiques. Ton périmètre EST STRICTEMENT le scénario fourni. N'invente pas de scénarios externes."`
- **Température** : 0.3 pour validation, 0.7 pour créatif (assistant, actor-generate).

---

## 8. Ce qui arrive maintenant

Dans la foulée de ce document, je pose la **première brique** : `POST /api/studio/[studioId]/ai-review` + module partagé `studioAI.ts`. Le reste sera livré par incréments indépendants, chacun testable seul.
