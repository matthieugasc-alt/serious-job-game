# Installation du patch skill `executive-priority-briefing`

## Changement

Ajout d'**Olivier Véran** comme **partenaire opérationnel externe** chargé
de la **prospection hôpitaux** pour DrugOptimal.

Fichier modifié : `references/team-delegation.md`

Modifications :
- Nouvelle section profil "Olivier VÉRAN"
- Nouvel item dans le delegation decision tree (point 4 : prospection
  hôpitaux / intro institutionnelle → Olivier Véran)
- Note explicite sur le Point DO Innov hebdomadaire (lundi 9h30) à traiter
  comme une revue de pipe prospection

## Commande d'installation (à coller dans Terminal)

```bash
SKILL_DIR="/var/folders/ll/zpr4sgn13ybgcnvfqszhm86w0000gn/T/claude-hostloop-plugins/d1228423ca70619c/skills/executive-priority-briefing/references"
cp "/Users/gascmatthieu/serious-job-game/skill-patches/team-delegation.md" "$SKILL_DIR/team-delegation.md"
echo "Patch installé."
```

⚠️ Le dossier `/var/folders/...claude-hostloop-plugins/...` est un cache temporaire.
Il peut être régénéré par Cowork lors d'une mise à jour de plugin, ce qui
écraserait ce patch. Pour une modification pérenne, il faudrait éditer la
source officielle du skill (côté repo plugin Anthropic) ou créer un skill
override utilisateur si Cowork le supporte.
