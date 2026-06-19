# Pilot pitch grader — founder_03_clinical / phase_2_pitch_mail

Module testé : `app/lib/pilotPitchScoring.ts` — fonction `scorePilotPitch`.

Seuil de passage CHU/Saint-Martin : **score ≥ 3 / 9**
Clinique : auto-pass sauf mail < 50 caractères, insulte, ou single word.

## Synthèse

| Métrique | Valeur |
|---|---|
| Mails testés | 28 |
| CHU accept | 16/28 (57%) |
| Saint-Martin accept | 16/28 (57%) |
| Clinique accept | 21/28 (75%) |
| Clinique GAME_OVER | 7/28 (25%) |
| Pivot CHU/SM → Clinique | 12/28 (43%) |
| Mismatches expected vs réel | 10 |

## Détail par mail

| ID | Label | Score /9 | CHU | Saint-Martin | Clinique |
|---|---|---|---|---|---|
| T01_excellent_full | Pitch parfait — tous les critères | 9 | ACCEPT | ACCEPT | ACCEPT |
| T02_good_pro | Bon mail professionnel — manque la gratuité explicite | 7 | ACCEPT | ACCEPT | ACCEPT |
| T03_mvp_polite_short | MVP mentionné + politesse — peu de keywords | 3 | ACCEPT | ACCEPT | ACCEPT |
| T04_value_only | Value prop OK mais ni gratuité ni HDS | 3 | ACCEPT | ACCEPT | ACCEPT |
| T05_data_focused | Data-centric, peu d'angle métier | 4 | ACCEPT | ACCEPT | ACCEPT |
| T06_long_but_vague | Long et poli mais aucun mot-clé technique | 2 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | ACCEPT |
| T07_short_pro_clinique | Court mais pro — adapté Clinique uniquement | 3 | ACCEPT | ACCEPT | ACCEPT |
| T08_one_word | Un mot — game over Clinique | 0 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | GAME_OVER |
| T09_empty | Mail vide | 0 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | GAME_OVER |
| T10_insult | Mail insulte — game over Clinique direct | 0 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | GAME_OVER |
| T11_insult_buried | Insulte cachée dans un long mail — clinique game over | 9 | ACCEPT | ACCEPT | GAME_OVER |
| T12_minimal_polite | Minimal mais poli ~80 chars — clinique pass | 1 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | ACCEPT |
| T13_perfect_long | Très long, parfait — passe partout | 9 | ACCEPT | ACCEPT | ACCEPT |
| T14_no_greeting | Sans politesse, content riche | 8 | ACCEPT | ACCEPT | ACCEPT |
| T15_only_greeting_signoff | Politesse seule, aucun contenu — trop court Clinique | 1 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | ACCEPT |
| T16_value_data_no_gratuit | Value + data sans gratuité | 6 | ACCEPT | ACCEPT | ACCEPT |
| T17_pitch_aggressive | Pitch commercial agressif — peu d'angles techniques | 0 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | ACCEPT |
| T18_english | Pitch en anglais — keywords ratent | 3 | ACCEPT | ACCEPT | ACCEPT |
| T19_pricing_only | Tarif sans contexte clinique | 4 | ACCEPT | ACCEPT | ACCEPT |
| T20_lorem_ipsum | Lorem ipsum — pas un vrai mail | 0 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | ACCEPT |
| T21_short_insult_chu | Court + insulte — game over Clinique, pivot CHU/SM | 0 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | GAME_OVER |
| T22_only_keyword_spam | Keyword stuffing sans phrase — passe sur tout | 7 | ACCEPT | ACCEPT | ACCEPT |
| T23_realistic_first_attempt | Vrai mail premier essai d'un user normal | 9 | ACCEPT | ACCEPT | ACCEPT |
| T24_short_polite_45chars | Poli mais < 50 chars — game over Clinique | 2 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | GAME_OVER |
| T25_one_long_word | Un seul long mot non-insulte > 15 chars | 1 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | GAME_OVER |
| T26_threshold_exact | Pile au seuil — gratuité + value (2+2=4 → pass) | 5 | ACCEPT | ACCEPT | ACCEPT |
| T27_just_under | Juste sous le seuil — value seule + length (2+1=3 → pass) | 3 | ACCEPT | ACCEPT | ACCEPT |
| T28_two_low_categories | Duration + length sans value — score 2 | 2 | PIVOT_TO_CLINIQUE | PIVOT_TO_CLINIQUE | ACCEPT |

## Décomposition score (CHU)

Catégories (max entre parenthèses) : gratuit (2), valueProp (2), data (2), duration (1), length (1), politeness (1).

| ID | Gratuit | ValueProp | Data | Duration | Length | Politeness | Total |
|---|---|---|---|---|---|---|---|
| T01_excellent_full | 2 | 2 | 2 | 1 | 1 | 1 | **9** |
| T02_good_pro | 0 | 2 | 2 | 1 | 1 | 1 | **7** |
| T03_mvp_polite_short | 0 | 0 | 0 | 1 | 1 | 1 | **3** |
| T04_value_only | 0 | 2 | 0 | 0 | 1 | 0 | **3** |
| T05_data_focused | 0 | 0 | 2 | 0 | 1 | 1 | **4** |
| T06_long_but_vague | 0 | 0 | 0 | 0 | 1 | 1 | **2** |
| T07_short_pro_clinique | 2 | 0 | 0 | 1 | 0 | 0 | **3** |
| T08_one_word | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| T09_empty | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| T10_insult | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| T11_insult_buried | 2 | 2 | 2 | 1 | 1 | 1 | **9** |
| T12_minimal_polite | 0 | 0 | 0 | 1 | 0 | 0 | **1** |
| T13_perfect_long | 2 | 2 | 2 | 1 | 1 | 1 | **9** |
| T14_no_greeting | 2 | 2 | 2 | 1 | 1 | 0 | **8** |
| T15_only_greeting_signoff | 0 | 0 | 0 | 0 | 0 | 1 | **1** |
| T16_value_data_no_gratuit | 0 | 2 | 2 | 0 | 1 | 1 | **6** |
| T17_pitch_aggressive | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| T18_english | 0 | 0 | 2 | 0 | 1 | 0 | **3** |
| T19_pricing_only | 2 | 0 | 0 | 1 | 0 | 1 | **4** |
| T20_lorem_ipsum | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| T21_short_insult_chu | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| T22_only_keyword_spam | 2 | 2 | 2 | 1 | 0 | 0 | **7** |
| T23_realistic_first_attempt | 2 | 2 | 2 | 1 | 1 | 1 | **9** |
| T24_short_polite_45chars | 0 | 0 | 0 | 1 | 0 | 1 | **2** |
| T25_one_long_word | 0 | 0 | 0 | 0 | 0 | 1 | **1** |
| T26_threshold_exact | 2 | 2 | 0 | 0 | 0 | 1 | **5** |
| T27_just_under | 0 | 2 | 0 | 0 | 1 | 0 | **3** |
| T28_two_low_categories | 0 | 0 | 0 | 1 | 1 | 0 | **2** |

## Reasoning détail

### T01_excellent_full — Pitch parfait — tous les critères

> Bonjour Madame, Monsieur le Docteur,
> 
> Je me permets de vous contacter pour vous proposer un test pilote
> GRATUIT de notre solution Orisio sur une durée de 8 semaines.
> 
> Orisio aide à optimiser l'occupation des blocs opératoires : gestion
> des créneaux, planning, et réduction des annulations en bout de chaîne.
> 
> Hébergement HDS certifié, conformité RGPD, données patient anonymisées.
> Pas de coût, pas d'engagement.
> 
> Bien cordialement,
> Matthieu Gasc

- **CHU** : ACCEPT — score 9/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 9/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T02_good_pro — Bon mail professionnel — manque la gratuité explicite

> Bonjour Docteur,
> 
> Nous proposons un POC de 2 mois pour optimiser le planning de vos
> blocs opératoires. Hébergement HDS, conformité RGPD. La solution est
> intégrée à DxCare.
> 
> Cordialement,
> Matthieu

- **CHU** : ACCEPT — score 7/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 7/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T03_mvp_polite_short — MVP mentionné + politesse — peu de keywords

> Bonjour Docteur Lemaire,
> 
> Je sollicite votre établissement pour un essai pilote de notre MVP.
> Nous restons à disposition pour échanger.
> 
> Cordialement,
> Matthieu Gasc — Orisio

- **CHU** : ACCEPT — score 3/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 3/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct
- ⚠ Mismatches: chu: expected PIVOT_TO_CLINIQUE, got ACCEPT, saint_martin: expected PIVOT_TO_CLINIQUE, got ACCEPT

### T04_value_only — Value prop OK mais ni gratuité ni HDS

> Bonjour, nous aidons les blocs opératoires à optimiser leur
> occupation et à réduire les annulations grâce à un meilleur planning.
> La coordination devient plus simple, les créneaux sont mieux remplis.
> Avez-vous 30 minutes ?

- **CHU** : ACCEPT — score 3/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 3/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct
- ⚠ Mismatches: chu: expected PIVOT_TO_CLINIQUE, got ACCEPT, saint_martin: expected PIVOT_TO_CLINIQUE, got ACCEPT

### T05_data_focused — Data-centric, peu d'angle métier

> Bonjour,
> 
> Notre solution est hébergée chez OVH HDS, conforme RGPD, avec
> chiffrement AES-256 et anonymisation patient au niveau du stockage.
> Souveraineté des données garantie.
> 
> Cordialement.

- **CHU** : ACCEPT — score 4/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 4/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T06_long_but_vague — Long et poli mais aucun mot-clé technique

> Bonjour Madame, Monsieur,
> 
> Je me permets de vous écrire au nom de notre jeune start-up qui
> développe une solution destinée aux établissements de santé. Nous
> sommes convaincus que notre approche apportera de la valeur. Nous
> serions ravis de pouvoir vous rencontrer pour vous en dire plus,
> échanger sur vos contraintes, et voir si notre solution peut
> correspondre à votre établissement.
> 
> Bien à vous, Matthieu

- **CHU** : PIVOT_TO_CLINIQUE — score 2/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 2/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T07_short_pro_clinique — Court mais pro — adapté Clinique uniquement

> Bonjour Dr Renaud-Picard, j'aimerais vous proposer un test pilote gratuit.

- **CHU** : ACCEPT — score 3/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 3/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct
- ⚠ Mismatches: chu: expected PIVOT_TO_CLINIQUE, got ACCEPT, saint_martin: expected PIVOT_TO_CLINIQUE, got ACCEPT

### T08_one_word — Un mot — game over Clinique

> Bonjour

- **CHU** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : GAME_OVER — mail trop court (7<50) → clinique refuse

### T09_empty — Mail vide

> 

- **CHU** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : GAME_OVER — mail trop court (0<50) → clinique refuse

### T10_insult — Mail insulte — game over Clinique direct

> pénis

- **CHU** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : GAME_OVER — mail trop court (5<50) → clinique refuse

### T11_insult_buried — Insulte cachée dans un long mail — clinique game over

> Bonjour Docteur,
> 
> J'ai longtemps hésité avant de vous écrire ce mail, mais je voulais
> vraiment vous proposer cette opportunité. Putain c'est dur d'écrire
> des mails de prospection sans relâche. Mais bon, voici l'offre :
> test pilote gratuit, 8 semaines, HDS, conforme RGPD, planning bloc
> optimisé.
> 
> Cordialement,
> Matthieu

- **CHU** : ACCEPT — score 9/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 9/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : GAME_OVER — insulte/grossièreté détectée → clinique refuse

### T12_minimal_polite — Minimal mais poli ~80 chars — clinique pass

> Bonjour Dr Renaud-Picard, je souhaite vous proposer un test pilote pour notre solution.

- **CHU** : PIVOT_TO_CLINIQUE — score 1/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 1/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T13_perfect_long — Très long, parfait — passe partout

> Bonjour Docteur Lemaire,
> 
> Je me permets de vous solliciter au sujet d'une proposition de test
> pilote GRATUIT (sans engagement, à nos frais) de notre solution
> Orisio, conçue spécifiquement pour la gestion et l'optimisation de
> l'occupation des blocs opératoires.
> 
> Concrètement, nous adressons trois grandes douleurs :
> - la fragmentation des plannings et l'effet d'annulation en cascade
> - la coordination entre cadres de bloc, anesthésistes et chirurgiens
> - la traçabilité réglementaire (RGPD, HAS) sur les créneaux et la
>   gestion des consentements
> 
> Sur le plan technique, Orisio est hébergé chez un partenaire HDS
> certifié (OVHcloud Healthcare), avec chiffrement AES-256,
> anonymisation patient et conformité RGPD complète. Nous intégrons
> DxCare via HL7 v2.
> 
> La durée proposée est de 2 mois (8 semaines), avec mise en service
> en 2 semaines et bilan en fin de pilote. Pas de coût pour vous,
> pas d'engagement à l'issue.
> 
> Auriez-vous 30 minutes la semaine prochaine pour un échange ?
> 
> Bien cordialement,
> Matthieu Gasc — co-fondateur Orisio

- **CHU** : ACCEPT — score 9/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 9/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T14_no_greeting — Sans politesse, content riche

> Nous proposons un test pilote gratuit 8 semaines pour optimiser
> le planning bloc opératoire. Hébergement HDS, conformité RGPD. Sans
> engagement. Intégration DxCare.

- **CHU** : ACCEPT — score 8/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 8/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T15_only_greeting_signoff — Politesse seule, aucun contenu — trop court Clinique

> Bonjour Madame, Monsieur le Docteur, cordialement, à votre
> disposition pour échanger. Bien à vous.

- **CHU** : PIVOT_TO_CLINIQUE — score 1/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 1/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T16_value_data_no_gratuit — Value + data sans gratuité

> Bonjour Docteur,
> 
> Notre solution permet d'améliorer la gestion et l'occupation des
> créneaux du bloc opératoire, en réduisant les annulations. Hébergée
> HDS, conforme RGPD, anonymisation patient.
> 
> Cordialement,
> Matthieu

- **CHU** : ACCEPT — score 6/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 6/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T17_pitch_aggressive — Pitch commercial agressif — peu d'angles techniques

> BONJOUR DOCTEUR ! Achetez Orisio MAINTENANT ! Promo exceptionnelle
> pour les 3 premiers établissements ! Productivité × 3 garantie ! Click ici !

- **CHU** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T18_english — Pitch en anglais — keywords ratent

> Hello Doctor,
> 
> We provide a free 8-week pilot of our operating-room scheduling
> solution. HDS compliant hosting, GDPR. No commitment.
> 
> Best regards,
> Matthieu

- **CHU** : ACCEPT — score 3/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 3/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct
- ⚠ Mismatches: chu: expected PIVOT_TO_CLINIQUE, got ACCEPT, saint_martin: expected PIVOT_TO_CLINIQUE, got ACCEPT

### T19_pricing_only — Tarif sans contexte clinique

> Bonjour,
> 
> Notre solution coûte 1 800€/salle/an. Pilote gratuit possible sur
> 8 semaines. Cordialement.

- **CHU** : ACCEPT — score 4/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 4/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct
- ⚠ Mismatches: chu: expected PIVOT_TO_CLINIQUE, got ACCEPT, saint_martin: expected PIVOT_TO_CLINIQUE, got ACCEPT

### T20_lorem_ipsum — Lorem ipsum — pas un vrai mail

> Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
> eiusmod tempor incididunt ut labore et dolore magna aliqua.

- **CHU** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T21_short_insult_chu — Court + insulte — game over Clinique, pivot CHU/SM

> Bordel de merde

- **CHU** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 0/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : GAME_OVER — mail trop court (15<50) → clinique refuse

### T22_only_keyword_spam — Keyword stuffing sans phrase — passe sur tout

> pilote gratuit HDS RGPD planning bloc opératoire optimiser
> créneau annulation sans engagement 8 semaines durée test POC MVP

- **CHU** : ACCEPT — score 7/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 7/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T23_realistic_first_attempt — Vrai mail premier essai d'un user normal

> Bonjour Docteur Lemaire,
> 
> Je suis Matthieu Gasc, fondateur d'Orisio. Suite à notre échange
> téléphonique de la semaine dernière, je vous propose un test pilote
> gratuit de notre solution sur 8 semaines, pour évaluer l'optimisation
> du planning de vos blocs.
> 
> Notre solution est hébergée en HDS, conforme RGPD.
> 
> Disponible pour un point la semaine prochaine.
> 
> Bien cordialement,
> Matthieu

- **CHU** : ACCEPT — score 9/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 9/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T24_short_polite_45chars — Poli mais < 50 chars — game over Clinique

> Bonjour, on peut faire un test ? Cordialement.

- **CHU** : PIVOT_TO_CLINIQUE — score 2/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 2/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : GAME_OVER — mail trop court (46<50) → clinique refuse

### T25_one_long_word — Un seul long mot non-insulte > 15 chars

> bonjouravousbiencordialement

- **CHU** : PIVOT_TO_CLINIQUE — score 1/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 1/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : GAME_OVER — mail trop court (28<50) → clinique refuse

### T26_threshold_exact — Pile au seuil — gratuité + value (2+2=4 → pass)

> Bonjour, proposition gratuite : optimiser le planning du bloc
> opératoire. Cordialement.

- **CHU** : ACCEPT — score 5/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 5/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T27_just_under — Juste sous le seuil — value seule + length (2+1=3 → pass)

> Bonjour Docteur. Notre solution améliore le planning bloc et
> l'occupation des salles avec une gestion optimisée des créneaux. À
> disposition pour un échange.

- **CHU** : ACCEPT — score 3/9 ≥ 3 → CHU accepte
- **Saint-Martin** : ACCEPT — score 3/9 ≥ 3 → SAINT_MARTIN accepte
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

### T28_two_low_categories — Duration + length sans value — score 2

> Salut, on bosse sur un MVP de pilote 8 semaines, on prend du
> recul pendant la durée du test. Quelques semaines à voir tout ce
> que ça donne avec vous. Et on en discute.

- **CHU** : PIVOT_TO_CLINIQUE — score 2/9 < 3 → CHU refuse, Alex pivote sur Clinique
- **Saint-Martin** : PIVOT_TO_CLINIQUE — score 2/9 < 3 → SAINT_MARTIN refuse, Alex pivote sur Clinique
- **Clinique** : ACCEPT — clinique = filet de sécurité, mail non cassé → accepté direct

## Keywords utilisés

- **gratuit** : `gratuit`, `sans engagement`, `offert`, `sans frais`, `aucun coût`, `0 €`, `0€`, `à nos frais`, `pas de coût`
- **valueProp** : `planning`, `bloc`, `opératoire`, `annulation`, `créneau`, `optimis`, `gestion`, `occupation`, `rotation`, `fluidifier`, `coordination`, `salles`
- **data** : `données`, `hds`, `hébergement`, `certifié`, `patient`, `sécurité`, `rgpd`, `confidentiel`, `souveraineté`, `anonymis`, `chiffrement`
- **duration** : `8 semaines`, `deux mois`, `2 mois`, `semaines`, `durée`, `pilote`, `test`, `poc`, `essai`, `expérimentation`, `mvp`
- **greeting** : `bonjour`, `madame`, `monsieur`, `docteur`, `cher`, `chère`
- **signoff** : `cordialement`, `bien à vous`, `respectueusement`, `salutations`, `à disposition`

Insult regex : `/\\b(p[éeè]nis|merde|putain|connard|salope|nique|encul[eé]|nul à chier|caca|pipi|fuck|shit|bordel)\\b/i`