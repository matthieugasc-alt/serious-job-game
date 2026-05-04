# AUDIT COMPLET — Fiabilisation métier Founder

**Date :** 2026-05-04  
**Périmètre :** 6 scénarios Founder (S0–S5)  
**Objet :** Divergences flags / outcomes / debrief / dashboard

---

## 1. CAUSE RACINE DU BUG S2 (11k/0% → 15k/3%)

### Diagnostic

Le joueur signe un contrat à 11 000 € / 0% equity. Le micro-debrief affiché sur le dashboard dit :
> "Deal equity : 15 000 € cash + 3% d'equity à NovaDev"

**Cause identifiée : DOUBLE défaillance**

**Défaillance 1 — Ending mal résolu (probable)**

Dans `useDebrief.ts` (lignes 93-118), la logique S2 est :
```
if (signed && scopeOk)     → ending = "success"
else if (dealDone)          → ending = "partial_success"
else                        → ending = "failure"
```

Si le flag `scope_reduced` n'est pas correctement posé pendant le jeu (phase 1 avec Alexandre), le ending tombe à `"partial_success"` même si le contrat est signé à 11k/0%.

Le `resolveOutcome("founder_02_mvp", "partial_success", rules)` retourne l'outcome `mvp_costly` dont le microDebrief hardcodé dit "15 000 € + 3% d'equity".

**Défaillance 2 — microDebrief TEXT toujours hardcodé (systémique)**

Même si le ending est correct ("success"), le microDebrief de `founder_rules.json` pour `mvp_lean` dit :
> "Deal cash à **12 000 €** avec NovaDev, livré en 7 semaines."

Le joueur a négocié 11 000 €. Le texte ne reflète pas les valeurs réelles.

**Les DELTAS numériques sont corrects** — `apply-outcome/route.ts` override dynamiquement treasury et ownership avec les valeurs du debrief (`debrief.contractPrice`, `debrief.contractEquity`). Mais le TEXTE du microDebrief vient directement de `founder_rules.json`, jamais modifié.

### Chemin complet de la donnée

```
Signature contrat (ContractHandler.computeS2Sign)
  → flags.contract_price = 11000, flags.contract_equity = 0
  → flags.contract_signed = true

useDebrief (hooks/useDebrief.ts)
  → Lit flags.contract_signed, flags.scope_reduced
  → Détermine ending = "success" ou "partial_success"
  → Crée founderDebrief avec :
      contractPrice = flags.contract_price = 11000
      contractEquity = flags.contract_equity = 0
  → Sauvegarde dans game record

apply-outcome (api/founder/apply-outcome/route.ts)
  → Lit matchingRecord.ending
  → resolveOutcome() → micro-debrief TEXTE de founder_rules.json (HARDCODÉ)
  → Override deltas avec debrief.contractPrice/contractEquity (DYNAMIQUE)
  → campaign.lastMicroDebrief = outcome.microDebrief (HARDCODÉ)

Dashboard (founder/[campaignId]/page.tsx)
  → Affiche microDebrief TEXTE = HARDCODÉ
  → Affiche stateAfter / deltas = DYNAMIQUES (corrects)
```

**Résultat : les CHIFFRES du dashboard sont corrects, le TEXTE est faux.**

---

## 2. AUDIT PAR SCÉNARIO

### S0 — founder_00_cto (Trouver un CTO)

| Champ | Valeur |
|-------|--------|
| Action finale | Signature pacte + gestion twist CTO |
| Flags écrits | `pacte_signed_clean`, `pacte_signed_dirty`, `bad_leaver_triggered`, `cto_paid_to_leave` |
| Fichiers écrivant les flags | `ContractHandler.computeS0Sign()`, `MailModule` (rupture_cto branch) |
| Fichiers lisant les flags | `useDebrief.ts` (lines 68-92) |
| Outcomes | `clean_pacte` / `dirty_pacte_negotiated` / `paid_to_leave` |
| treasury_delta | 0 / -1000 / -2500 |
| ownership_delta | 0 / 0 / 0 |
| MRR_delta | 0 |
| time_delta (months) | 0 |
| Hardcode détecté | "2 500 €" et "1 000 €" dans les textes microDebrief |
| Risque 0-falsy | ❌ Pas de risque (pas de valeur dynamique à 0) |
| Source de vérité | ✅ Flags → ending → founder_rules. Pas de négociation dynamique de prix/equity. |

**Verdict : ✅ OK — Pas de négociation dynamique, les deltas hardcodés correspondent toujours aux textes.**

---

### S1 — founder_01_incubator (Entrée incubateur)

| Champ | Valeur |
|-------|--------|
| Action finale | Pitch jury → accepté/liste d'attente/refusé |
| Flags écrits | `hasAdvisoryBoard` (via setsFlags dans outcome) |
| Fichiers écrivant les flags | `applyOutcomeToCampaign()` dans `founder.ts` |
| Fichiers lisant les flags | Dashboard (hasAdvisoryBoard) |
| Outcomes | `incubator_accepted` / `incubator_waitlist` / `incubator_rejected` |
| treasury_delta | -250 / -250 / -250 |
| ownership_delta | 0 |
| MRR_delta | 0 |
| time_delta (months) | 1 |
| Hardcode détecté | "250 €" dans les textes microDebrief |
| Risque 0-falsy | ❌ Pas de risque |
| Source de vérité | ✅ Ending déterminé par l'IA (debrief classique). Pas de négociation dynamique. |

**Verdict : ✅ OK — Valeurs fixes, texte cohérent avec les deltas.**

---

### S2 — founder_02_mvp (Construire le MVP) ⚠️ CRITIQUE

| Champ | Valeur |
|-------|--------|
| Action finale | Négociation NovaDev + signature contrat |
| Flags écrits | `alexandre_convinced`, `scope_reduced`, `novadev_negotiated`, `contract_signed`, `contract_price`, `contract_equity`, `contract_amendments` |
| Fichiers écrivant les flags | `ContractHandler.computeS2Sign()` (price, equity, signed), MailModule/page.tsx (alexandre_convinced, scope_reduced, novadev_negotiated) |
| Fichiers lisant les flags | `useDebrief.ts` (lines 93-118), `apply-outcome/route.ts` (lines 73-108) |
| Outcomes | `mvp_lean` / `mvp_costly` / `mvp_bloated` |
| treasury_delta hardcodé | -12500 / -16000 / -16750 |
| treasury_delta réel | **DYNAMIQUE** = -(contract_price + burn) via apply-outcome |
| ownership_delta hardcodé | 0 / -3 / -3 |
| ownership_delta réel | **DYNAMIQUE** = -contract_equity via apply-outcome |
| MRR_delta | 0 |
| time_delta (months) | 2 / 4 / 7 |
| Hardcodes détectés | **"12 000 €"** dans mvp_lean.microDebrief, **"15 000 € + 3%"** dans mvp_costly.microDebrief, **"15 000 € + 3%"** dans mvp_bloated.microDebrief |
| Risque 0-falsy | ⚠️ `apply-outcome` ligne 74 : `debrief?.contractPrice &&` → 0 serait falsy (mais prix = 0 impossible en pratique) |
| Risque 0-falsy | ⚠️ `apply-outcome` ligne 91 : `debrief?.contractEquity &&` → 0 IS falsy → tombe sur else-if (marche par chance pour equity=0) |
| Source de vérité | ❌ **INCOHÉRENTE** — deltas dynamiques corrects, texte hardcodé faux |

**Bugs identifiés :**
1. **microDebrief TEXT** ne reflète jamais les vraies valeurs
2. **Ending potentiellement mauvais** si `scope_reduced` n'est pas posé
3. **elapsedMonths** dépend de l'outcome hardcodé (2/4/7), pas du réel
4. **burnPerMonth || 250** dans apply-outcome (ligne 80) — `||` au lieu de `??`
5. **outcome.deltas.elapsedMonths || 0** dans apply-outcome (ligne 81) — `||` traite 0 comme 0 (OK par hasard)

---

### S3 — founder_03_clinical (Test clinique)

| Champ | Valeur |
|-------|--------|
| Action finale | Choix établissement + signature contrat |
| Flags écrits | `establishment_chosen`, `contract_signed`, `contract_too_generous`, `contract_amendments` |
| Fichiers écrivant les flags | `ContractHandler.computeS5Sign()` (S3 uses S5 contract type), page.tsx (establishment choice) |
| Fichiers lisant les flags | `useDebrief.ts` (no specific S3 branch — falls to generic), `apply-outcome/route.ts` |
| Outcomes | `pilot_switched` / `pilot_clean` / `pilot_slow` / `pilot_toxic` |
| treasury_delta | -500 / -250 / -750 / -1500 |
| ownership_delta | 0 |
| MRR_delta | 0 |
| time_delta (months) | 2 / 1 / 3 / 6 |
| Hardcodes détectés | "500 €", "250 €", "750 €", "1 500 €" dans les textes microDebrief |
| Risque 0-falsy | ❌ Pas de risque (pas de négociation dynamique de prix) |
| Source de vérité | ⚠️ Texte OK (valeurs fixes), mais ending déterminé par useDebrief generic fallback (pas de branche S3 spécifique) |

**Risque :** useDebrief n'a pas de branche `founder_03_clinical`. Il tombe dans le "generic founder debrief" (ligne 159-165) qui donne un ending basé sur `session.scores?.total >= 8`. Ce score peut ne pas être fiable.

**Verdict : ⚠️ MOYEN — Pas de divergence prix/texte mais ending potentiellement mal résolu.**

---

### S4 — founder_04_v1 (Passage en V1) ⚠️ IMPORTANT

| Champ | Valeur |
|-------|--------|
| Action finale | Diagnostic pilote + choix features devis + négociation Thomas |
| Flags écrits | `devis_total`, `devis_cash_paid`, `devis_discount`, `devis_selected_features`, `devis_signed`, `deal_interessement_pct/cap/duration`, `deal_interessement_uncapped/capped`, `deal_bsa_pct`, `deal_bsa_excessive/reasonable`, `deal_cash_only`, `royalties_pct/cap/duration_years` |
| Fichiers écrivant les flags | `ContractHandler.computeS4Sign()` |
| Fichiers lisant les flags | `useDebrief.ts` (lines 119-157), `apply-outcome/route.ts` (lines 110-121 for royalties) |
| Outcomes | `v1_surgical` / `v1_correct` / `v1_bloated` / `v1_bad_deal` |
| treasury_delta hardcodé | -5000 / -8000 / -21000 / -8000 |
| treasury_delta réel | **DYNAMIQUE** = -(devis_cash_paid + burn) via apply-outcome |
| ownership_delta hardcodé | 0 / 0 / 0 / -4 |
| ownership_delta réel | **DYNAMIQUE** = -deal_bsa_pct via apply-outcome |
| time_delta (months) | 2 / 2 / 3 / 2 |
| Hardcodes détectés | **"5 000 €"** dans v1_surgical, **"8 000 €"** dans v1_correct/v1_bad_deal, **"21 000 €"** dans v1_bloated, **"160K"** dans v1_bad_deal |
| Risque 0-falsy | ⚠️ `debrief.contractPrice` utilise `devis_cash_paid ?? devis_total ?? contract_price` — les `??` sont corrects maintenant |
| Source de vérité | ❌ **INCOHÉRENTE** — deltas dynamiques, texte hardcodé |

**Bugs identifiés :**
1. **microDebrief TEXT** dans founder_rules.json contient des valeurs hardcodées (5k, 8k, 21k)
2. **useDebrief TEXT** pour S4 est DYNAMIQUE (utilise `devisTotal.toLocaleString("fr-FR")` etc.) — mais ce n'est PAS le texte affiché sur le dashboard
3. Le dashboard affiche le microDebrief de founder_rules.json, pas celui de useDebrief
4. **elapsedMonths** : le hardcodé donne 3 mois pour feature_trap, 2 pour les autres — pas lié au devis réel
5. **BSA threshold** : `dealTerms.bsa > 3` hardcodé dans ContractHandler (ligne 295) — ✅ OK (règle métier fixe)

---

### S5 — founder_05_sales (Vente complexe)

| Champ | Valeur |
|-------|--------|
| Action finale | Cold email KOL + pitch DSI + négociation contrat |
| Flags écrits | `contract_signed`, `contract_too_generous`, `contract_amendments` |
| Fichiers écrivant les flags | `ContractHandler.computeS5Sign()` |
| Fichiers lisant les flags | `useDebrief.ts` (generic branch), `apply-outcome/route.ts` |
| Outcomes | `first_client_clean` / `first_client_risky` / `first_client_fragile` / `sale_blocked_dsi` / `no_prospect` |
| treasury_delta | +8000 / +6500 / +8000 / -500 / -250 |
| ownership_delta | 0 |
| MRR_delta | 1700 / 1450 / 1700 / 0 / 0 |
| time_delta (months) | 2 / 2 / 2 / 2 / 1 |
| Hardcodes détectés | "~8 600 EUR", "~1 700 EUR", "~6 500 EUR", "~1 450 EUR" dans les textes microDebrief |
| Risque 0-falsy | ❌ Pas de risque (pas de contrat dynamique avec prix négocié) |
| Source de vérité | ⚠️ Comme S3, pas de branche spécifique dans useDebrief — generic fallback |

**Verdict : ⚠️ MOYEN — Valeurs fixes dans le texte, mais ending potentiellement mal résolu (generic fallback).**

---

## 3. INVENTAIRE COMPLET DES HARDCODES ÉCONOMIQUES

### Catégorie A — Hardcodes dans microDebrief TEXT (founder_rules.json)

| Scénario | Outcome | Valeur hardcodée | Valeur réelle | Fichier | Ligne | Doit devenir |
|----------|---------|-----------------|---------------|---------|-------|-------------|
| S2 | mvp_lean | "12 000 €" | contract_price | data/founder_rules.json | ~247 | DYNAMIQUE |
| S2 | mvp_lean | "500 €" (burn) | burn calculé | data/founder_rules.json | ~247 | DYNAMIQUE |
| S2 | mvp_costly | "15 000 €" | contract_price | data/founder_rules.json | ~272 | DYNAMIQUE |
| S2 | mvp_costly | "3%" | contract_equity | data/founder_rules.json | ~272 | DYNAMIQUE |
| S2 | mvp_costly | "1 000 €" (burn) | burn calculé | data/founder_rules.json | ~272 | DYNAMIQUE |
| S2 | mvp_bloated | "15 000 €" | contract_price | data/founder_rules.json | ~297 | DYNAMIQUE |
| S2 | mvp_bloated | "3%" | contract_equity | data/founder_rules.json | ~297 | DYNAMIQUE |
| S2 | mvp_bloated | "1 750 €" (burn) | burn calculé | data/founder_rules.json | ~297 | DYNAMIQUE |
| S4 | v1_surgical | "5 000 €" | devis_cash_paid | data/founder_rules.json | ~400+ | DYNAMIQUE |
| S4 | v1_correct | "8 000 €" | devis_cash_paid | data/founder_rules.json | ~420+ | DYNAMIQUE |
| S4 | v1_bloated | "21 000 €" / "21K" | devis_total | data/founder_rules.json | ~440+ | DYNAMIQUE |
| S4 | v1_bad_deal | "8 000 €" | devis_cash_paid | data/founder_rules.json | ~460+ | DYNAMIQUE |
| S4 | v1_bad_deal | "160K/an" (example) | N/A | data/founder_rules.json | ~460+ | CONSERVER (illustratif) |

### Catégorie B — Hardcodes dans les deltas (founder_rules.json)

| Scénario | Outcome | Delta hardcodé | Valeur réelle | Risque |
|----------|---------|---------------|---------------|--------|
| S2 | mvp_lean | treasury: -12500 | -(contract_price + burn) | ✅ CORRIGÉ (apply-outcome override) |
| S2 | mvp_costly | treasury: -16000 | -(contract_price + burn) | ✅ CORRIGÉ |
| S2 | mvp_costly | ownership: -3 | -contract_equity | ✅ CORRIGÉ |
| S2 | mvp_bloated | treasury: -16750 | -(contract_price + burn) | ✅ CORRIGÉ |
| S2 | mvp_bloated | ownership: -3 | -contract_equity | ✅ CORRIGÉ |
| S4 | v1_surgical | treasury: -5000 | -(devis_cash_paid + burn) | ✅ CORRIGÉ |
| S4 | v1_correct | treasury: -8000 | -(devis_cash_paid + burn) | ✅ CORRIGÉ |
| S4 | v1_bloated | treasury: -21000 | -(devis_total + burn) | ✅ CORRIGÉ |
| S4 | v1_bad_deal | treasury: -8000, ownership: -4 | dynamique | ✅ CORRIGÉ |

Les deltas numériques sont CORRECTEMENT overridés par `apply-outcome/route.ts`. Le problème est uniquement le TEXTE.

### Catégorie C — Hardcodes dans le code

| Fichier | Ligne | Valeur | Contexte | Risque | Action |
|---------|-------|--------|----------|--------|--------|
| `founder.ts` | 217 | `250` | burnRateMonthly | Cohérent avec rules.json `burnRateMonthly: 250` | CONSERVER (constante métier) |
| `founder.ts` | 301 | `0.5` / `-125` | ABANDON_PENALTY | Dérivé de burn 250€/mois | CONSERVER |
| `apply-outcome/route.ts` | 80 | `\|\| 250` | burnPerMonth fallback | ⚠️ Devrait être `?? 250` | CORRIGER |
| `apply-outcome/route.ts` | 81 | `\|\| 0` | elapsedMonths fallback | ⚠️ 0 \|\| 0 = 0 (OK par hasard) | CORRIGER (`??`) |
| `MailModule.ts` | 232 | `\|\| 11000` | plancher_novadev fallback | ⚠️ Devrait lire scenario.constraints | VÉRIFIER |
| `page.tsx` | 2364 | `\|\| 11000` | plancher_novadev fallback | ⚠️ Devrait lire scenario.constraints | VÉRIFIER |
| `useDebrief.ts` | 124 | `> 15000` | feature_trap threshold | Seuil métier fixe | CONSERVER |
| `ContractHandler.ts` | 295 | `> 3` | BSA excessive threshold | Seuil métier fixe | CONSERVER |
| `ContractOverlayHost.tsx` | 42+ | `3000, 8000, 15000` | Tier price thresholds | UI labelling | CONSERVER |

### Catégorie D — Risques `|| 0` (0 traité comme falsy)

| Fichier | Ligne | Expression | Risque | Action |
|---------|-------|-----------|--------|--------|
| `apply-outcome/route.ts` | 74 | `debrief?.contractPrice &&` | contractPrice=0 → skip override | CORRIGER → `!= null && typeof === 'number'` |
| `apply-outcome/route.ts` | 80 | `campaign.burnRateMonthly \|\| 250` | burn=0 → fallback 250 | CORRIGER → `?? 250` |
| `apply-outcome/route.ts` | 81 | `outcome.deltas.elapsedMonths \|\| 0` | 0 \|\| 0 = 0 (OK par hasard) | CORRIGER → `?? 0` |
| `apply-outcome/route.ts` | 91 | `debrief?.contractEquity &&` | equity=0 → skip → else-if (OK par hasard) | CORRIGER → `!= null && typeof === 'number'` |
| `founder/[campaignId]/page.tsx` | 416 | `elapsedMonths \|\| 0` | UI fallback, pas critique | IGNORER |

---

## 4. SOURCE DE VÉRITÉ UNIQUE — PROPOSITION

### Règle

Pour chaque scénario Founder avec négociation dynamique (S2, S4), la source de vérité pour les valeurs économiques DOIT être :

```
session.flags (écrit par ContractHandler à la signature)
    ↓
game record.debrief (écrit par useDebrief, lit les flags)
    ↓
apply-outcome (lit le game record, override les deltas)
    ↓
campaign.state (résultat final)
```

**Interdiction absolue :** Le texte du microDebrief ne doit JAMAIS contenir de valeurs économiques hardcodées pour les scénarios avec négociation dynamique.

### Solution proposée

**Option A (recommandée) — Template strings dans founder_rules.json + interpolation dans apply-outcome**

```json
// founder_rules.json
"microDebrief": {
  "decision": "Scope réduit à l'essentiel. Deal cash à {{contract_price}} € avec NovaDev. Burn de {{burn}} € sur la période.",
  ...
}
```

`apply-outcome/route.ts` interpole les `{{...}}` avec les valeurs réelles avant de sauvegarder dans `campaign.lastMicroDebrief`.

**Option B — useDebrief génère le microDebrief complet (pas founder_rules)**

Le texte est déjà partiellement dynamique dans useDebrief (pour S4). Étendre à tous les scénarios. Mais cela duplique la logique et le dashboard ne le voit pas.

**Option C — Hybride : deltas dynamiques dans apply-outcome, texte dynamique dans useDebrief passé au dashboard**

Le game record contient déjà le texte du founderDebrief. Le dashboard pourrait lire `campaign.lastMicroDebrief` depuis le game record au lieu de founder_rules.json.

**Recommandation : Option A** — une seule modification (apply-outcome + templates dans rules.json), pas de changement d'architecture.

---

## 5. FORMAT D'INVARIANTS FOUNDER

### Emplacement proposé : `data/founder_invariants.json`

Un seul fichier centralisé (plus facile à valider qu'un fichier par scénario).

### Format

```json
{
  "version": "1.0",
  "scenarios": {
    "founder_02_mvp": {
      "scenario_id": "founder_02_mvp",
      "has_dynamic_negotiation": true,
      "allowed_deltas": {
        "treasury": { "min": -35000, "max": 0 },
        "ownership": { "min": -5, "max": 0 },
        "mrr": { "min": 0, "max": 0 },
        "elapsedMonths": { "min": 1, "max": 7 }
      },
      "required_flags_at_completion": [
        "contract_signed",
        "contract_price",
        "contract_equity"
      ],
      "valid_endings": ["success", "partial_success", "failure"],
      "ending_conditions": {
        "success": "contract_signed AND scope_reduced",
        "partial_success": "novadev_negotiated AND NOT scope_reduced",
        "failure": "NOT novadev_negotiated"
      },
      "rules": [
        "If contract_equity == 0, ownership_delta must be 0",
        "If contract_equity > 0, ownership_delta must equal -contract_equity",
        "treasury_delta must equal -(contract_price + burn)",
        "microDebrief text must reference actual contract_price, not hardcoded value",
        "microDebrief text must reference actual contract_equity, not hardcoded value",
        "0 is a valid value for contract_equity — never treat as absence"
      ],
      "forbidden_patterns": [
        "|| on numeric flag values (use ?? instead)",
        "Hardcoded price in microDebrief text",
        "Hardcoded equity percentage in microDebrief text"
      ]
    },
    "founder_04_v1": {
      "scenario_id": "founder_04_v1",
      "has_dynamic_negotiation": true,
      "allowed_deltas": {
        "treasury": { "min": -25000, "max": 0 },
        "ownership": { "min": -5, "max": 0 },
        "mrr": { "min": 0, "max": 0 },
        "elapsedMonths": { "min": 1, "max": 4 }
      },
      "required_flags_at_completion": [
        "devis_signed",
        "devis_total",
        "devis_cash_paid"
      ],
      "valid_endings": ["optimal", "good", "feature_trap", "bad_deal"],
      "ending_conditions": {
        "optimal": "devis_total <= 5000 AND (deal_interessement_capped OR deal_cash_only)",
        "bad_deal": "deal_interessement_uncapped OR deal_bsa_excessive",
        "feature_trap": "devis_total > 15000 OR selected_features >= 4",
        "good": "otherwise"
      },
      "rules": [
        "treasury_delta must equal -(devis_cash_paid + burn)",
        "If deal_bsa_pct > 0, ownership_delta must equal -deal_bsa_pct",
        "If deal_cash_only, ownership_delta must be 0",
        "microDebrief text must reference actual devis_total, not hardcoded value",
        "0 is a valid value for deal_bsa_pct — never treat as absence"
      ],
      "forbidden_patterns": [
        "|| on numeric flag values",
        "Hardcoded devis amount in microDebrief text"
      ]
    },
    "founder_00_cto": {
      "scenario_id": "founder_00_cto",
      "has_dynamic_negotiation": false,
      "allowed_deltas": {
        "treasury": { "min": -2500, "max": 0 },
        "ownership": { "min": 0, "max": 0 },
        "mrr": { "min": 0, "max": 0 },
        "elapsedMonths": { "min": 0, "max": 0 }
      },
      "required_flags_at_completion": [],
      "valid_endings": ["success", "partial_success", "failure"],
      "rules": [
        "No dynamic negotiation — hardcoded deltas are the source of truth"
      ],
      "forbidden_patterns": []
    },
    "founder_01_incubator": {
      "scenario_id": "founder_01_incubator",
      "has_dynamic_negotiation": false,
      "allowed_deltas": {
        "treasury": { "min": -250, "max": -250 },
        "ownership": { "min": 0, "max": 0 },
        "mrr": { "min": 0, "max": 0 },
        "elapsedMonths": { "min": 1, "max": 1 }
      },
      "required_flags_at_completion": [],
      "valid_endings": ["success", "partial_success", "failure"],
      "rules": [
        "Treasury always -250 (1 month burn)",
        "No dynamic negotiation"
      ],
      "forbidden_patterns": []
    },
    "founder_03_clinical": {
      "scenario_id": "founder_03_clinical",
      "has_dynamic_negotiation": false,
      "allowed_deltas": {
        "treasury": { "min": -1500, "max": -250 },
        "ownership": { "min": 0, "max": 0 },
        "mrr": { "min": 0, "max": 0 },
        "elapsedMonths": { "min": 1, "max": 6 }
      },
      "required_flags_at_completion": [],
      "valid_endings": ["switched_success", "success", "partial_success", "failure"],
      "rules": [
        "No dynamic price negotiation",
        "Ending determination in useDebrief has NO specific S3 branch — uses generic fallback (RISK)"
      ],
      "forbidden_patterns": []
    },
    "founder_05_sales": {
      "scenario_id": "founder_05_sales",
      "has_dynamic_negotiation": false,
      "allowed_deltas": {
        "treasury": { "min": -500, "max": 8000 },
        "ownership": { "min": 0, "max": 0 },
        "mrr": { "min": 0, "max": 1700 },
        "elapsedMonths": { "min": 1, "max": 2 }
      },
      "required_flags_at_completion": [],
      "valid_endings": ["success_clean", "success_risky", "success_with_lies", "partial_dsi_blocked", "failure_no_interest"],
      "rules": [
        "No dynamic contract price negotiation (fixed outcomes)",
        "MRR starts here — only scenario with MRR > 0",
        "Ending determination in useDebrief has NO specific S5 branch — uses generic fallback (RISK)"
      ],
      "forbidden_patterns": []
    }
  }
}
```

---

## 6. PROPOSITION validate:founder

### Script : `scripts/validate-founder.ts`

```
npm run validate:founder
```

### Vérifications

1. **Tous les scénarios Founder ont des invariants** — chaque clé dans `founder_rules.json.scenarios` doit exister dans `founder_invariants.json.scenarios`
2. **Tous les required_flags existent** — vérifier que les flags listés sont effectivement écrits par le code
3. **Aucun `||` sur valeur numérique** — grep pour `|| 0`, `|| null` sur les lignes qui touchent des flags numériques dans `apply-outcome`, `useDebrief`, `ContractHandler`
4. **Outcomes cohérents** — chaque ending listé dans invariants existe dans les outcomes de `founder_rules.json`
5. **Bornes respectées** — les deltas hardcodés de chaque outcome sont dans les bornes `allowed_deltas`
6. **Pas de hardcode économique dans microDebrief** — scanner les textes microDebrief pour des montants en € qui ne sont pas des templates `{{...}}`
7. **useDebrief couvre tous les scénarios** — vérifier qu'il y a une branche spécifique (pas generic fallback) pour chaque scénario avec `valid_endings` > 3 ou avec `has_dynamic_negotiation`
8. **0 traité comme valide** — aucun `&&` guard sur des flags numériques qui peuvent légitimement être 0

---

## 7. PROCESS DE CRÉATION SCÉNARIO FOUNDER

→ Voir document séparé : `docs/FOUNDER_SCENARIO_CREATION.md`

---

## 8. CORRECTION MINIMALE PROPOSÉE POUR S2

### Étape 1 — Corriger les `||` résiduels dans apply-outcome

Fichier : `app/api/founder/apply-outcome/route.ts`

```diff
- const burnPerMonth = campaign.burnRateMonthly || 250;
+ const burnPerMonth = campaign.burnRateMonthly ?? 250;

- const months = outcome.deltas.elapsedMonths || 0;
+ const months = outcome.deltas.elapsedMonths ?? 0;

- if (debrief?.contractPrice && typeof debrief.contractPrice === 'number') {
+ if (debrief?.contractPrice != null && typeof debrief.contractPrice === 'number') {

- if (debrief?.contractEquity && typeof debrief.contractEquity === 'number') {
+ if (debrief?.contractEquity != null && typeof debrief.contractEquity === 'number') {
```

### Étape 2 — Ajouter une branche S3 et S5 dans useDebrief

useDebrief n'a pas de branche spécifique pour S3 et S5. Il faut en ajouter pour que le ending soit déterminé par les flags réels, pas par un score générique.

### Étape 3 — Templater les microDebrief dans founder_rules.json

Remplacer les valeurs hardcodées par des templates :

```json
"decision": "Scope réduit à l'essentiel. Deal cash à {{contract_price}} € avec NovaDev, livré en 7 semaines. Burn de {{burn}} € sur la période."
```

### Étape 4 — Interpoler les templates dans apply-outcome

Après le calcul des deltas dynamiques, interpoler les `{{...}}` dans chaque champ du microDebrief :

```typescript
function interpolateMicroDebrief(
  md: FounderMicroDebrief,
  vars: Record<string, string | number>
): FounderMicroDebrief {
  const replace = (s: string) => 
    s.replace(/\{\{(\w+)\}\}/g, (_, key) => 
      vars[key] != null ? String(vars[key]) : `{{${key}}}`
    );
  return {
    decision: replace(md.decision),
    impact: replace(md.impact),
    strength: replace(md.strength),
    risk: replace(md.risk),
    advice: md.advice ? replace(md.advice) : undefined,
  };
}
```

Variables à passer :
- `contract_price` = valeur réelle du contrat
- `contract_equity` = valeur réelle de l'equity
- `burn` = burn calculé (burnPerMonth * months)
- `devis_total` = pour S4
- `devis_cash_paid` = pour S4
- `treasury_after` = campaign.state.treasury après application
- `ownership_after` = campaign.state.ownership après application

### Étape 5 — Vérifier le ending S2

S'assurer que quand le joueur signe le contrat avec scope réduit, le flag `scope_reduced` est bien posé. Tracer : qui pose ce flag ? Quand ? Le module ou le legacy code ?

### Plan d'implémentation ordonné

1. Créer `data/founder_invariants.json` (pas de code, juste les données)
2. Corriger les `||` → `??` dans `apply-outcome/route.ts` (4 lignes)
3. Corriger les guards `&&` → `!= null` dans `apply-outcome/route.ts` (2 lignes)
4. Templater les microDebrief dans `founder_rules.json` (S2 + S4)
5. Ajouter `interpolateMicroDebrief()` dans `app/lib/founder.ts`
6. Appeler l'interpolation dans `apply-outcome/route.ts`
7. Ajouter les branches S3 et S5 dans `useDebrief.ts`
8. Créer `scripts/validate-founder.ts`
9. Ajouter `"validate:founder"` dans `package.json`
10. Valider : `npx tsc --noEmit` + `npm run validate:founder`

---

## 9. RÉSUMÉ DES RISQUES PAR SCÉNARIO

| Scénario | Risque | Gravité | Action |
|----------|--------|---------|--------|
| S0 | Aucun | — | — |
| S1 | Aucun | — | — |
| S2 | microDebrief texte hardcodé + ending potentiellement mal résolu | 🔴 CRITIQUE | Étapes 1-6 |
| S3 | Pas de branche useDebrief → ending par score générique | 🟡 MOYEN | Étape 7 |
| S4 | microDebrief texte hardcodé (dashboard) | 🟠 IMPORTANT | Étapes 4-6 |
| S5 | Pas de branche useDebrief → ending par score générique | 🟡 MOYEN | Étape 7 |
