# AUDIT HARDCODE — Messages Alexandre dans S2 (founder_02_mvp)

**Date** : 2026-05-04  
**Périmètre** : Tous les messages d'Alexandre Morel injectés de façon statique (non générés par l'IA) dans le scénario `founder_02_mvp`.  
**Fichiers audités** : scenario.json, prompts/alexandre_morel.md, page.tsx, MailModule.ts, ContractHandler.ts, contractModel.ts, useDebrief.ts, usePhaseTimer.ts, founder_rules.json

---

## 1. INVENTAIRE COMPLET

### MSG-01 — Message d'ouverture (initial_events)

| Champ | Valeur |
|-------|--------|
| **Fichier** | `scenarios/founder_02_mvp/scenario.json` |
| **Ligne** | 198 |
| **event_id** | `alexandre_sends_docs` |
| **Texte exact** | `Salut ! Grosse session de boulot. Je t'envoie tout : la synthèse des 10 entretiens que j'ai faits avec les chirurgiens, ma note de cadrage pour le produit, et le devis de NovaDev que j'ai demandé. Franchement c'est du solide, je pense qu'on tient un truc. Le devis est à 32k€ HT, c'est un investissement mais le produit sera complet. On lance ?` |
| **Moment d'injection** | Démarrage du scénario (avant phase_1_alexandre) |
| **Acteur** | `alexandre_morel` |
| **Canal** | chat |
| **PJ attachées** | synthese_entretiens, note_cadrage, devis_novadev |
| **Raison d'existence** | Déclenche le scénario. Livre les 3 documents au joueur. Pose la question initiale. |

### MSG-02 — Transition Phase 1 → Phase 2 (entry_events)

| Champ | Valeur |
|-------|--------|
| **Fichier** | `scenarios/founder_02_mvp/scenario.json` |
| **Ligne** | 296–299 |
| **event_id** | `alex_transition` |
| **Texte exact** | `OK, on est alignés sur le scope. Écris à Thomas de NovaDev pour lui expliquer. Son mail c'est thomas@novadev.fr. Négocie bien — on a pas beaucoup de marge.` |
| **Moment d'injection** | Entrée de phase_2_negotiation (entry_events, delay_ms: 0) |
| **Acteur** | `alexandre_morel` |
| **Canal** | chat |
| **Raison d'existence** | Message de transition. Donne l'email de Thomas au joueur. Instruction gameplay pour passer à la négo. |

---

## 2. MESSAGES ALEXANDRE DANS D'AUTRES FICHIERS — HORS PÉRIMÈTRE S2

Les fichiers suivants contiennent des messages hardcodés d'Alexandre mais **exclusivement pour d'autres scénarios**. Ils ne se déclenchent jamais dans S2 :

| Fichier | Lignes | Scénario | Contenu |
|---------|--------|----------|---------|
| `MailModule.ts` | 126–128 | S0 | `C'est réglé. ${ctoName} sort en bad leaver…` |
| `MailModule.ts` | 139–141 | S0 | `Merde. Le pacte n'avait pas de clause…` |
| `MailModule.ts` | 330 | S3 | Mail "Contact pour le test pilote" |
| `MailModule.ts` | 548 | S3 | `Aïe… ${etablissement} a refusé…` |
| `MailModule.ts` | 591 | S3 | `T'as envoyé quoi comme mail ?!…` |
| `page.tsx` | 2274 | S0 | Doublon MailModule — bad leaver |
| `page.tsx` | 2279 | S0 | Doublon MailModule — paid to leave |
| `page.tsx` | 2452 | S3 | Mail from: alexandre_morel |
| `page.tsx` | 2749 | S3 | Pivot clinique |
| `page.tsx` | 2766 | S3 | Clinique pitch fail |

**Aucun de ces messages ne s'exécute si `scenarioId === "founder_02_mvp"`.** Ils sont gardés par des conditions (`scenarioId?.startsWith("founder_03")`, `mailKind === "rupture_cto"`, etc.).

---

## 3. PROMPT IA — PAS UN HARDCODE

| Fichier | Contenu |
|---------|---------|
| `scenarios/founder_02_mvp/prompts/alexandre_morel.md` | Prompt système pour l'IA. Contient des exemples de répliques (« Ouais je comprends ton raisonnement, mais… ») mais ce sont des instructions pour le modèle, **pas des messages injectés dans le chat**. L'IA génère dynamiquement chaque réponse d'Alexandre en phase 1. |

La ligne 70 du prompt contient : `"OK. Écris à Thomas de NovaDev, son mail c'est thomas@novadev.fr. Négocie bien — on a pas beaucoup de marge."` — c'est une instruction pour que l'IA dise quelque chose de similaire quand un accord se dessine. Ce n'est **pas** le même texte qui est hardcodé dans entry_events (bien que le sens soit proche).

---

## 4. DEBRIEF — PAS DES MESSAGES ALEXANDRE

| Fichier | Lignes | Contenu |
|---------|--------|---------|
| `useDebrief.ts` | 93–118 | Textes de micro-debrief S2 (decision, impact, strength, risk). Ce sont des textes **système** présentés au joueur dans l'écran de fin. Alexandre n'en est pas l'auteur narratif. |
| `founder_rules.json` | 235–290 | Outcomes S2 avec microDebrief templaté. Même chose : texte système, pas message Alexandre. |

---

## 5. CLASSIFICATION

| ID | Texte (résumé) | Classification | Justification |
|----|----------------|---------------|---------------|
| **MSG-01** | "Salut ! Grosse session de boulot…" | **GARDER** | Message one-shot de démarrage. Livre les 3 PJ. Ne peut pas être généré dynamiquement (il doit référencer les documents exacts et le prix exact du devis). |
| **MSG-02** | "OK, on est alignés sur le scope…" | **GARDER** | Message one-shot de transition. Fournit l'email de Thomas (donnée gameplay critique). Ne se répète jamais. |

---

## 6. ANALYSE DU BUG "DOUBLE MAIL"

Le bug rapporté par l'utilisateur (« j'ai dû envoyer 2 mails à Thomas ») n'est **pas** causé par un message Alexandre hardcodé. La cause est structurelle :

- **Phase 1** (`phase_1_alexandre`) : `mail_config.send_advances_phase: true` avec `defaults.to: "thomas@novadev.fr"`. Le joueur envoie un mail à Thomas pour avancer.
- **Phase 2** (`phase_2_negotiation`) : `mail_config.send_advances_phase: true` avec `defaults.to: "thomas@novadev.fr"`. Le joueur doit envoyer un second mail à Thomas pour avancer.

Les deux phases demandent un mail au même destinataire. Ce n'est pas un problème de hardcode Alexandre — c'est un problème de design de phase. MSG-02 ("Écris à Thomas de NovaDev") renforce cette confusion car il demande explicitement d'écrire à Thomas alors que le joueur vient de le faire.

**Correction possible** (non appliquée, conformément à l'instruction "ne touche à rien") : soit supprimer `send_advances_phase` de la Phase 1 (la phase avance par un trigger Alexandre côté chat), soit transformer le mail Phase 1 en mail interne à Alexandre (pas à Thomas).

---

## 7. VERDICT

**Résultat de l'audit : S2 est PROPRE côté hardcode Alexandre.**

Seulement 2 messages statiques, tous deux justifiés (one-shot, données gameplay, pas de répétition). Aucun message Alexandre n'est hardcodé dans le code applicatif (page.tsx, MailModule.ts, handlers) pour le scénario S2. Toutes les réponses d'Alexandre en phase 1 sont 100% dynamiques (générées par l'IA via le prompt `prompts/alexandre_morel.md`).

Le seul point d'attention est le **quasi-doublon sémantique** entre le prompt IA (ligne 70 : "OK. Écris à Thomas…") et MSG-02 (entry_events : "OK, on est alignés…"). Si l'IA génère sa propre version de ce message juste avant que le entry_event ne fire, le joueur verra deux messages similaires. Mais en pratique, l'avance de phase se déclenche par l'envoi du mail (pas par un message IA), donc le timing est correct : l'IA parle → le joueur envoie le mail → la phase avance → MSG-02 apparaît.
