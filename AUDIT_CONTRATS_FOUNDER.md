# Audit UX — Contrats & Signatures Founder

## Standard UX de référence (6 points)

1. Document lisible (articles structurés, pas de blob HTML)
2. Commentaire / demande de modification possible
3. Amendements dynamiques (texte barré ancien + surligné nouveau)
4. IA répond dans le contexte du contrat (pas dans le chat principal)
5. Négociation multi-tours possible
6. Signature uniquement après négociation possible

## Interdictions

- Pas de commentaires dans le chat principal
- Pas de document non-modifiable
- Pas de signature directe sans négociation
- Pas de remplacement invisible de clauses
- Pas d'IA qui accepte tout automatiquement
- Pas de changements non visibles

---

## 1. Contrat Clinique S3 — Convention de test pilote (RÉFÉRENCE ✅)

**Lignes** : 4380–4685 + handler 2645–2721

**Architecture** :
- Left panel : articles structurés (`clinicalContractArticles` array), chaque article a `{ id, title, content, modifiedContent, toxic, moderate }`
- Right panel : thread de négociation (`clinicalNegThread`) avec le juriste de l'établissement
- Footer : signature + refus possible

**Mécanisme d'amendement** :
- Le joueur écrit dans le thread → API /api/chat avec prompt contextuel contenant le contrat complet
- L'IA peut refuser ou accepter. Si acceptation, elle ajoute un bloc `[MODIFICATION article_X]...[/MODIFICATION]`
- Le front parse le tag, met à jour `clinicalContractArticles[x].modifiedContent`
- Le rendu montre : texte barré gris + nouveau texte vert avec barre latérale

**Conformité UX** :

| Critère | Status |
|---------|--------|
| 1. Document lisible | ✅ Articles structurés |
| 2. Commentaires possibles | ✅ Thread dédié |
| 3. Amendements dynamiques | ✅ Strikethrough + highlight vert |
| 4. IA dans contexte contrat | ✅ Thread séparé du chat |
| 5. Multi-tours | ✅ Illimité |
| 6. Signature post-négociation | ✅ Toujours accessible |

**Verdict** : C'est le gold standard. Les 2 autres contrats doivent s'aligner sur ce modèle.

---

## 2. Pacte d'associés S0 (ÉCARTS CRITIQUES ❌)

**Lignes** : 3200–3702 + handler 2541–2602

**Architecture actuelle** :
- Document en HTML inline (15 articles hardcodés dans le JSX)
- `contentEditable` pour édition libre quand non signé
- Thread de négociation (`pacteThread`) en bas de l'overlay
- Handler `sendPacteNegotiationMessage` envoie au CTO

**Problèmes identifiés** :

| Critère | Status | Détail |
|---------|--------|--------|
| 1. Document lisible | ⚠️ | Lisible mais non structuré en données — HTML hardcodé |
| 2. Commentaires possibles | ✅ | Thread pacteThread existe |
| 3. Amendements dynamiques | ❌ **CRITIQUE** | Aucun. Le joueur peut éditer en `contentEditable` libre. L'IA répond dans le thread mais ne modifie JAMAIS le document visuellement. Aucun strikethrough, aucun highlight. |
| 4. IA dans contexte contrat | ⚠️ | IA répond dans le thread (OK), mais sans accès au contrat actuel — pas de `contractSummary` injecté dans le prompt |
| 5. Multi-tours | ✅ | Possible |
| 6. Signature post-négociation | ✅ | Bouton toujours accessible |

**Écarts critiques** :
1. **Pas de structure de données articles** : Le pacte est du HTML pur dans le JSX. Pas d'array `[{ id, title, content, modifiedContent }]` comme S3.
2. **`contentEditable` au lieu d'amendements structurés** : Le joueur peut modifier n'importe quoi librement. Aucun suivi des changements. L'IA ne sait même pas ce qui a été modifié.
3. **L'IA ne modifie pas le contrat** : Contrairement à S3 où l'IA envoie `[MODIFICATION article_X]`, ici l'IA répond juste en texte libre dans le thread. Le contrat reste identique visuellement.
4. **Le prompt IA n'a pas le contrat** : Le handler `sendPacteNegotiationMessage` (l.2568) n'injecte pas le contenu actuel du pacte dans le prompt. L'IA répond à l'aveugle.
5. **Détection d'exclusivité par regex uniquement** : La mécanique pédagogique (Article 6 trap) repose sur un regex côté front (`mentionsExclusivity`). C'est fragile et orthogonal à l'UX contrat.

**Corrections requises** :
- Créer un array `pacteArticles` structuré (comme `clinicalContractArticles`)
- Remplacer `contentEditable` par un rendu article-par-article avec `modifiedContent`
- Ajouter `[MODIFICATION article_X]` dans le prompt IA du CTO
- Injecter le `contractSummary` dans le prompt (comme S3)
- Conserver la détection regex d'exclusivité EN PLUS (mécanique pédagogique S0)

---

## 3. Contrat NovaDev S2 — Prestation développement (ÉCARTS CRITIQUES ❌)

**Lignes** : 3705–3873

**Architecture actuelle** :
- Document en HTML inline (`dangerouslySetInnerHTML` d'un template string)
- Document **read-only** — aucune interaction possible
- **Aucun** thread de négociation
- **Aucun** input de commentaire
- Signature directe : bouton "Signer et lancer le MVP" toujours disponible, aucun gate

**Problèmes identifiés** :

| Critère | Status | Détail |
|---------|--------|--------|
| 1. Document lisible | ✅ | Articles HTML structurés visuellement |
| 2. Commentaires possibles | ❌ **CRITIQUE** | Aucun. Pas d'input, pas de thread. |
| 3. Amendements dynamiques | ❌ **CRITIQUE** | Aucun. Document figé. |
| 4. IA dans contexte contrat | ❌ **CRITIQUE** | Aucune interaction IA sur le contrat. |
| 5. Multi-tours | ❌ **CRITIQUE** | Zéro tour. |
| 6. Signature post-négociation | ❌ **CRITIQUE** | Signature directe sans gate. |

**Verdict** : C'est le pire des 3 vrais contrats. 5 critères sur 6 non remplis. C'est une page read-only avec un bouton signer.

**Corrections requises** :
- Créer un array d'articles structurés (`novadevContractArticles`)
- Ajouter un split view (contrat gauche, chat droite) comme S3/S4
- Ajouter un thread de négociation avec Thomas Vidal
- Implémenter le mécanisme `[MODIFICATION article_X]` dans le prompt
- Gater la signature (minimum N messages ou canSign logic)

---

## 4. Devis NovaDev S4 — Passage en V1 (CONFORMITÉ PARTIELLE ⚠️)

**Lignes** : 3876–4377 + handler inline

**Architecture actuelle** :
- Split view : feature table (gauche) + chat Thomas (droite)
- Thread de négociation (`devisNegoMessages`) complet
- Deal terms dynamiques (`[TERMS: int=X cap=Xk dur=X bsa=X]`)
- Signature gatée (`canSign = devisNegoMessages.length >= 2`)

**Conformité** :

| Critère | Status | Détail |
|---------|--------|--------|
| 1. Document lisible | ✅ | Feature table claire avec prix |
| 2. Commentaires possibles | ✅ | Chat thread |
| 3. Amendements dynamiques | ⚠️ | Les "conditions négociées" se mettent à jour en live (intéressement, BSA, remise), mais le CORPS du devis (features, prix unitaires) ne change jamais visuellement avec strikethrough. |
| 4. IA dans contexte contrat | ✅ | Thread séparé du chat principal |
| 5. Multi-tours | ✅ | Illimité |
| 6. Signature post-négociation | ✅ | Gatée par canSign |

**Verdict** : Presque conforme. Le seul écart est l'absence de visualisation strikethrough/highlight sur les conditions qui changent. Les deal terms se mettent à jour dans un encart bleu, mais sans montrer l'ancien vs le nouveau.

**Corrections mineures** :
- Quand `dealTerms` change suite à une réponse IA, afficher l'ancienne valeur barrée + la nouvelle surlignée dans la section "Conditions négociées"
- Ce n'est PAS critique car la mécanique est fonctionnellement correcte (le devis n'est pas un contrat clause-par-clause, c'est un devis avec des termes dynamiques)

---

## 5. One-Pager S1 — Éditeur de document (NON APPLICABLE ✅)

**Lignes** : 4688–4970

**Nature** : Ce n'est PAS un contrat. C'est un éditeur de document (template à remplir puis soumettre au jury). Le standard UX contrat ne s'applique pas.

**Architecture** : `contentEditable` template avec placeholders `[...]`. Le joueur remplit les sections et soumet. Aucune négociation. C'est correct pour ce use-case.

---

## 6. Scénario 5 — Bon de commande

**Recherche** : Aucun overlay de signature/contrat trouvé dans `page.tsx` pour le scénario 5. Pas de `showBon`, `founder_05`, ni `Scenario 5` dans le code de l'overlay.

**Statut** : Non implémenté. Si un contrat S5 doit exister, il faudra le créer from scratch sur le modèle S3.

---

## Synthèse des corrections

| Overlay | Priorité | Travail estimé | Type |
|---------|----------|----------------|------|
| **Pacte S0** | P0 — Critique | Refonte majeure | Restructurer en articles + ajouter [MODIFICATION] dans prompt IA |
| **Contrat NovaDev S2** | P0 — Critique | Refonte complète | Ajouter thread négo + articles structurés + gate signature |
| **Devis S4** | P2 — Mineur | Polish | Ajouter visualisation ancien/nouveau sur les deal terms |
| **Contrat Clinique S3** | — | Rien | Référence, déjà conforme |
| **One-Pager S1** | — | Rien | Pas un contrat |
| **Bon de commande S5** | À confirmer | Création si nécessaire | Pas d'overlay existant |

## Plan d'exécution

### Étape 1 : Refonte Pacte S0
1. Créer `pacteArticles` state (array structuré, 15 articles)
2. Remplacer le rendu HTML hardcodé par un `.map()` sur `pacteArticles` avec `modifiedContent`
3. Supprimer `contentEditable` sur le document
4. Modifier `sendPacteNegotiationMessage` : injecter `contractSummary` + instructions `[MODIFICATION]`
5. Parser `[MODIFICATION article_X]` dans la réponse IA et mettre à jour `pacteArticles`
6. Conserver la détection regex exclusivité en parallèle

### Étape 2 : Refonte Contrat NovaDev S2
1. Créer `novadevContractArticles` state (8 articles extraits du template actuel)
2. Remplacer `dangerouslySetInnerHTML` par un rendu article-par-article
3. Ajouter split view avec thread de négociation (comme S3)
4. Créer `sendNovadevNegotiationMessage` handler (calqué sur S3)
5. Gater la signature

### Étape 3 : Polish Devis S4
1. Tracker `previousDealTerms` pour montrer les changements
2. Afficher ancien→nouveau dans la section "Conditions négociées"

### Étape 4 : Vérification
1. `npx tsc --noEmit`
2. `npm run validate:scenarios`
3. Vérifier que les mécaniques pédagogiques S0 (trap Article 6) et S2 (contract_signed flag) fonctionnent toujours
