# Process standard — Création d'un scénario Founder

**Version :** 1.0  
**Date :** 2026-05-04

Ce document décrit le process obligatoire pour créer ou modifier un scénario Founder. Chaque étape doit être complétée dans l'ordre. Aucune étape n'est optionnelle.

---

## Étape 1 — Définir le synopsis

Avant d'écrire une seule ligne de code ou de JSON.

Répondre à ces 3 questions :

1. **Objectif joueur** — Qu'est-ce que le joueur doit accomplir ? (ex: "Négocier un contrat de prestation MVP")
2. **Décision centrale** — Quelle est LA décision clé qui départage un bon et un mauvais outcome ? (ex: "Réduire le scope vs. garder le scope complet")
3. **Tension métier** — Quel est le dilemme réaliste du fondateur ? (ex: "Budget limité vs. cofondateur ambitieux")

Documenter dans un fichier `scenarios/founder_XX_name/SYNOPSIS.md`.

---

## Étape 2 — Définir les variables économiques

Pour chaque scénario, lister explicitement :

| Variable | Comportement | Exemple |
|----------|-------------|---------|
| treasury | Fixe / Dynamique | Dynamique (dépend du prix négocié) |
| ownership | Fixe / Dynamique | Dynamique (dépend de l'equity cédée) |
| MRR | Fixe / Dynamique | Fixe (0 pour S2) |
| elapsedMonths | Fixe / Dynamique | Fixe (2/4/7 selon outcome) |
| Hidden metrics | Quoi et pourquoi | techDebt, investorConfidence |

**Règle impérative :** Si une variable est DYNAMIQUE (dépend d'une négociation joueur), elle ne doit JAMAIS apparaître comme valeur fixe dans le texte du microDebrief. Utiliser un template `{{variable_name}}`.

---

## Étape 3 — Définir les flags

Pour chaque flag :

| Flag | Type | Valeurs possibles | Qui l'écrit | Qui le lit | 0 est valide ? |
|------|------|-------------------|-------------|------------|-----------------|
| contract_price | number | 0–50000 | ContractHandler.computeSign | useDebrief, apply-outcome | Non (prix=0 impossible) |
| contract_equity | number | 0–10 | ContractHandler.computeSign | useDebrief, apply-outcome | **OUI** (0 = pas d'equity) |
| scope_reduced | boolean | true/false | Phase 1 chat | useDebrief | N/A |

**Règle impérative :** Si un flag numérique peut légitimement valoir 0, le documenter explicitement et interdire `||` comme garde.

---

## Étape 4 — Définir les outcomes

Pour chaque outcome possible :

| Outcome ID | Ending key | Conditions (flags) | Deltas fixes | Deltas dynamiques | Signal |
|-----------|------------|-------------------|-------------|-------------------|--------|
| mvp_lean | success | contract_signed AND scope_reduced | elapsedMonths: 2, productQuality: 35 | treasury: -(contract_price + burn), ownership: -contract_equity | robust |
| mvp_costly | partial_success | novadev_negotiated AND NOT scope_reduced | elapsedMonths: 4, productQuality: 50 | treasury: -(contract_price + burn), ownership: -contract_equity | costly |

**Règle impérative :** Les deltas dynamiques sont ceux qui dépendent d'une négociation joueur. Ils seront overridés dans `apply-outcome/route.ts`. Les deltas fixes dans `founder_rules.json` servent de FALLBACK uniquement.

---

## Étape 5 — Définir les invariants

Ajouter une entrée dans `data/founder_invariants.json` :

```json
{
  "scenario_id": "founder_XX_name",
  "has_dynamic_negotiation": true,
  "allowed_deltas": {
    "treasury": { "min": -35000, "max": 0 },
    "ownership": { "min": -5, "max": 0 },
    "mrr": { "min": 0, "max": 0 },
    "elapsedMonths": { "min": 1, "max": 7 }
  },
  "required_flags_at_completion": ["contract_signed", "contract_price", "contract_equity"],
  "valid_endings": ["success", "partial_success", "failure"],
  "ending_conditions": {
    "success": "contract_signed AND scope_reduced",
    "partial_success": "novadev_negotiated AND NOT scope_reduced",
    "failure": "NOT novadev_negotiated"
  },
  "rules": [
    "If contract_equity == 0, ownership_delta must be 0",
    "treasury_delta must equal -(contract_price + burn)"
  ],
  "forbidden_patterns": [
    "|| on numeric flag values",
    "Hardcoded price in microDebrief text"
  ]
}
```

**Checklist invariants :**

- [ ] Bornes min/max réalistes pour chaque delta
- [ ] Flags required listés
- [ ] Tous les endings listés existent dans founder_rules.json
- [ ] Conditions de chaque ending documentées
- [ ] Cas `0` explicitement traités dans les rules
- [ ] Patterns interdits listés

---

## Étape 6 — Écrire scenario.json

Structure obligatoire :

```json
{
  "scenario_id": "founder_XX_name",
  "version": "X.0.0",
  "meta": { ... },
  "actors": [ ... ],
  "phases": [
    {
      "phase_id": "phase_1_xxx",
      "modules": ["chat"],
      "mail_config": { ... },
      ...
    }
  ],
  "state": {
    "flags": {
      "flag_name": false
    }
  },
  "constraints": { }
}
```

**Règles :**

- Chaque phase déclare ses `modules` explicitement
- Les flags initiaux dans `state.flags` doivent correspondre aux flags listés à l'étape 3
- Les contraintes (ex: `plancher_novadev`) sont dans `constraints`, pas hardcodées dans le code
- Aucune valeur économique dans les textes d'introduction, de consigne, ou de phase

---

## Étape 7 — Écrire les documents et prompts

Pour chaque PJ (PDF, contrat, note) et chaque prompt IA :

**Checklist :**

- [ ] Aucune valeur économique contradictoire avec les invariants
- [ ] Les montants dans les documents correspondent aux bornes des invariants
- [ ] Les prompts IA ne mentionnent pas de montants spécifiques qui pourraient contredire la négociation
- [ ] Les prompts IA utilisent `{{contract_price}}` ou équivalent si le montant est dynamique

---

## Étape 8 — Validation automatique

Exécuter dans cet ordre :

```bash
# 1. Validation des scénarios (structure JSON)
npm run validate:scenarios

# 2. Validation Founder (invariants, flags, hardcodes)
npm run validate:founder

# 3. Vérification TypeScript
npx tsc --noEmit
```

Les 3 doivent passer sans erreur.

---

## Étape 9 — Test manuel minimal

Jouer le scénario en mode super_admin. Vérifier :

| Point de contrôle | Attendu |
|-------------------|---------|
| Action clé réussie | Les bons flags sont posés |
| Signature contrat (si applicable) | contract_price et contract_equity reflètent les valeurs négociées |
| Micro-debrief affiché | Les montants dans le TEXTE correspondent aux valeurs négociées |
| Dashboard | treasury_delta, ownership_delta cohérents avec les flags |
| Deuxième playthrough (valeurs différentes) | Le texte change en fonction des nouvelles valeurs |

---

## Anti-patterns interdits

| Anti-pattern | Pourquoi | Alternative |
|-------------|----------|-------------|
| `flags.value \|\| defaultValue` sur un numérique | 0 est traité comme absence | `flags.value ?? defaultValue` |
| Montant en € hardcodé dans microDebrief | Contredit les valeurs négociées | `{{variable_name}}` template |
| Fallback silencieux (`\|\| 3`) | Cache un bug | Erreur explicite ou `??` |
| Delta dans rules.json pour variable dynamique | Sera overridé mais crée de la confusion | Commenter clairement "FALLBACK — overridé par apply-outcome" |
| Ending déterminé par score générique | Score peu fiable pour les scénarios complexes | Branche spécifique dans useDebrief |
| Contract price = 0 non géré | Signature sans prix = erreur | Validation avant signature |

---

## Checklist finale (copier dans la PR)

```
- [ ] SYNOPSIS.md rédigé
- [ ] Variables économiques listées (fixe/dynamique)
- [ ] Flags documentés avec types, écrivains, lecteurs
- [ ] Outcomes listés avec conditions et deltas
- [ ] Invariants ajoutés dans founder_invariants.json
- [ ] scenario.json avec modules déclarés
- [ ] Documents sans valeur économique contradictoire
- [ ] Prompts IA sans montant hardcodé si dynamique
- [ ] npm run validate:scenarios ✅
- [ ] npm run validate:founder ✅
- [ ] npx tsc --noEmit ✅
- [ ] Test manuel : action clé + debrief + dashboard
```
