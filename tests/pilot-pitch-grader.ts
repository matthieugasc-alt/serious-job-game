#!/usr/bin/env npx ts-node
/**
 * Offline grader for the S3 (founder_03_clinical) pilot pitch.
 *
 * Runs ~30 representative mail drafts through the SAME scoring logic
 * the live engine uses (app/lib/pilotPitchScoring.ts), against each
 * of the 3 establishments (CHU de Bordeaux, Hôpital Saint-Martin,
 * Clinique Saint-Augustin). Prints a table + writes a markdown report
 * to /tmp/pilot_pitch_report.md.
 *
 * Run:
 *   cd serious-job-game
 *   npx tsx tests/pilot-pitch-grader.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  scorePilotPitch,
  KEYWORDS,
  type PitchTarget,
  type PitchScoringResult,
} from "../app/lib/pilotPitchScoring";

// ── Test cases ────────────────────────────────────────────────────────
// Each case: id, expected_outcome (per target), short label, body.
// expected_outcome values: "ACCEPT" | "PIVOT_TO_CLINIQUE" | "GAME_OVER".
//
// Note: "ACCEPT" on CHU/SM = the establishment itself accepts (good pitch).
// "PIVOT_TO_CLINIQUE" on CHU/SM = Alex saves the deal with the clinique.
// On the Clinique target only ACCEPT and GAME_OVER are reachable.

type Expected = Partial<Record<PitchTarget, PitchScoringResult["outcome"]>>;
type TestCase = { id: string; label: string; body: string; expected?: Expected };

const TESTS: TestCase[] = [
  {
    id: "T01_excellent_full",
    label: "Pitch parfait — tous les critères",
    body: `Bonjour Madame, Monsieur le Docteur,

Je me permets de vous contacter pour vous proposer un test pilote
GRATUIT de notre solution Orisio sur une durée de 8 semaines.

Orisio aide à optimiser l'occupation des blocs opératoires : gestion
des créneaux, planning, et réduction des annulations en bout de chaîne.

Hébergement HDS certifié, conformité RGPD, données patient anonymisées.
Pas de coût, pas d'engagement.

Bien cordialement,
Matthieu Gasc`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T02_good_pro",
    label: "Bon mail professionnel — manque la gratuité explicite",
    body: `Bonjour Docteur,

Nous proposons un POC de 2 mois pour optimiser le planning de vos
blocs opératoires. Hébergement HDS, conformité RGPD. La solution est
intégrée à DxCare.

Cordialement,
Matthieu`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T03_mvp_polite_short",
    label: "MVP mentionné + politesse — peu de keywords",
    body: `Bonjour Docteur Lemaire,

Je sollicite votre établissement pour un essai pilote de notre MVP.
Nous restons à disposition pour échanger.

Cordialement,
Matthieu Gasc — Orisio`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T04_value_only",
    label: "Value prop OK mais ni gratuité ni HDS",
    body: `Bonjour, nous aidons les blocs opératoires à optimiser leur
occupation et à réduire les annulations grâce à un meilleur planning.
La coordination devient plus simple, les créneaux sont mieux remplis.
Avez-vous 30 minutes ?`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T05_data_focused",
    label: "Data-centric, peu d'angle métier",
    body: `Bonjour,

Notre solution est hébergée chez OVH HDS, conforme RGPD, avec
chiffrement AES-256 et anonymisation patient au niveau du stockage.
Souveraineté des données garantie.

Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T06_long_but_vague",
    label: "Long et poli mais aucun mot-clé technique",
    body: `Bonjour Madame, Monsieur,

Je me permets de vous écrire au nom de notre jeune start-up qui
développe une solution destinée aux établissements de santé. Nous
sommes convaincus que notre approche apportera de la valeur. Nous
serions ravis de pouvoir vous rencontrer pour vous en dire plus,
échanger sur vos contraintes, et voir si notre solution peut
correspondre à votre établissement.

Bien à vous, Matthieu`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T07_short_pro_clinique",
    label: "Court mais pro — adapté Clinique uniquement",
    body: `Bonjour Dr Renaud-Picard, j'aimerais vous proposer un test pilote gratuit.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T08_one_word",
    label: "Un mot — game over Clinique",
    body: `Bonjour`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T09_empty",
    label: "Mail vide",
    body: ``,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T10_insult",
    label: "Mail insulte — game over Clinique direct",
    body: `pénis`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T11_insult_buried",
    label: "Insulte cachée dans un long mail — clinique game over",
    body: `Bonjour Docteur,

J'ai longtemps hésité avant de vous écrire ce mail, mais je voulais
vraiment vous proposer cette opportunité. Putain c'est dur d'écrire
des mails de prospection sans relâche. Mais bon, voici l'offre :
test pilote gratuit, 8 semaines, HDS, conforme RGPD, planning bloc
optimisé.

Cordialement,
Matthieu`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "GAME_OVER" },
  },
  {
    id: "T12_minimal_polite",
    label: "Minimal mais poli ~80 chars — clinique pass",
    body: `Bonjour Dr Renaud-Picard, je souhaite vous proposer un test pilote pour notre solution.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T13_perfect_long",
    label: "Très long, parfait — passe partout",
    body: `Bonjour Docteur Lemaire,

Je me permets de vous solliciter au sujet d'une proposition de test
pilote GRATUIT (sans engagement, à nos frais) de notre solution
Orisio, conçue spécifiquement pour la gestion et l'optimisation de
l'occupation des blocs opératoires.

Concrètement, nous adressons trois grandes douleurs :
- la fragmentation des plannings et l'effet d'annulation en cascade
- la coordination entre cadres de bloc, anesthésistes et chirurgiens
- la traçabilité réglementaire (RGPD, HAS) sur les créneaux et la
  gestion des consentements

Sur le plan technique, Orisio est hébergé chez un partenaire HDS
certifié (OVHcloud Healthcare), avec chiffrement AES-256,
anonymisation patient et conformité RGPD complète. Nous intégrons
DxCare via HL7 v2.

La durée proposée est de 2 mois (8 semaines), avec mise en service
en 2 semaines et bilan en fin de pilote. Pas de coût pour vous,
pas d'engagement à l'issue.

Auriez-vous 30 minutes la semaine prochaine pour un échange ?

Bien cordialement,
Matthieu Gasc — co-fondateur Orisio`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T14_no_greeting",
    label: "Sans politesse, content riche",
    body: `Nous proposons un test pilote gratuit 8 semaines pour optimiser
le planning bloc opératoire. Hébergement HDS, conformité RGPD. Sans
engagement. Intégration DxCare.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T15_only_greeting_signoff",
    label: "Politesse seule, aucun contenu — trop court Clinique",
    body: `Bonjour Madame, Monsieur le Docteur, cordialement, à votre
disposition pour échanger. Bien à vous.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T16_value_data_no_gratuit",
    label: "Value + data sans gratuité",
    body: `Bonjour Docteur,

Notre solution permet d'améliorer la gestion et l'occupation des
créneaux du bloc opératoire, en réduisant les annulations. Hébergée
HDS, conforme RGPD, anonymisation patient.

Cordialement,
Matthieu`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T17_pitch_aggressive",
    label: "Pitch commercial agressif — peu d'angles techniques",
    body: `BONJOUR DOCTEUR ! Achetez Orisio MAINTENANT ! Promo exceptionnelle
pour les 3 premiers établissements ! Productivité × 3 garantie ! Click ici !`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T18_english",
    label: "Pitch en anglais — keywords ratent",
    body: `Hello Doctor,

We provide a free 8-week pilot of our operating-room scheduling
solution. HDS compliant hosting, GDPR. No commitment.

Best regards,
Matthieu`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T19_pricing_only",
    label: "Tarif sans contexte clinique",
    body: `Bonjour,

Notre solution coûte 1 800€/salle/an. Pilote gratuit possible sur
8 semaines. Cordialement.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T20_lorem_ipsum",
    label: "Lorem ipsum — pas un vrai mail",
    body: `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T21_short_insult_chu",
    label: "Court + insulte — game over Clinique, pivot CHU/SM",
    body: `Bordel de merde`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T22_only_keyword_spam",
    label: "Keyword stuffing sans phrase — passe sur tout",
    body: `pilote gratuit HDS RGPD planning bloc opératoire optimiser
créneau annulation sans engagement 8 semaines durée test POC MVP`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T23_realistic_first_attempt",
    label: "Vrai mail premier essai d'un user normal",
    body: `Bonjour Docteur Lemaire,

Je suis Matthieu Gasc, fondateur d'Orisio. Suite à notre échange
téléphonique de la semaine dernière, je vous propose un test pilote
gratuit de notre solution sur 8 semaines, pour évaluer l'optimisation
du planning de vos blocs.

Notre solution est hébergée en HDS, conforme RGPD.

Disponible pour un point la semaine prochaine.

Bien cordialement,
Matthieu`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T24_short_polite_45chars",
    label: "Poli mais < 50 chars — game over Clinique",
    body: `Bonjour, on peut faire un test ? Cordialement.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T25_one_long_word",
    label: "Un seul long mot non-insulte > 15 chars",
    body: `bonjouravousbiencordialement`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T26_threshold_exact",
    label: "Pile au seuil — gratuité + value (2+2=4 → pass)",
    body: `Bonjour, proposition gratuite : optimiser le planning du bloc
opératoire. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T27_just_under",
    label: "Juste sous le seuil — value seule + length (2+1=3 → pass)",
    body: `Bonjour Docteur. Notre solution améliore le planning bloc et
l'occupation des salles avec une gestion optimisée des créneaux. À
disposition pour un échange.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T28_two_low_categories",
    label: "Duration + length sans value — score 2",
    body: `Salut, on bosse sur un MVP de pilote 8 semaines, on prend du
recul pendant la durée du test. Quelques semaines à voir tout ce
que ça donne avec vous. Et on en discute.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },

  // ── Persona-driven variants ──────────────────────────────────────
  {
    id: "T29_debutant_naive",
    label: "Débutant naïf — enthousiaste, peu de structure",
    body: `Bonjour ! Je m'appelle Matthieu et j'ai créé une super
application pour les hôpitaux. C'est trop cool, je pense que ça
peut vraiment vous aider. Est-ce qu'on peut se voir pour en
discuter ?`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T30_ingenieur_aride",
    label: "Ingénieur — tech-only, zéro contexte clinique",
    body: `Bonjour, notre stack est composée de Next.js + PostgreSQL,
hébergée sur OVH HDS, conforme RGPD. Architecture event-driven,
API REST avec OpenAPI 3, SSO via SAML. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T31_business_school",
    label: "Business-school — buzzwords, peu de fond",
    body: `Bonjour Docteur, nous proposons une solution disruptive et
scalable, leveraging notre proposition de valeur unique pour
optimiser votre time-to-market et booster vos KPIs critiques.
Cordialement, Matthieu (MBA HEC).`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T32_juridique_lourd",
    label: "Juridique-lourd — full conformité, pas de valeur",
    body: `Madame, Monsieur,

Nous attirons votre attention sur la solution Orisio, conforme au
RGPD, hébergée chez un certifié HDS, avec chiffrement AES-256 et
souveraineté des données patient (anonymisation systématique).

Bien cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T33_chu_specifique",
    label: "Mail spécifiquement adapté au CHU (Pellegrin)",
    body: `Bonjour Docteur Lemaire,

Faisant suite à notre échange aux JFR, je vous propose un test
pilote gratuit de 8 semaines, sur le service de chirurgie
orthopédique. Notre solution est hébergée HDS, conforme RGPD,
et permet d'optimiser l'occupation des créneaux de bloc.

Bien cordialement,
Matthieu Gasc`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T34_sm_specifique",
    label: "Mail spécifiquement adapté à Saint-Martin (Ramsay)",
    body: `Bonjour M. Castex,

Suite à la recommandation de votre directeur médical, je vous
propose un test pilote gratuit pour fluidifier la coordination
de votre bloc orthopédie. Pilote 8 semaines, hébergé HDS,
conforme RGPD.

Cordialement, Matthieu Gasc`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T35_mismatch_tofield",
    label: "Mail à la Clinique mais on mentionne CHU dans le body",
    body: `Bonjour Dr Renaud-Picard,

Le CHU de Bordeaux nous a refusés mais nous aimerions vous
proposer le même pilote : 8 semaines gratuites, HDS, planning
bloc opératoire optimisé.

Bien cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T36_one_sentence_polite",
    label: "Une phrase polie complète — au-dessus du seuil clinique",
    body: `Bonjour Docteur, je sollicite votre établissement pour un
test pilote gratuit, 8 semaines, hébergement HDS. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T37_emoji_only",
    label: "Émojis sans texte — game over Clinique",
    body: `🚀✨💊🏥👨‍⚕️📊`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T38_50_chars_exactly",
    label: "Pile 50 caractères — Clinique passe (limite)",
    body: `bonjour je propose un test pilote a votre etabl`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T39_49_chars",
    label: "Pile 49 caractères — Clinique game over (limite)",
    body: `bonjour je propose un test pilote a votre etab`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T40_lots_of_whitespace",
    label: "Espaces et retours à la ligne — counts on trim",
    body: `

   Bonjour


    Cordialement   `,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "GAME_OVER" },
  },
  {
    id: "T41_only_value_words",
    label: "Que des keywords value, sans phrase",
    body: `planning bloc opératoire annulation créneau optimiser
gestion occupation rotation fluidifier coordination salles`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T42_html_tags_in_body",
    label: "HTML brut dans le body — keywords matchent quand même",
    body: `<p>Bonjour Docteur,</p>
<p>Notre solution Orisio (HDS, RGPD) propose un pilote gratuit
8 semaines pour optimiser le planning bloc opératoire.</p>
<p>Cordialement, Matthieu</p>`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T43_signature_riche",
    label: "Signature riche, contenu pauvre",
    body: `Bonjour Docteur.

Cordialement,
Matthieu Gasc
CEO Orisio · Bordeaux
+33 6 12 34 56 78
matthieu@orisio.fr`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T44_3_paragraphes_perfect",
    label: "3 paragraphes professionnels — passe partout",
    body: `Bonjour Docteur Lemaire,

Suite à votre intervention aux JCO sur la gestion des blocs
opératoires en oncologie, je me permets de vous proposer un
test pilote GRATUIT de notre solution Orisio.

Orisio optimise l'occupation des blocs, réduit les annulations
et fluidifie la coordination. Hébergement HDS certifié, RGPD,
chiffrement AES-256. Pilote 8 semaines, sans engagement.

Bien cordialement,
Matthieu Gasc — Orisio`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T45_question_only",
    label: "Que des questions — pas de pitch",
    body: `Bonjour Docteur, est-ce que vous seriez intéressé par une
discussion sur l'optimisation de vos process ? Cordialement.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T46_chu_personnalise_min",
    label: "Pitch personnalisé CHU mais minimal",
    body: `Cher Docteur Lemaire, le CHU de Bordeaux Pellegrin est notre
priorité. Pilote gratuit 8 semaines, HDS, RGPD. Optimisation
planning bloc opératoire. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T47_alex_referal",
    label: "Référence à Alexandre — leverage du réseau",
    body: `Bonjour Dr Renaud-Picard,

Alexandre Morel m'a recommandé de vous contacter. Nous
proposons un test pilote gratuit (8 semaines) pour fluidifier
la coordination de votre bloc.

Bien cordialement,
Matthieu`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T48_repeat_keyword",
    label: "Spam keyword × 10 — passe le scoring",
    body: `gratuit gratuit gratuit gratuit gratuit gratuit gratuit
gratuit gratuit gratuit gratuit gratuit gratuit gratuit gratuit
gratuit gratuit gratuit gratuit gratuit gratuit gratuit gratuit`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T49_caps_aggressive",
    label: "Tout en majuscules — keywords detected (case-insensitive)",
    body: `BONJOUR DOCTEUR, NOUS PROPOSONS UN PILOTE GRATUIT DE
8 SEMAINES POUR OPTIMISER LE PLANNING DU BLOC OPÉRATOIRE.
HÉBERGEMENT HDS. CORDIALEMENT.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T50_passive_aggressive",
    label: "Passif-agressif — pas d'insulte, accept clinique",
    body: `Bonjour, j'imagine que vous êtes très occupé pour répondre
mais bon, je tente quand même. On vous propose un truc, voilà.
Cordialement.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T51_polite_data_short",
    label: "Poli + data, court — limite Clinique passe",
    body: `Bonjour Docteur, notre solution est HDS et RGPD compliant.
Cordialement, Matthieu Gasc.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T52_buzzword_no_health",
    label: "Buzzword tech sans angle santé — passe clinique uniquement",
    body: `Bonjour, nous sommes une scale-up disruptive qui leverage
l'IA générative pour booster la productivité de vos équipes.
Cordialement.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T53_pricing_negotiation_attempt",
    label: "Tente de négocier prix avant pilote",
    body: `Bonjour, on facture 1800€/salle/an mais on peut faire un
geste pour vous : 1200€/salle/an + pilote gratuit 8 semaines.
HDS, RGPD. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T54_super_long_garbage",
    label: "Très long mais charabia — pas de keywords",
    body: `Bonjour à vous chère personne. Je vous écris ce mail
parce que. Voilà voilà voilà voilà voilà voilà voilà voilà voilà
voilà voilà voilà voilà voilà voilà voilà voilà voilà voilà voilà
voilà voilà voilà voilà voilà voilà voilà voilà voilà voilà voilà.
Au revoir.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T55_emoji_with_text",
    label: "Émojis + texte court professionnel",
    body: `Bonjour Docteur 👨‍⚕️, je vous propose un test pilote gratuit
🚀 de 8 semaines pour optimiser votre planning bloc. HDS
compliant ✅. Cordialement 🙏`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "ACCEPT" },
  },
  {
    id: "T56_typos_lourds",
    label: "Mail plein de fautes — keywords matchent quand même",
    body: `Bonjr Doctuer, je vous proppose un test piloite gratuite
de 8 semanes pour le planning du bloc opperatoire. HDS et
RGPDD. Cordailmnt.`,
    expected: { chu: "PIVOT_TO_CLINIQUE", saint_martin: "PIVOT_TO_CLINIQUE", clinique: "ACCEPT" },
  },
  {
    id: "T57_insult_with_accent",
    label: "Insulte accentuée 'pénis' — game over",
    body: `Bonjour Docteur, j'avais envie de vous dire pénis. Pilote
gratuit 8 semaines bloc opératoire HDS RGPD. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "GAME_OVER" },
  },
  {
    id: "T58_insult_variant",
    label: "Insulte 'enculé' — game over Clinique",
    body: `Bonjour Docteur. Je vous propose un test pilote gratuit
8 semaines bloc opératoire HDS RGPD. Vous allez voir, c'est
enculé comme solution. Cordialement.`,
    expected: { chu: "ACCEPT", saint_martin: "ACCEPT", clinique: "GAME_OVER" },
  },
];

// ── Runner ────────────────────────────────────────────────────────────

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

function tag(o: PitchScoringResult["outcome"]): string {
  return o === "ACCEPT"
    ? "✅ ACCEPT"
    : o === "PIVOT_TO_CLINIQUE"
      ? "🔁 PIVOT"
      : "💀 GAMEOVER";
}

function run() {
  const targets: PitchTarget[] = ["chu", "saint_martin", "clinique"];
  const rows: Array<{
    test: TestCase;
    results: Record<PitchTarget, PitchScoringResult>;
    mismatches: string[];
  }> = [];

  console.log("\n────────────────────────────────────────────────────────────────────────────────");
  console.log("  PILOT PITCH GRADER — founder_03_clinical / phase_2_pitch_mail");
  console.log("────────────────────────────────────────────────────────────────────────────────\n");

  for (const t of TESTS) {
    const results: Record<PitchTarget, PitchScoringResult> = {
      chu: scorePilotPitch(t.body, "chu"),
      saint_martin: scorePilotPitch(t.body, "saint_martin"),
      clinique: scorePilotPitch(t.body, "clinique"),
    };
    const mismatches: string[] = [];
    if (t.expected) {
      for (const tg of targets) {
        const exp = t.expected[tg];
        if (exp && exp !== results[tg].outcome) {
          mismatches.push(`${tg}: expected ${exp}, got ${results[tg].outcome}`);
        }
      }
    }
    rows.push({ test: t, results, mismatches });
  }

  // Table console
  console.log(
    `${pad("ID", 8)} ${pad("Label", 50)} ${pad("CHU", 14)} ${pad("S-Martin", 14)} ${pad("Clinique", 14)} ${pad("Score", 8)}`,
  );
  console.log("─".repeat(120));
  for (const r of rows) {
    const sc = r.results.chu.score;
    const flag = r.mismatches.length > 0 ? " ⚠" : "";
    console.log(
      `${pad(r.test.id, 8)} ${pad(r.test.label, 50)} ${pad(tag(r.results.chu.outcome), 14)} ${pad(tag(r.results.saint_martin.outcome), 14)} ${pad(tag(r.results.clinique.outcome), 14)} ${pad(`${sc}/9`, 8)}${flag}`,
    );
  }

  // Mismatches detail
  const totalMismatches = rows.reduce((acc, r) => acc + r.mismatches.length, 0);
  if (totalMismatches > 0) {
    console.log("\n── EXPECTATION MISMATCHES ─────────────────────────────────────────────────────\n");
    for (const r of rows) {
      if (r.mismatches.length > 0) {
        console.log(`⚠ ${r.test.id} (${r.test.label}):`);
        for (const m of r.mismatches) console.log(`    ${m}`);
      }
    }
  } else {
    console.log("\n✅ All expectations match.\n");
  }

  // Stats
  const stats = {
    total: rows.length,
    chu_accept: rows.filter((r) => r.results.chu.outcome === "ACCEPT").length,
    sm_accept: rows.filter((r) => r.results.saint_martin.outcome === "ACCEPT").length,
    clinique_accept: rows.filter((r) => r.results.clinique.outcome === "ACCEPT").length,
    clinique_gameover: rows.filter((r) => r.results.clinique.outcome === "GAME_OVER").length,
    pivot: rows.filter((r) => r.results.chu.outcome === "PIVOT_TO_CLINIQUE").length,
  };
  const pct = (n: number) => `${Math.round((100 * n) / stats.total)}%`;
  console.log("── STATS ──────────────────────────────────────────────────────────────────────");
  console.log(`  Total mails:               ${stats.total}`);
  console.log(`  CHU accept rate:           ${stats.chu_accept}/${stats.total} (${pct(stats.chu_accept)})`);
  console.log(`  Saint-Martin accept rate:  ${stats.sm_accept}/${stats.total} (${pct(stats.sm_accept)})`);
  console.log(`  Clinique accept rate:      ${stats.clinique_accept}/${stats.total} (${pct(stats.clinique_accept)})`);
  console.log(`  Clinique GAME_OVER rate:   ${stats.clinique_gameover}/${stats.total} (${pct(stats.clinique_gameover)})`);
  console.log(`  Pivot rate (CHU/SM→Clin):  ${stats.pivot}/${stats.total} (${pct(stats.pivot)})`);

  // Markdown report
  const reportPath = path.join("/tmp", "pilot_pitch_report.md");
  const md: string[] = [];
  md.push(`# Pilot pitch grader — founder_03_clinical / phase_2_pitch_mail`);
  md.push(``);
  md.push(`Module testé : \`app/lib/pilotPitchScoring.ts\` — fonction \`scorePilotPitch\`.`);
  md.push(``);
  md.push(`Seuil de passage CHU/Saint-Martin : **score ≥ 3 / 9**`);
  md.push(`Clinique : auto-pass sauf mail < 50 caractères, insulte, ou single word.`);
  md.push(``);
  md.push(`## Synthèse`);
  md.push(``);
  md.push(`| Métrique | Valeur |`);
  md.push(`|---|---|`);
  md.push(`| Mails testés | ${stats.total} |`);
  md.push(`| CHU accept | ${stats.chu_accept}/${stats.total} (${pct(stats.chu_accept)}) |`);
  md.push(`| Saint-Martin accept | ${stats.sm_accept}/${stats.total} (${pct(stats.sm_accept)}) |`);
  md.push(`| Clinique accept | ${stats.clinique_accept}/${stats.total} (${pct(stats.clinique_accept)}) |`);
  md.push(`| Clinique GAME_OVER | ${stats.clinique_gameover}/${stats.total} (${pct(stats.clinique_gameover)}) |`);
  md.push(`| Pivot CHU/SM → Clinique | ${stats.pivot}/${stats.total} (${pct(stats.pivot)}) |`);
  md.push(`| Mismatches expected vs réel | ${totalMismatches} |`);
  md.push(``);
  md.push(`## Détail par mail`);
  md.push(``);
  md.push(`| ID | Label | Score /9 | CHU | Saint-Martin | Clinique |`);
  md.push(`|---|---|---|---|---|---|`);
  for (const r of rows) {
    md.push(
      `| ${r.test.id} | ${r.test.label} | ${r.results.chu.score} | ${r.results.chu.outcome} | ${r.results.saint_martin.outcome} | ${r.results.clinique.outcome} |`,
    );
  }
  md.push(``);
  md.push(`## Décomposition score (CHU)`);
  md.push(``);
  md.push(`Catégories (max entre parenthèses) : gratuit (2), valueProp (2), data (2), duration (1), length (1), politeness (1).`);
  md.push(``);
  md.push(`| ID | Gratuit | ValueProp | Data | Duration | Length | Politeness | Total |`);
  md.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    const b = r.results.chu.breakdown;
    md.push(
      `| ${r.test.id} | ${b.gratuit} | ${b.valueProp} | ${b.data} | ${b.duration} | ${b.length} | ${b.politeness} | **${r.results.chu.score}** |`,
    );
  }
  md.push(``);
  md.push(`## Reasoning détail`);
  md.push(``);
  for (const r of rows) {
    md.push(`### ${r.test.id} — ${r.test.label}`);
    md.push(``);
    md.push(`> ${r.test.body.split("\n").join("\n> ")}`);
    md.push(``);
    md.push(`- **CHU** : ${r.results.chu.outcome} — ${r.results.chu.reason}`);
    md.push(`- **Saint-Martin** : ${r.results.saint_martin.outcome} — ${r.results.saint_martin.reason}`);
    md.push(`- **Clinique** : ${r.results.clinique.outcome} — ${r.results.clinique.reason}`);
    if (r.mismatches.length > 0) {
      md.push(`- ⚠ Mismatches: ${r.mismatches.join(", ")}`);
    }
    md.push(``);
  }
  md.push(`## Keywords utilisés`);
  md.push(``);
  for (const [k, list] of Object.entries(KEYWORDS)) {
    md.push(`- **${k}** : ${list.map((s) => `\`${s}\``).join(", ")}`);
  }
  md.push(``);
  md.push(`Insult regex : \`${"/\\\\b(p[éeè]nis|merde|putain|connard|salope|nique|encul[eé]|nul à chier|caca|pipi|fuck|shit|bordel)\\\\b/i"}\``);
  fs.writeFileSync(reportPath, md.join("\n"), "utf-8");
  console.log(`\n📝 Rapport markdown écrit : ${reportPath}\n`);

  process.exit(totalMismatches === 0 ? 0 : 1);
}

run();
