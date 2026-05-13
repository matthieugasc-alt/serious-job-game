# CRM Integration v2 — filtre mes-tâches + signaux pipeline

Cette override remplace `references/crm-integration.md` du skill
original. v2 : filtre strict sur les tâches Matthieu uniquement, plus
détection de signaux pipeline stratégiques.

## Connexion (inchangée)

- **Base URL** : `https://crm.drugoptimal.com`
- **Auth** : Bearer token
- **Token** : `dopt_639491c4101c3a7633ec07d4c0d94531b863a843a71efeb15ebc2582c2a1feb4`
- **Méthode** : bash/curl uniquement (web_fetch bloqué par proxy)

```bash
curl -s -H "Authorization: Bearer dopt_639491c4101c3a7633ec07d4c0d94531b863a843a71efeb15ebc2582c2a1feb4" \
  https://crm.drugoptimal.com/api/establishments
```

## Endpoints utilisés (v2)

Le briefing matinal utilise **uniquement** :

- `GET /api/establishments` — récupère tout, on filtre côté client

Les autres endpoints (`/api/taches`, `/api/meetings`, `/api/contacts`)
ne sont pas appelés dans le flux briefing pour éviter la latence et
la duplication. Tout est déjà dans `/api/establishments`.

## Schéma data — où sont les tâches ?

Les tâches sont imbriquées dans :

```
establishment
  └── services[]
        ├── clinique { taches[], ... }
        ├── tech { taches[], ... }
        ├── admin { taches[], ... }
        └── commercial { taches[], ... }
```

Chaque tâche a :

- `id`, `titre`, `statut` (todo / planned / in_progress / blocked /
  en_attente / done)
- `responsable`, `responsable2` (chaîne avec le nom)
- `dateCible`, `dateCompletion`
- `blocage` (texte si bloqué)
- `phase`, `objectif`, `noteVigilance`

Chaque establishment a au niveau racine :

- `name`, `city`, `type` (CHU/CH/Clinique/…)
- `panierViseEuros` (valeur deal)
- `dateRdvComex`, `dateValidationDG`, `dateSignature`, `dateJ0`
- `dateFirstContact`, `dpi`, `groupement`

## Règle de filtrage v2 — "mes tâches"

Pour chaque tâche, **inclure dans le briefing perso** ssi :

```python
def is_my_task(tache):
    resp = (tache.get('responsable') or '').lower()
    resp2 = (tache.get('responsable2') or '').lower()
    if 'matthieu' in resp or 'matthieu' in resp2:
        return True
    # Founder-only tasks même si responsable autre
    titre = (tache.get('titre') or '').lower()
    founder_only_keywords = [
        'signature', 'contrat', 'levée', 'levee', 'investisseur',
        'valorisation', 'capitalisation', 'closing', 'term sheet'
    ]
    if any(k in titre for k in founder_only_keywords):
        return True
    return False
```

Puis filtrer aussi sur l'urgence :

```python
def is_actionable_today(tache):
    statut = tache.get('statut')
    if statut in ('done', 'completed', 'cancelled'):
        return False
    dc = tache.get('dateCible')
    if dc and dc <= today_iso:
        return True
    if tache.get('blocage'):
        return True
    if statut in ('blocked', 'in_progress'):
        return True
    return False
```

Une tâche entre dans le briefing si `is_my_task(t) AND is_actionable_today(t)`.

## Règle de filtrage v2 — "signaux pipeline"

Indépendamment des tâches, **détecter** ces signaux par établissement :

```python
def pipeline_signals(est):
    signals = []
    panier = est.get('panierViseEuros') or 0
    today = date.today().isoformat()
    soon = (date.today() + timedelta(days=7)).isoformat()

    # Comex imminent
    if est.get('dateRdvComex') and today <= est['dateRdvComex'] <= soon:
        signals.append(('comex_imminent', f"Comex prévu {est['dateRdvComex']}"))

    # J0 imminent
    if est.get('dateJ0') and today <= est['dateJ0'] <= soon:
        signals.append(('j0_imminent', f"J0 prévu {est['dateJ0']}"))

    # Signature attendue (valDG fait, sig pas encore)
    if est.get('dateValidationDG') and not est.get('dateSignature'):
        if panier >= 20000:
            signals.append(('signature_attendue', f"valDG {est['dateValidationDG']}, signature pas obtenue"))

    # Deal stratégique bloqué (>20K€ avec blocage actif)
    for svc in est.get('services', []) or []:
        for cat in ('clinique', 'tech', 'admin', 'commercial'):
            c = svc.get(cat) or {}
            for t in c.get('taches', []) or []:
                if t.get('blocage') and panier >= 20000:
                    signals.append(('blocage_strategique',
                        f"{svc.get('name')} bloqué : {t.get('blocage')[:80]}"))
                    break

    return signals
```

Surface ces signaux **sans demander d'action immédiate** — c'est de
l'awareness stratégique, pas une todo list.

## Pourquoi pas les tâches des autres ?

Le founder délègue à Lugan / Hugo / Lou / Thomas / Bruno / Romain et il
ne veut pas micromanager. Si la délégation fonctionne, les tâches des
autres avancent sans son intervention. Si elles n'avancent pas, c'est
soit :

- (a) **bloqué par lui** (escalade, décision) → signal pipeline le
  remontera via `blocage_strategique`
- (b) **bloqué par eux** (procrastination, manque de skill) → c'est
  un sujet de management à traiter en CSM hebdo, pas un sujet de
  briefing matinal
- (c) **non bloqué, juste en cours** → laisser faire

Pour le management hebdo, le **brouillon stream clinique** fait
remonter les tâches Lugan/Hugo/Lou à eux directement, pas au founder.

## Mise à jour CRM après briefing

Si une tâche bouge suite au briefing, utiliser :

```bash
curl -s -X PUT \
  -H "Authorization: Bearer dopt_..." \
  -H "Content-Type: application/json" \
  -d '{"statut": "in_progress"}' \
  https://crm.drugoptimal.com/api/taches/<id>
```

À faire **uniquement** sur les tâches du founder, jamais sur les
tâches des autres (les autres mettent à jour leur propre CRM).

## Snippet complet : briefing CRM extraction

```python
import json
from datetime import date, timedelta

def extract_for_briefing(establishments, today_iso=None):
    today_iso = today_iso or date.today().isoformat()
    soon = (date.today() + timedelta(days=7)).isoformat()
    my_tasks = []
    all_signals = []

    for est in establishments:
        # Signals
        sigs = pipeline_signals(est)
        for s in sigs:
            all_signals.append({'establishment': est['name'], 'signal': s})

        # My tasks
        for svc in est.get('services', []) or []:
            for cat in ('clinique', 'tech', 'admin', 'commercial'):
                c = svc.get(cat) or {}
                for t in c.get('taches', []) or []:
                    if is_my_task(t) and is_actionable_today(t):
                        my_tasks.append({
                            'establishment': est['name'],
                            'service': svc.get('name'),
                            'category': cat,
                            'task': t,
                        })

    return {'my_tasks': my_tasks, 'signals': all_signals}
```

Sortie : utiliser `my_tasks` pour la section "Mes tâches CRM" du
briefing, et `signals` pour la sous-section "Signaux pipeline".
