# Note de cadrage produit — Orisio V1

**Auteur :** Alexandre Morel (CPO)
**Date :** Mois 5
**Version :** 1.0

---

## Vision produit

Orisio doit être LA solution de référence pour la gestion des blocs opératoires en France. Dès la première version, il faut montrer aux établissements qu'on est sérieux, complet et professionnel. Si on sort un outil à moitié fini, on grille notre crédibilité. Les chirurgiens sont exigeants. Les directeurs d'établissement aussi. On n'a pas droit à l'erreur sur la première impression.

---

## Fonctionnalités — Version 1

### Module 1 — Planning complet du bloc

Vue temps réel de l'occupation de toutes les salles, avec :
- Affichage par jour, semaine et mois
- Filtrage par chirurgien, par spécialité, par salle
- Vue individuelle pour chaque chirurgien (son planning perso)
- Gestion des plages récurrentes (créneaux hebdomadaires fixes)
- Gestion des exceptions (congrès, vacances, arrêts maladie)
- Impression du planning au format A3 pour affichage en salle de repos
- Mode sombre et mode clair (les chirurgiens opèrent dans des salles sombres, il faut un bon contraste)

### Module 2 — Gestion des annulations et remplacement

- Détection automatique des créneaux annulés
- Matching intelligent : croisement spécialité × disponibilité chirurgien × patient en attente × matériel disponible × anesthésiste disponible
- Notifications par email, SMS et push mobile
- Confirmation en un clic par le chirurgien
- Historique complet de chaque annulation (qui a annulé, quand, pourquoi, est-ce que le créneau a été remplacé)
- Tableau de suivi des délais de remplacement (< 2h, < 6h, < 24h, non remplacé)

### Module 3 — Statistiques et reporting

- Taux d'occupation par salle, par chirurgien, par spécialité, par jour de la semaine
- Taux d'annulation et taux de remplacement
- Temps moyen de rotation entre interventions (bio-nettoyage inclus)
- Comparaison inter-périodes (mois vs mois, trimestre vs trimestre)
- Benchmarking entre salles
- Export PDF, Excel et PowerPoint pour les comités de direction
- Dashboard personnalisable avec widgets drag & drop
- Envoi automatique d'un rapport hebdomadaire par email au directeur

### Module 4 — Gestion du matériel et de la stérilisation

- Inventaire du matériel par salle
- Suivi de la disponibilité des kits instrumentaux
- Alerte si le matériel nécessaire pour une intervention n'est pas disponible
- Intégration avec le service de stérilisation (statut de chaque kit : en cours, prêt, en réparation)

### Module 5 — Coordination des équipes

- Planning des anesthésistes avec matching automatique
- Planning des IBODE (infirmiers de bloc) avec gestion des compétences
- Planning du brancardage avec notification automatique 30 min avant l'intervention
- Gestion des gardes et astreintes

### Module 6 — Intégrations

- Connecteur DPI (Dossier Patient Informatisé) pour récupérer automatiquement les informations patient
- Connecteur Doctolib pour synchroniser les rendez-vous
- API ouverte pour connecter les logiciels tiers (GAP, GEF)
- Import/export HL7 FHIR pour interopérabilité

### Module 7 — App mobile

- Application native iOS et Android
- Consultation du planning
- Notifications push
- Acceptation des créneaux en un tap
- Fonctionne en mode hors-ligne (synchro quand le réseau revient)

---

## Contraintes non négociables

- **Hébergement HDS** certifié (pas de compromis)
- **Conformité RGPD santé** complète avec DPO désigné
- **Disponibilité 99,9%** — un bloc opératoire ne peut pas dépendre d'un outil qui tombe
- **Temps de chargement < 1 seconde** sur toutes les pages
- **Tests automatisés** avec couverture > 80%
- **Documentation technique** complète dès le jour 1
- **Accessibilité WCAG 2.1 AA** (obligations légales secteur public)
- **Multilingue** : français + anglais dès la V1 (pour les CHU avec des praticiens étrangers)

---

## Stack technique recommandée

- **Backend** : Python/Django ou Go (performance critique)
- **Frontend** : React + TypeScript
- **Mobile** : React Native ou Flutter
- **Base de données** : PostgreSQL + Redis pour le cache
- **Infra** : Kubernetes sur OVH Health ou Scaleway SecNumCloud
- **CI/CD** : GitHub Actions + ArgoCD
- **Monitoring** : Datadog + PagerDuty

---

## Planning cible

| Phase | Durée | Livrable |
|-------|-------|----------|
| Cadrage & architecture | 3 semaines | Specs techniques, maquettes HD, choix infra |
| Développement core (modules 1-3) | 8 semaines | Planning + annulations + stats |
| Développement avancé (modules 4-5) | 6 semaines | Matériel + coordination équipes |
| Intégrations (module 6) | 4 semaines | DPI + Doctolib + HL7 |
| App mobile (module 7) | 4 semaines | iOS + Android |
| Tests, recette, sécurité | 3 semaines | Pentest, RGPD, UAT |
| Déploiement pilote | 2 semaines | Installation + formation |

**Durée totale : 30 semaines (~7 mois)**

---

## Budget estimé

Développement complet : **120 000 – 150 000 € HT**
(basé sur une équipe de 2-3 développeurs + 1 designer + 1 devops pendant 7 mois)

Hébergement HDS : ~400 €/mois
Licences et outils : ~300 €/mois

---

## Pourquoi c'est important de bien faire dès le début

On ne vend pas un gadget. On vend un outil qui impacte directement le parcours patient. Si le planning plante, des interventions sont annulées. Si les notifications ne partent pas, des créneaux sont perdus. Les établissements de santé n'ont pas la tolérance d'une startup B2C. Un bug, une lenteur, un crash — et on perd le client pour toujours.

Je refuse qu'on sorte un produit bancal. On a une seule chance de faire bonne impression.
