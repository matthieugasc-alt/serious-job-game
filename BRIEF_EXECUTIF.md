# Brief exécutif — Revealio

**Format** : 3 minutes de lecture. Pour signaler l'essentiel avant de rentrer dans le détail.
**Contexte** : lire ceci en premier dans toute nouvelle session Cowork. `COWORK_INIT.md` donne l'exhaustif ensuite si besoin.

---

## En 30 secondes

Revealio est une plateforme de simulations professionnelles en ligne sur **https://revealio.live**. Ces 3 derniers mois, l'équipe moteur a livré 4 chantiers d'architecture qui séparent proprement l'observation IA du verdict moteur, rendent chaque évaluation auditable, versionnent les scénarios, mesurent les compétences transverses, et suggèrent des améliorations aux concepteurs. 202 tests passent, 10 scenarios actifs valident, la prod tourne.

**Mais** : un audit récent a montré que l'architecture actuelle scale mal au-delà de ~20 scenarios. Le pivot correct est de passer d'une organisation *par scenario* à une organisation *par mécanique de jeu*. C'est un refactor de 15-20 sessions. La décision n'est pas prise.

---

## Où on en est concrètement

**Prod stable** : la plateforme tourne sans régression majeure. Le déploiement est automatisé (`scripts/deploy.sh` avec fail-fast). PM2 sur Ubuntu, PM2 app name `serious-job-game`. URL prod : https://revealio.live.

**Code en repo** : `/Users/gascmatthieu/serious-job-game` — c'est le dossier autoritatif. 202 tests unitaires, 21 fichiers de tests, `tsc --noEmit` clean, `validate:scenarios` passe 10/10 actifs.

**Chantiers livrés récemment** : F (fondations), V (voice as capability), E (évaluations explicables), W (sévérité pédagogique), X (replay actionnable), Y (télémétrie), Z (référentiel compétences), CF (critère × compétence × famille d'erreur), VS (versioning « git blame »), AS (assistant de conception).

**Débrief lecture prioritaire** : quatre docs à la racine, dans l'ordre — `DEBRIEF_V_E_PRODUCT_OWNER.md`, `DEBRIEF_W_X_Y_PRODUCT_OWNER.md`, `DEBRIEF_Z_CF_VS_AS_PRODUCT_OWNER.md`, puis `AUDIT_ARCHITECTURE_MECANIQUES.md`. Le dernier est le plus stratégique.

---

## La question ouverte qui domine tout le reste

**Faut-il refactoriser vers l'architecture « mécaniques » maintenant, ou continuer d'ajouter des features au modèle actuel ?**

Aujourd'hui : un scenario déclare des `phases`, chaque phase déclare des `modules` (mail, contract, interview). Le player est un chef d'orchestre de 5500 lignes qui connaît chaque cas. Chaque nouveau scenario touche au player.

Cible : le player devient un shell de ~500 lignes qui exécute une séquence de *mécaniques universelles* (Qualification, Négociation, Production, Décision, etc.). Chaque mécanique embarque son UI, sa logique, ses outils, ses tests. Un nouveau scenario = un JSON + des prompts + du contenu. Zéro touche au code.

**Impact chiffré** : le modèle actuel scale linéairement avec le nombre de scenarios. Le modèle cible scale sublinéairement (les mécaniques sont finies, ~15, et réutilisées). Estimation refactor : 15-20 sessions.

**Recommandation opérationnelle** : ne pas lancer de nouveau scenario significatif tant que le refactor n'est pas soit lancé, soit officiellement reporté. Chaque nouveau scenario ajoute de la dette de migration.

Détail complet dans `AUDIT_ARCHITECTURE_MECANIQUES.md`.

---

## Ce qui est fiable en prod

- Voice as capability : le micro devient une capacité optionnelle, fallback texte automatique avec timer allongé. Testé, robuste.
- Évaluations explicables : l'IA observe des critères déclarés, le moteur applique les règles. `applyPhaseObservation()` est déterministe, testable, et audité par vue admin `/admin/replay/[campaignId]`.
- Sévérité pédagogique : chaque critère a un niveau `critical / required / bonus / minor`. Un critical déclenche l'échec immédiat.
- Télémétrie + dashboard analytics : événements standardisés + vue admin `/admin/analytics` avec 6 sections + suggestions automatiques.
- Référentiel de compétences : 9 compétences transverses, CRUD admin, garde-fou qui refuse toute référence à un id inconnu.

## Ce qui est fragile et à surveiller

- **Aucun scenario n'utilise encore `critical`, ni `competencies`, ni `error_type`** en prod. Le code est là, les vues sont prêtes, mais rien ne les nourrit. Toutes les vues avancées affichent « pas assez de données ».
- **`archiveScenarioVersion` n'est appelé nulle part** : le versioning est du code mort tant qu'il n'est pas branché à un flow (probablement dans `/api/admin/scenario-patch`).
- **Les seuils de l'assistant AS sont mes hypothèses**, pas des vraies distributions observées. À recalibrer après quelques semaines de trafic W-typé.
- **Le prompt IA ne connaît pas les nouvelles dimensions** (severity, competencies, error_type). Il observe binaire alors qu'il pourrait être guidé.
- **`evaluation_history` reste côté client** : perte possible si crash avant sauvegarde 10s. Volontairement rétrogradé derrière le versioning dans les priorités.
- **6 pages admin sans page d'index `/admin`** : le concepteur doit connaître les URLs par cœur.
- **Le lien « éditer ce critère » depuis les suggestions** ne contextualise pas la severity actuelle — suggère parfois de passer en bonus un critère déjà bonus.

---

## Cinq décisions à trancher pour la suite

Par ordre d'impact décroissant :

**1. Lancer ou reporter le refactor mécaniques.** C'est la décision structurante. Si on lance, tout le reste attend. Si on reporte, on doit se discipliner à ne plus ajouter de sections JSON qui pointent vers des composants (`mail_config`, `voice_qa_config`).

**2. Migrer un scenario vitrine bout-en-bout** avec tout le vocabulaire (severity + competencies + error_type + version). Sans ça, aucune démo n'a de contenu à montrer. ~1-2 sessions.

**3. Wire `archiveScenarioVersion`** dans un flow réel (probablement `scenario-patch`). Sans ça VS reste théorique. ~30 min.

**4. Passer les dimensions au prompt IA** — enrichir l'`evaluationPromptE` avec severity/competencies/error_type. Test A/B possible : est-ce que la qualité d'observation s'améliore ? ~1 session.

**5. Créer une page d'index `/admin`** qui liste les 6 pages disséminées. Investissement 30 min pour un vrai gain UX. À faire même en cas de refactor.

Détail par chantier dans les 3 debriefs. Recommandations complètes dans l'audit.

---

## Comment déployer (recette 30 secondes)

```bash
cd /Users/gascmatthieu/serious-job-game
npx tsc --noEmit && npm run validate:scenarios && npx vitest run   # les 3 verts obligatoires
git add -A && git commit -m "<message clair>"
git push origin main
ssh root@204.168.217.145 "cd /var/www/serious-job-game && ./scripts/deploy.sh"
```

Le script fait pull → npm install → nuke `.next` → build (avec tsc + validate) → pm2 delete+start → smoke tests HTTP. Fail-fast : si build échoue, PM2 n'est pas touché, prod reste stable.

**Gotcha #1** : `.git/index.lock` ou `HEAD.lock` traînent → `rm` depuis le Mac (la sandbox Cowork ne peut pas, EPERM).
**Gotcha #2** : sandbox ne peut pas rm certains fichiers (EPERM) → laisser Matthieu le faire depuis le terminal.
**Rollback** : SSH sur le serveur, `git reset --hard <sha stable>`, `./scripts/deploy.sh`.

---

## Ce qu'il faut lire avant tout

Dans l'ordre :
1. Ce brief (fait).
2. `AUDIT_ARCHITECTURE_MECANIQUES.md` — la question stratégique.
3. `DEBRIEF_Z_CF_VS_AS_PRODUCT_OWNER.md` — dernier chantier + failles restantes.
4. `COWORK_INIT.md` — l'exhaustif (structure repo, historique complet, tous les gotchas).

Le reste (DEBRIEF V/E, DEBRIEF W/X/Y, AGENTS.md, docs/SEVERITY_GUIDE.md, ARCHITECTURE.md du player) est du contexte historique — utile en cas de question précise, pas nécessaire pour démarrer.
