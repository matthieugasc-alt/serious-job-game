# Gestionnaire Documentaire Universel — contrat d'architecture

**Date** : 4 juillet 2026 · **Modèle architectural** : docs/TOOL_BLOC_NOTES.md (mêmes règles, même pattern `tool_op`/reducer pur/API publique/garde-fous). Couche Tools, indépendant, universel. Les mécaniques peuvent uniquement l'activer/le configurer ; zéro logique documentaire hors du module.

## 1. Organisation des fichiers

```
app/workspace/tools/bibliotheque/
├─ spec.ts               # PUR : types, initialState, describeForObservation, applyOp
├─ model.ts              # PUR : applyLibraryOp(state, op, payload)
├─ api.ts                # PUR : constructeurs d'ops + sélecteurs (dont recherche)
├─ BibliothequeApp.tsx   # le bureau documentaire (remplace le contenu de l'app documents)
├─ ArchiveButton.tsx     # « Ajouter au dossier documentaire » — EXPORTÉ vers Messages/Mail
├─ components/           # DocWindow, ReaderAugmente, CompareView, FolderTree, SearchBar…
└─ __tests__/
```

L'app `documents` du dock devient l'HÔTE du Tool (coquille qui monte `BibliothequeApp`) — le joueur ne voit qu'une seule app « Documents ». Garde-fous identiques au bloc-notes : couche pure sans React ni moteur, jamais importé par mécaniques/scénarios/page.tsx, `bibliotheque` interdit dans `exits.reset.tools` (le dossier n'est jamais réinitialisé).

## 2. Principe fondamental : l'entrée en bibliothèque est un CHOIX

Les documents du scénario (`DocumentDef` : PDF, data packs, contrats reçus) sont **automatiquement** des entrées de bibliothèque (indexés à l'entrée du step qui les expose). Mails et messages Teams n'y entrent **que** par le geste explicite « Ajouter au dossier documentaire » (`ArchiveButton` hébergé par Mail et Messages, même pattern que `AnnotateButton`). Aucune ingestion automatique — zéro bruit documentaire.

## 3. Modèle de données (`toolStates["bibliotheque"]`, sérialisable)

```ts
interface LibraryState {
  entries: Record<EntryId, DocEntry>;
  folders: Record<FolderId, { id; name; order: number }>;
  desk: DeskState;                         // fenêtrage courant
}
interface DocEntry {
  id: EntryId; title: string;
  source:                                   // qu'est-ce que ce document ?
    | { kind: "scenario_doc"; document_id: string }          // contenu vit dans scenario.documents
    | { kind: "archived_mail"; mail_id: string; snapshot: { from; to; subject; body; at } }
    | { kind: "archived_messages"; thread_id: string; snapshot: { title; messages: {from; at; content}[] } };
  folder_id?: FolderId; tags: string[];
  pinned: boolean; favorite: boolean;
  added_at: number; last_opened_at?: number;
  annotations: Annotation[];               // liées AU document, pour toujours
  bookmarks: { id; label; anchor: string }[];
  links: { entry_id: EntryId; label?: string }[];   // liens navigables doc↔doc
}
type Annotation =
  | { id; kind: "highlight"; anchor: string; excerpt: string; color?: string; at: number }
  | { id; kind: "comment"; anchor?: string; excerpt?: string; text: string; at: number };
interface DeskState {
  windows: { entry_id: EntryId; order: number }[];  // fenêtres ouvertes
  layout: "single" | "split-v" | "split-h" | "grid";
  compare?: [EntryId, EntryId];                     // lecture parallèle
  // V2 vue Bureau : positions?: Record<EntryId, {x; y; pile_id?}> — champ réservé
}
```

`anchor` = offset texte sérialisable (début/fin dans le contenu markdown) — indépendant du rendu, robuste au re-render.

## 4. API publique (`api.ts`)

Ops (constructeurs typés → `tool_op`, journalisation fine) : `indexScenarioDoc`, `archiveMail(mail)`, `archiveThread(thread, messageIds?)`, `removeEntry`, `openEntry`/`closeEntry` (fenêtrage + `last_opened_at`), `setLayout`, `setCompare`, `moveToFolder`, `createFolder`/`renameFolder`/`deleteFolder`, `addTag`/`removeTag`, `togglePin`, `toggleFavorite`, `addHighlight`, `addComment`, `addBookmark`, `removeAnnotation`, `linkEntries`/`unlinkEntries`, `reorderWindows`.
Sélecteurs purs : `searchEntries(state, query, resolveContent)` (plein texte : titre, contenu, tags, annotations, auteur, type, source — le contenu des `scenario_doc` est résolu via un callback pur `(document_id) → string` fourni par l'hôte, le Tool ne connaît pas le scénario), `selectByFolder`, `selectByTag`, `selectSorted(by: added|opened|alpha|favorites|type|tags)`, `selectRecent`, `selectPinned`, `selectLinks`.
Extraction vers le Bloc-notes : le lecteur dispatch l'op `annotate` du bloc-notes **via son API publique** (`tools/bloc-notes/api.ts`) avec `SourceRef {kind:"document"}` — couplage Tool→Tool exclusivement par façades publiques, jamais par les états internes.

## 5. UX V1

**Bibliothèque** : liste/grille avec dossiers (arbre latéral, drag-and-drop), tags, épingles, favoris, tris, recherche instantanée (sélecteur pur, pas d'I/O), historique (récemment ouverts/ajoutés). **Bureau multi-fenêtres** : plusieurs documents ouverts, layouts single/split/grid, réorganisation par drag, bascule rapide (onglets), plein écran par fenêtre. **Lecteur augmenté** : rendu markdown/PDF existant + surlignage sur sélection (couleurs), commentaires ancrés, signets, bouton « → Bloc-notes » sur sélection (extraction sans interruption, pattern AnnotateButton), badge des annotations. **Comparaison** : deux entrées côte à côte, scroll indépendant, quel que soit le type (PDF↔mail archivé, contrat↔compte-rendu…). **Archivage** : `ArchiveButton` dans Mail (sur le mail ouvert) et Messages (sur le fil / une sélection de messages) — snapshot horodaté complet, popover de confirmation avec dossier/tags optionnels, l'app hôte reste affichée.

## 6. V2 prévue

Vue Bureau spatiale (positions libres, piles, groupes — champ `positions` réservé dans DeskState), dessin libre sur document, annotations sur PDF binaires (V1 : annotations sur contenus texte/markdown ; les PDF fichiers gardent surlignage désactivé avec mention), suggestions IA de classement (même règle que le bloc-notes : organisation, jamais résolution).

## 7. Justification

Réutilise intégralement le pattern validé du bloc-notes (tool_op, reducer pur, façade, garde-fous CI) — le deuxième Tool prouve que le moule scale. Le choix « l'entrée en bibliothèque est un geste » est porté par le modèle (`source.kind`) et non par une règle d'UI, donc auditable et observable. Les annotations vivent dans l'état du Tool, pas dans `workspace.documents` (qui reste le simple suivi moteur ouvert/annoté) : le document du scénario reste immuable, le travail du joueur est la couche par-dessus — exactement la métaphore du dossier professionnel.
