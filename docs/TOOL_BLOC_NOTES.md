# Bloc-notes Universel — contrat d'architecture (référence pour tous les futurs Tools)

**Date** : 4 juillet 2026 · **Statut** : contrat de référence, brief PO intégral en source
**Place** : couche Tools. Indépendant, universel, réutilisable. Ne connaît NI le scénario, NI les mécaniques, NI le moteur. Le Workspace l'affiche ; les mécaniques l'activent ; lui-même n'importe rien d'eux.

## 1. Organisation des fichiers

```
app/workspace/tools/bloc-notes/
├─ spec.ts             # PUR (node-safe) : types, initialState, describeForObservation
├─ model.ts            # PUR : le reducer du carnet — applyNotebookOp(state, op) → state
├─ api.ts              # PUR : API publique (constructeurs d'ops typés) — LA façade
├─ BlocNotesApp.tsx    # application complète (vues notes / tags / kanban / base)
├─ QuickPanel.tsx      # vue rapide (panneau latéral, monté par le shell comme ChatDock)
├─ AnnotateButton.tsx  # bouton+popover d'annotation, EXPORTÉ vers les apps hôtes
├─ components/         # BlockEditor, TaskCard, vues — internes au module
└─ __tests__/          # tests purs de model.ts/api.ts + garde-fous
```

Garde-fous automatiques (mêmes règles que le shell) : `spec.ts`/`model.ts`/`api.ts` sans React ni import moteur autre que les types `Json` ; aucun import de `app/mechanics`, `scenarios`, `sessionV3` ; le module n'apparaît jamais dans `page.tsx` ni dans une spec de mécanique. Interdiction validée : `bloc-notes` ne peut PAS figurer dans un `exits.reset.tools` (le carnet n'est jamais réinitialisé par une phase).

## 2. Extension moteur générique : `tool_op` (pour TOUS les futurs Tools)

`tool_state_changed` (état entier) rend la journalisation illisible. Extension additive de l'union `WorkspaceAction` :

```ts
{ type: "tool_op"; tool_id: string; op: string; payload: JsonObject }
```

Le moteur journalise l'op (audit fin : « note_created », « task_moved », « annotation_added »…) puis délègue au reducer PUR que le Tool enregistre dans le TOOL_REGISTRY (`applyOp(state, op, payload) → state`). Le moteur n'a AUCUNE connaissance des ops — il applique une fonction enregistrée, comme pour `describeForObservation`. C'est le mécanisme standard des futurs Tools (Agenda, CRM, Matrice…). `tool_state_changed` reste pour les tools simples existants.

## 3. Modèle de données (state sérialisable, dans `toolStates["bloc-notes"]`)

```ts
interface NotebookState {
  notes: Record<NoteId, Note>;
  tasks: Record<TaskId, Task>;
  tagIndex: Record<string, NoteId[]>;      // dérivé maintenu par le reducer
  order: NoteId[];                          // ordre manuel des notes
}
interface Note {
  id: NoteId; title: string;
  blocks: Block[];                          // hiérarchie : children imbriqués
  tags: string[];
  source?: SourceRef;                       // note née d'une annotation
  created_at: number; updated_at: number;
}
type Block =
  | { id; kind: "paragraph" | "heading1" | "heading2" | "separator"; text: string;
      marks?: { bold?: boolean; italic?: boolean; highlight?: string }; children?: Block[] }
  | { id; kind: "bullet" | "numbered"; text: string; marks?; children?: Block[] }
  | { id; kind: "todo"; text: string; checked: boolean; children?: Block[] }
  | { id; kind: "quote"; text: string };    // extrait copié par une annotation
interface Task {
  id: TaskId; title: string; description?: string;
  status: "todo" | "doing" | "done"; priority?: "low" | "normal" | "high";
  due?: string; tags: string[]; source?: SourceRef; note_id?: NoteId;
  created_at: number; updated_at: number;
}
type SourceRef =                             // lien vers l'origine, navigable
  | { kind: "message"; thread_id: string; actor_id?: string; at: number; excerpt: string }
  | { kind: "mail"; mail_id: string; subject: string; from: string; at: number; excerpt: string }
  | { kind: "document"; document_id: string; excerpt: string };
```

## 4. API publique (`api.ts`) — la seule porte d'entrée

Constructeurs d'ops typés, consommés par l'UI du module ET par les apps hôtes (annotation) — jamais de mutation directe :
`createNote(title?)`, `updateBlocks(noteId, blocks)`, `renameNote`, `deleteNote`, `addTag(noteId, tag)`, `removeTag`, `toggleTodo(noteId, blockId)`, `annotate({source, excerpt, comment})` → crée une note (quote + commentaire + source + heure), `createTask(partial)`, `updateTask`, `moveTask(taskId, status)`, `taskFromSelection(noteId?, source?, text)`, `reorderNotes`. Chaque appel = un `tool_op` journalisé.
Lecture : sélecteurs purs `selectRecent`, `selectByTag`, `selectChronological`, `selectTasksByStatus`, `selectAll` — utilisés par l'app, le quick panel ET (plus tard) replay/débrief/mécaniques via `describeForObservation`.

## 5. UX — deux modes, zéro interruption

**App complète** (icône du dock) : liste des notes à gauche (récentes / par tag / chrono), éditeur de blocs au centre (frappe fluide : Entrée = nouveau bloc, Tab/Shift-Tab = hiérarchie, `-` = bullet, `1.` = numérotée, `[]` = todo, `#`/`##` = titres, drag-and-drop de blocs), onglets Kanban et Base de données (tableau filtrable/triable : titre, type, tags, statut, date, source→lien).
**Quick panel** : monté par le WorkspaceShell (pattern ChatDock), ouvrable partout (icône fixe + raccourci), panneau latéral étroit : note rapide immédiate, récentes, recherche par tag, chrono. L'app active reste visible et interactive.
**Annotations** : `AnnotateButton` exporté, hébergé par Messages (icône sur chaque message), Documents (sur sélection de texte), Mail (sur le mail/la sélection). Popover local : champ commentaire, valider, disparu — l'hôte ne se re-render pas, la conversation/lecture continue. En arrière-plan : `annotate()` avec la SourceRef complète (auteur/heure/canal, objet/expéditeur, document/extrait).

## 6. V2 prévue (architecture prête, non implémentée)

Agent IA d'ORGANISATION uniquement (jamais de résolution) : interface `organizeNotes(state, intent) → NotebookOp[]` derrière une route dédiée `/api/v2/notebook-assist` ; les ops retournées passent par la même API publique (journalisées, refusables). Intents : classer, tagger, checklist-iser, synthétiser, plan, mind map, tâches, doublons, retrouver. Garde-fou : la route ne reçoit QUE le NotebookState — jamais le scénario, les critères ou les prompts d'acteurs. Également V2 : mind map/schémas/dessin (vues supplémentaires sur les mêmes notes — les notes restent la source de vérité), liens note↔note.

## 7. Justification des choix

Le reducer pur enregistré (`tool_op`) donne la journalisation fine exigée sans mettre une ligne de logique bloc-notes dans le moteur — le moteur applique une fonction opaque, pattern réplicable à tous les Tools. L'état dans la session donne gratuitement persistance, deep-save, replay et observation. L'API publique en façade rend le Tool consommable par les apps hôtes et les futurs usages (débrief, mécaniques) sans couplage. Les annotations vivent dans les apps hôtes comme simple bouton importé : les apps ne connaissent pas le carnet, le carnet ne connaît pas les apps.
