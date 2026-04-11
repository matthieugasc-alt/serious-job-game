#!/usr/bin/env python3
"""Generate the scenario writing guide PDF."""

import subprocess
import sys
import os

try:
    import reportlab  # noqa: F401
except ImportError:
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "reportlab", "--break-system-packages", "-q"],
        stdout=subprocess.DEVNULL,
    )

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    PageBreak,
    ListFlowable,
    ListItem,
)

# ── Colors ────────────────────────────────────────────────────────
C_PRIMARY = HexColor("#5b5fc7")
C_ACCENT = HexColor("#1a3c6e")
C_SUCCESS = HexColor("#16a34a")
C_WARN = HexColor("#b45309")
C_DANGER = HexColor("#dc2626")
C_BG = HexColor("#f8f9fa")
C_BORDER = HexColor("#e0e0e0")
C_TEXT = HexColor("#333333")
C_MUTED = HexColor("#666666")
C_CODE_BG = HexColor("#f5f5f5")

W = A4[0] - 30 * mm  # usable width


def safe(t):
    if not t:
        return ""
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_styles():
    s = getSampleStyleSheet()

    s.add(ParagraphStyle("DocTitle", parent=s["Title"], fontSize=24, leading=30,
                          textColor=C_PRIMARY, spaceAfter=4, alignment=TA_CENTER))
    s.add(ParagraphStyle("DocSubtitle", parent=s["Normal"], fontSize=12,
                          textColor=C_MUTED, alignment=TA_CENTER, spaceAfter=16))
    s.add(ParagraphStyle("H1", parent=s["Heading1"], fontSize=18, leading=24,
                          textColor=C_ACCENT, spaceBefore=20, spaceAfter=10))
    s.add(ParagraphStyle("H2", parent=s["Heading2"], fontSize=14, leading=18,
                          textColor=C_PRIMARY, spaceBefore=14, spaceAfter=6))
    s.add(ParagraphStyle("H3", parent=s["Heading3"], fontSize=12, leading=16,
                          textColor=C_TEXT, spaceBefore=10, spaceAfter=4))
    s.add(ParagraphStyle("Body", parent=s["Normal"], fontSize=10, leading=15,
                          textColor=C_TEXT, alignment=TA_JUSTIFY, spaceAfter=6))
    s.add(ParagraphStyle("BodyBold", parent=s["Normal"], fontSize=10, leading=15,
                          textColor=C_TEXT, spaceAfter=6))
    s.add(ParagraphStyle("BulletCustom", parent=s["Normal"], fontSize=10, leading=14,
                          textColor=C_TEXT, leftIndent=14, spaceAfter=3))
    s.add(ParagraphStyle("CodeBlock", parent=s["Normal"], fontSize=9, leading=12,
                          textColor=C_TEXT, fontName="Courier", leftIndent=8,
                          spaceAfter=3, backColor=C_CODE_BG))
    s.add(ParagraphStyle("Tip", parent=s["Normal"], fontSize=10, leading=14,
                          textColor=C_SUCCESS, leftIndent=12, spaceAfter=6))
    s.add(ParagraphStyle("Warning", parent=s["Normal"], fontSize=10, leading=14,
                          textColor=C_DANGER, leftIndent=12, spaceAfter=6))
    s.add(ParagraphStyle("SmallMuted", parent=s["Normal"], fontSize=9, leading=12,
                          textColor=C_MUTED))
    s.add(ParagraphStyle("CheckItem", parent=s["Normal"], fontSize=10, leading=14,
                          textColor=C_TEXT, leftIndent=14, spaceAfter=4))
    return s


def tip_box(text, styles):
    """Green tip box."""
    data = [[Paragraph(f'<font color="#16a34a"><b>CONSEIL</b></font><br/>{safe(text)}', styles["Body"])]]
    t = Table(data, colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f0fdf4")),
        ("BOX", (0, 0), (-1, -1), 0.5, C_SUCCESS),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def warn_box(text, styles):
    """Orange warning box."""
    data = [[Paragraph(f'<font color="#b45309"><b>ATTENTION</b></font><br/>{safe(text)}', styles["Body"])]]
    t = Table(data, colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#fffbeb")),
        ("BOX", (0, 0), (-1, -1), 0.5, C_WARN),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def code_block(lines, styles):
    """Code block with grey background."""
    code_text = "<br/>".join(safe(l) for l in lines)
    data = [[Paragraph(code_text, styles["CodeBlock"])]]
    t = Table(data, colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def checklist_item(text, styles):
    return Paragraph(f'<font color="#5b5fc7">[ ]</font> {safe(text)}', styles["CheckItem"])


def generate_guide(output_path: str):
    styles = build_styles()
    story = []

    # ── COVER ─────────────────────────────────────────────────────
    story.append(Spacer(1, 40))
    story.append(Paragraph("Guide de creation de scenarios", styles["DocTitle"]))
    story.append(Paragraph("Serious Job Game — Plateforme de simulation metier", styles["DocSubtitle"]))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="60%", thickness=2, color=C_PRIMARY))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Ce document explique pas a pas comment rediger un scenario au format PDF "
        "pour qu'il soit automatiquement converti en JSON jouable par la plateforme.",
        styles["Body"],
    ))
    story.append(Spacer(1, 6))
    story.append(warn_box(
        "Suivez chaque section dans l'ordre. Le convertisseur IA lit votre PDF et genere "
        "le JSON correspondant. Plus votre document est structure, meilleur sera le resultat.",
        styles,
    ))

    story.append(PageBreak())

    # ── TABLE OF CONTENTS ─────────────────────────────────────────
    story.append(Paragraph("Sommaire", styles["H1"]))
    toc_items = [
        "1. Structure globale du scenario",
        "2. Metadonnees (meta)",
        "3. Narratif et contexte",
        "4. Timeline et temporalite",
        "5. Acteurs / Personnages",
        "6. Canaux de communication",
        "7. Ressources et documents",
        "8. Contraintes",
        "9. Evenements initiaux",
        "10. Phases — Le coeur du scenario",
        "11. Competences a evaluer",
        "12. Interruptions",
        "13. Configuration mail par phase",
        "14. Fins du scenario (endings)",
        "15. Page d'introduction",
        "16. Checklist finale avant conversion",
    ]
    for item in toc_items:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {safe(item)}", styles["BulletCustom"]))
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 1: STRUCTURE GLOBALE
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("1. Structure globale du scenario", styles["H1"]))
    story.append(Paragraph(
        "Un scenario est compose de plusieurs sections obligatoires. "
        "Votre PDF doit contenir chacune de ces sections, clairement identifiees par des titres.",
        styles["Body"],
    ))
    story.append(Paragraph("Sections obligatoires :", styles["BodyBold"]))
    required = [
        "Metadonnees — titre, difficulte, duree, famille de metier, tags",
        "Narratif — contexte, mission, situation initiale, declencheur",
        "Timeline — date/heure de debut, vitesse du temps simule",
        "Acteurs — tous les personnages avec leurs moyens de communication",
        "Canaux — quels canaux sont actifs (chat, mail, telephone...)",
        "Ressources — documents disponibles pour le joueur",
        "Evenements initiaux — ce qui se passe au lancement",
        "Phases — chaque etape du scenario (objectif, canaux, competences, interruptions, mail)",
        "Fins — les differentes fins possibles (succes, partiel, echec)",
        "Introduction — les cartes affichees sur la page de briefing",
    ]
    for r in required:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {safe(r)}", styles["BulletCustom"]))

    story.append(Spacer(1, 8))
    story.append(tip_box(
        "Ecrivez votre scenario comme un document narratif structure avec des titres clairs. "
        "L'IA saura l'interpreter. Pas besoin de JSON !",
        styles,
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 2: METADONNEES
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("2. Metadonnees (meta)", styles["H1"]))
    story.append(Paragraph(
        "Les metadonnees decrivent le scenario pour la page de selection. "
        "Indiquez clairement :",
        styles["Body"],
    ))

    meta_fields = [
        ("Titre", "Le nom du scenario (ex: 'Atterrissage dans 45 minutes')"),
        ("Sous-titre", "Une phrase descriptive courte"),
        ("Description", "2-3 phrases pour la carte de selection"),
        ("Famille de metier", "assistant_cooperation_internationale, management, commercial, juridique, rh, communication, finance, formation..."),
        ("Difficulte", "junior, intermediate ou senior"),
        ("Duree estimee", "En minutes (ex: 20, 30, 45)"),
        ("Tags", "Mots-cles separes par des virgules (ex: diplomatie, urgence, redaction)"),
        ("Objectifs pedagogiques", "Liste des competences visees (3-5 objectifs)"),
    ]
    for label, desc in meta_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Exemple :", styles["H3"]))
    story.append(code_block([
        "METADONNEES",
        "Titre : Atterrissage dans 45 minutes",
        "Sous-titre : Exercice de redaction en situation d'urgence",
        "Famille de metier : assistant_cooperation_internationale",
        "Difficulte : junior",
        "Duree estimee : 20 minutes",
        "Tags : diplomatie, urgence, redaction, coordination",
        "Objectifs pedagogiques :",
        "  - Comprendre rapidement une information critique",
        "  - Construire une strategie sous contrainte de temps",
        "  - Rediger un courriel diplomatique",
    ], styles))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 3: NARRATIF
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("3. Narratif et contexte", styles["H1"]))
    story.append(Paragraph(
        "Le narratif pose le decor du scenario. Il doit contenir :",
        styles["Body"],
    ))

    narr_fields = [
        ("Contexte", "Le cadre professionnel du joueur (poste, entreprise, anciennete)"),
        ("Mission", "Ce que le joueur doit accomplir globalement"),
        ("Situation initiale", "Ce qui se passe au moment ou le scenario commence (date, heure, lieu, etat des lieux)"),
        ("Declencheur", "L'evenement qui lance l'action (un appel, un mail, un message...)"),
        ("Fait de background (optionnel)", "Information que le joueur peut decouvrir dans ses documents"),
    ]
    for label, desc in narr_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(warn_box(
        "Le declencheur doit etre tres concret : qui contacte le joueur, par quel moyen, et que dit le message exact.",
        styles,
    ))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 4: TIMELINE
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("4. Timeline et temporalite", styles["H1"]))
    story.append(Paragraph(
        "La timeline definit quand le scenario se deroule et a quelle vitesse le temps avance.",
        styles["Body"],
    ))
    story.append(Paragraph(
        'Indiquez la <b>date et heure de debut</b> (ex: "Mardi 7 avril 2025, 9h20") '
        'et le <b>multiplicateur de vitesse</b> (1 = temps reel, 3 = le temps passe 3x plus vite).',
        styles["Body"],
    ))
    story.append(Paragraph(
        "Vous pouvez aussi indiquer des deadlines importantes :",
        styles["Body"],
    ))
    story.append(code_block([
        "TIMELINE",
        "Debut du scenario : mardi 7 avril 2025 a 9h20",
        "Vitesse du temps : x3",
        "Deadlines :",
        "  - Deadline email : 9h45",
        "  - Arrivee du vol : 11h00",
        "  - Responsable disponible : 11h00",
    ], styles))

    story.append(Spacer(1, 6))
    story.append(tip_box(
        "Le multiplicateur x3 signifie que 1 minute reelle = 3 minutes dans le jeu. "
        "C'est utile pour simuler la pression temporelle sans que le joueur attende trop longtemps.",
        styles,
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 5: ACTEURS
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("5. Acteurs / Personnages", styles["H1"]))
    story.append(Paragraph(
        "Listez TOUS les personnages du scenario. Pour chacun, precisez :",
        styles["Body"],
    ))

    actor_fields = [
        ("Nom complet", "Ex: Romain Dufresne"),
        ("Role / fonction", "Ex: Charge de mission, collegue"),
        ("Personnalite (pour les PNJ IA)", "Comment l'IA doit le jouer (ton, attitude, reactions)"),
        ("Moyens de communication", "CRUCIAL ! Indiquez : chat, mail, telephone, whatsapp, en_personne, injoignable"),
        ("Controle par", "'joueur' (le joueur), 'ia' (PNJ intelligent), 'systeme' (messages pre-ecrits)"),
        ("Disponibilite", "Ex: 'Disponible jusqu'a 10h puis part en reunion'"),
        ("Avatar", "Couleur (hex) et initiales (1-2 lettres)"),
        ("Email (si communication mail)", "Ex: romain.dufresne@region-na.fr"),
        ("Statut visible", "available, busy, away, offline"),
    ]
    for label, desc in actor_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(warn_box(
        "Les MOYENS DE COMMUNICATION sont essentiels ! Ils determinent si un acteur "
        "apparait dans le chat, dans les contacts mail, ou les deux. "
        "Un acteur avec 'mail' apparaitra dans le carnet d'adresses. "
        "Un acteur avec 'chat' sera joignable par messagerie instantanee.",
        styles,
    ))

    story.append(Spacer(1, 6))
    story.append(Paragraph("Exemple :", styles["H3"]))
    story.append(code_block([
        "ACTEUR : Romain Dufresne",
        "  Role : Charge de mission, collegue",
        "  Personnalite : Presse, operationnel, stresse mais cooperatif",
        "  Communication : chat, en_personne",
        "  Controle par : IA",
        "  Disponibilite : Disponible jusqu'a 9h50 puis part a l'aeroport",
        "  Avatar : bleu (#5b5fc7), initiales R",
        "  Statut : available",
        "",
        "ACTEUR : Consulat de France a Madrid",
        "  Role : Service des visas",
        "  Personnalite : Formel, prudent, bureaucratique",
        "  Communication : mail",
        "  Email : consulat-madrid@exemple.fr",
        "  Controle par : systeme",
        "  Avatar : bleu (#1f77b4), initiales CG",
    ], styles))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 6: CANAUX
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("6. Canaux de communication", styles["H1"]))
    story.append(Paragraph(
        "Definissez les canaux disponibles dans le scenario. Les canaux possibles sont :",
        styles["Body"],
    ))

    channels = [
        ("chat", "Messagerie instantanee — pour les conversations avec les PNJ IA"),
        ("mail", "Boite mail — pour l'envoi/reception de courriels formels"),
    ]
    for ch_id, desc in channels:
        story.append(Paragraph(f'<b>{safe(ch_id)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(tip_box(
        "La plupart des scenarios utilisent 'chat' + 'mail'. "
        "Le chat est pour les echanges rapides, le mail pour les communications formelles.",
        styles,
    ))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 7: RESSOURCES
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("7. Ressources et documents", styles["H1"]))
    story.append(Paragraph(
        "Listez tous les documents accessibles au joueur. Pour chaque document :",
        styles["Body"],
    ))

    doc_fields = [
        ("Nom / Label", "Ex: Lettre d'invitation officielle"),
        ("Contenu resume", "Ce que le document contient (mots-cles)"),
        ("Peut etre joint en PJ", "Oui/Non — si le joueur peut le joindre a un mail"),
        ("Contenu affiche (optionnel)", "Texte complet affiche quand le joueur ouvre le document"),
    ]
    for label, desc in doc_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(code_block([
        "DOCUMENTS DISPONIBLES :",
        "",
        "1. Lettre d'invitation officielle du President de Region",
        "   Contient : dates 7-12 avril, noms des 3 delegues, objet mission eau",
        "   Joignable en PJ : Oui",
        "",
        "2. Coordonnees du consulat de Madrid",
        "   Contient : email, telephone, adresse, horaires",
        "   Joignable en PJ : Non",
        "   Contenu affiche :",
        "     Consulat general de France a Madrid",
        "     Email : visas.madrid@diplomatie.gouv.fr",
        "     Telephone : +34 91 423 89 00",
    ], styles))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 8: CONTRAINTES
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("8. Contraintes", styles["H1"]))
    story.append(Paragraph(
        "Les contraintes sont des regles ou limitations qui encadrent le scenario :",
        styles["Body"],
    ))
    constraints = [
        "Pression temporelle (oui/non)",
        "Limites hierarchiques (le joueur n'a pas le pouvoir de...)",
        "Ton requis (diplomatique, formel, commercial...)",
        "Incertitudes (ce que le joueur ne peut pas savoir a l'avance)",
        "Langues (si un message est dans une autre langue)",
    ]
    for c in constraints:
        story.append(Paragraph(f"<bullet>&bull;</bullet> {safe(c)}", styles["BulletCustom"]))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 9: EVENEMENTS INITIAUX
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("9. Evenements initiaux", styles["H1"]))
    story.append(Paragraph(
        "Ce sont les messages qui apparaissent automatiquement des le debut du scenario. "
        "Ils servent a planter le decor et lancer l'action.",
        styles["Body"],
    ))
    story.append(Paragraph(
        "Pour chaque evenement initial, indiquez :",
        styles["Body"],
    ))

    init_fields = [
        ("Acteur", "Qui envoie le message"),
        ("Type", "phone_call, whatsapp_message, chat, mail..."),
        ("Contenu exact", "Le texte complet du message (entre guillemets)"),
        ("Langue (si different)", "Ex: espagnol"),
    ]
    for label, desc in init_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(code_block([
        "EVENEMENTS INITIAUX :",
        "",
        '1. Romain (appel telephonique) :',
        '   "Eh, j\'ai un message de Claudia sur WhatsApp,',
        '    la cheffe de la delegation. C\'est en espagnol,',
        '    je comprends rien. Ca a l\'air urgent."',
        "",
        '2. Claudia (message WhatsApp, en espagnol) :',
        '   "Romain, tenemos un problema..."',
    ], styles))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 10: PHASES
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("10. Phases — Le coeur du scenario", styles["H1"]))
    story.append(warn_box(
        "C'est LA section la plus importante. Chaque phase est une etape du scenario "
        "avec ses propres objectifs, canaux actifs, competences evaluees, et eventuellement "
        "une configuration mail specifique.",
        styles,
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Pour CHAQUE phase, vous devez specifier :",
        styles["Body"],
    ))

    phase_fields = [
        ("Titre de la phase", "Ex: Phase 1 — Comprehension"),
        ("Duree cible", "En minutes (ex: 3 min, 5 min, 10 min)"),
        ("Objectif", "Ce que le joueur doit accomplir dans cette phase"),
        ("Canaux actifs", "CRUCIAL : quels canaux sont ouverts ? (chat, mail, ou les deux)"),
        ("Acteurs IA actifs", "Quels PNJ repondent dans cette phase"),
        ("Type d'interaction", "Texte libre (free_text) ou texte riche (rich_text)"),
        ("Prompt joueur", "L'instruction donnee au joueur (ex: 'Explique a Romain ce que dit le message')"),
        ("Auto-avance", "Oui (passe a la suite apres validation) ou Non (attend une action specifique)"),
        ("Phase suivante", "Le titre ou ID de la phase qui suit"),
        ("Saut de temps (optionnel)", "Nombre de minutes a faire avancer l'horloge en entrant dans la phase"),
    ]
    for label, desc in phase_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Exemple complet de phase :", styles["H3"]))
    story.append(code_block([
        "PHASE 1 : Comprehension",
        "Duree cible : 3 minutes",
        "Objectif : Comprendre le message en espagnol et l'expliquer a Romain",
        "Canaux actifs : chat uniquement",
        "Acteurs IA : Romain",
        "Type d'interaction : texte libre",
        "Prompt : Romain attend que tu lui expliques ce que dit le message.",
        "Auto-avance : Oui",
        "Phase suivante : Phase 2 — Strategie",
        "",
        "PHASE 3 : Execution",
        "Duree cible : 10 minutes",
        "Objectif : Rediger le courriel au consulat",
        "Canaux actifs : chat ET mail",
        "Acteurs IA : Romain",
        "Type d'interaction : texte riche",
        "Auto-avance : Non (attend l'envoi du mail)",
        "Phase suivante : Phase 4 — Rebond",
        "Configuration mail : (voir section 13)",
    ], styles))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 11: COMPETENCES
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("11. Competences a evaluer", styles["H1"]))
    story.append(Paragraph(
        "Pour CHAQUE phase, listez les competences que l'IA evaluera. "
        "Ce sont des phrases descriptives qui decrivent ce que le joueur doit demontrer.",
        styles["Body"],
    ))
    story.append(Paragraph(
        "L'IA Claude analyse la conversation et evalue chaque competence selon 4 niveaux :",
        styles["Body"],
    ))

    ratings = [
        ("Maitrise", "Le joueur a demontre cette competence de maniere excellente"),
        ("Acquis", "Le joueur a correctement demontre cette competence"),
        ("En cours", "Le joueur a partiellement demontre cette competence"),
        ("Non acquis", "Le joueur n'a pas demontre cette competence"),
    ]
    for label, desc in ratings:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(code_block([
        "COMPETENCES Phase 1 — Comprehension :",
        "  - Identifie que le visa de Jorge expire aujourd'hui",
        "  - Comprend que la mission dure au-dela de la validite du visa",
        "  - Note que la compagnie aerienne l'a laisse embarquer",
        "  - Identifie le risque de refoulement par la PAF",
        "  - Remarque que les deux autres delegues sont en regle",
    ], styles))

    story.append(Spacer(1, 6))
    story.append(tip_box(
        "Formulez vos competences comme des actions observables : "
        "'Identifie...', 'Propose...', 'Redige...', 'Gere...'. "
        "Visez 4 a 7 competences par phase.",
        styles,
    ))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 12: INTERRUPTIONS
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("12. Interruptions", styles["H1"]))
    story.append(Paragraph(
        "Les interruptions sont des messages non sollicites qui arrivent pendant une phase "
        "pour ajouter de la pression ou tester la capacite du joueur a gerer plusieurs sujets.",
        styles["Body"],
    ))
    story.append(Paragraph("Pour chaque interruption :", styles["Body"]))

    int_fields = [
        ("Phase concernee", "Dans quelle phase l'interruption se declenche"),
        ("Acteur", "Qui envoie le message"),
        ("Canal", "chat ou mail"),
        ("Contenu exact", "Le texte complet du message"),
        ("Declencheur", "Quand l'interruption se produit :"),
    ]
    for label, desc in int_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 4))
    story.append(Paragraph("Types de declencheurs :", styles["H3"]))
    triggers = [
        ("Apres un delai", "Ex: 'apres 2 minutes et 30 secondes' (en ms: 150000)"),
        ("Apres N messages du joueur", "Ex: 'apres que le joueur a envoye 3 messages'"),
        ("A l'entree de la phase", "L'interruption arrive immediatement en entrant dans la phase"),
    ]
    for label, desc in triggers:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(code_block([
        "INTERRUPTION dans Phase 3 :",
        "  Acteur : Romain",
        "  Canal : chat",
        "  Declencheur : apres 2 minutes 30 secondes",
        "  Message :",
        '  "Bon, tu en es ou ? J\'ai trouve le numero de la PAF.',
        '   Tu veux que je les appelle maintenant ?"',
    ], styles))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 13: MAIL CONFIG
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("13. Configuration mail par phase", styles["H1"]))
    story.append(Paragraph(
        "Si une phase implique l'envoi d'un mail, vous devez configurer :",
        styles["Body"],
    ))

    mail_fields = [
        ("Destinataire par defaut (To)", "L'email ou nom du destinataire pre-rempli"),
        ("Copie par defaut (Cc)", "L'email ou nom des personnes en copie"),
        ("Objet par defaut", "L'objet pre-rempli du mail"),
        ("Pieces jointes requises", "Oui/Non — est-ce que le joueur DOIT joindre des documents ?"),
        ("Label du bouton d'envoi", "Ex: 'Envoyer le mail au consulat'"),
        ("L'envoi fait avancer la phase", "Oui/Non — est-ce que l'envoi du mail passe a la phase suivante ?"),
    ]
    for label, desc in mail_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(code_block([
        "CONFIGURATION MAIL Phase 3 :",
        "  Destinataire : consulat-madrid@exemple.fr",
        "  Copie : paf-bordeaux@exemple.fr",
        "  Objet : Demande urgente relative a la delegation peruvienne",
        "  Pieces jointes requises : Non",
        "  Bouton : Envoyer le mail au consulat",
        "  L'envoi avance la phase : Oui",
    ], styles))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 14: FINS (ENDINGS)
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("14. Fins du scenario (endings)", styles["H1"]))
    story.append(Paragraph(
        "Definissez au moins 3 fins possibles. L'IA Claude choisira la fin appropriee "
        "en fonction de la performance du joueur.",
        styles["Body"],
    ))

    story.append(Paragraph("Pour chaque fin :", styles["Body"]))
    end_fields = [
        ("Type", "success, partial_success, ou failure"),
        ("Label", "Ex: 'Succes', 'Succes partiel', 'Echec'"),
        ("Texte narratif", "1-3 phrases decrivant ce qui se passe dans cette fin"),
    ]
    for label, desc in end_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(code_block([
        "FINS DU SCENARIO :",
        "",
        "Succes :",
        "  La coordination a ete solide. Le consulat a emis une note.",
        "  Jorge a pu passer les controles. La delegation est arrivee.",
        "",
        "Succes partiel :",
        "  Plusieurs bonnes actions, mais la timeline n'a pas joue",
        "  en ta faveur. Jorge a ete mis en zone d'attente.",
        "",
        "Echec :",
        "  La situation n'a pas ete securisee. Jorge a ete refoule.",
        "  Incident diplomatique. Le partenariat est compromis.",
    ], styles))

    # ═══════════════════════════════════════════════════════════════
    # SECTION 15: INTRODUCTION
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("15. Page d'introduction", styles["H1"]))
    story.append(Paragraph(
        "L'introduction est la page de briefing affichee avant le jeu. "
        "Elle contient des cartes organisees en 2 colonnes (gauche et droite).",
        styles["Body"],
    ))

    story.append(Paragraph("Elements a definir :", styles["Body"]))
    intro_fields = [
        ("Tag", "Ex: 'Simulation metier'"),
        ("Titre", "Ex: 'Assistant(e) en collaboration internationale'"),
        ("Sous-titre", "Phrase d'accroche qui resume le defi"),
        ("Cartes (2 a 4)", "Chacune avec : titre, contenu HTML, colonne (gauche/droite)"),
    ]
    for label, desc in intro_fields:
        story.append(Paragraph(f'<b>{safe(label)}</b> : {safe(desc)}', styles["BulletCustom"]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Suggestions de cartes : 'Ton role', 'Le contexte', 'Ce qui t'attend', 'Regles du jeu'",
        styles["Body"],
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════
    # SECTION 16: CHECKLIST
    # ═══════════════════════════════════════════════════════════════
    story.append(Paragraph("16. Checklist finale avant conversion", styles["H1"]))
    story.append(Paragraph(
        "Avant de soumettre votre PDF, verifiez chaque point :",
        styles["Body"],
    ))
    story.append(Spacer(1, 4))

    story.append(Paragraph("<b>Structure generale</b>", styles["H3"]))
    checks_struct = [
        "Titre et metadonnees sont clairement indiques",
        "La famille de metier est specifiee",
        "La difficulte est indiquee (junior/intermediate/senior)",
        "La duree estimee est donnee en minutes",
    ]
    for c in checks_struct:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Acteurs</b>", styles["H3"]))
    checks_actors = [
        "Chaque acteur a un nom, un role et des moyens de communication",
        "Les acteurs IA ont une description de personnalite",
        "Les acteurs mail ont une adresse email",
        "Les avatars (couleur + initiales) sont definis",
        "Le joueur est defini comme acteur avec role 'joueur'",
    ]
    for c in checks_actors:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Phases</b>", styles["H3"]))
    checks_phases = [
        "Chaque phase a un objectif clair",
        "Les canaux actifs sont specifies pour CHAQUE phase (chat, mail, les deux ?)",
        "Les acteurs IA actifs sont listes pour chaque phase",
        "Les competences evaluees sont listees (4-7 par phase)",
        "Le mode d'avancement est precise (auto ou action specifique)",
        "La phase suivante est indiquee",
        "La duree cible est donnee",
    ]
    for c in checks_phases:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Mail</b>", styles["H3"]))
    checks_mail = [
        "Si une phase implique un mail : destinataire, cc, objet sont configures",
        "La necessite de PJ est indiquee",
        "Le label du bouton d'envoi est defini",
        "Il est indique si l'envoi fait avancer la phase",
    ]
    for c in checks_mail:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Interruptions</b>", styles["H3"]))
    checks_inter = [
        "Chaque interruption a un declencheur (delai, messages, entree de phase)",
        "L'acteur et le canal sont specifies",
        "Le contenu exact du message est fourni",
    ]
    for c in checks_inter:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Evenements d'entree de phase</b>", styles["H3"]))
    checks_entry = [
        "Si une phase a des messages automatiques en entrant, ils sont decrits",
        "Le delai de chaque evenement est precise (immediat ou apres X secondes)",
        "L'acteur, le canal et le contenu sont donnes",
    ]
    for c in checks_entry:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Fins</b>", styles["H3"]))
    checks_ends = [
        "Au moins 3 fins sont definies (succes, partiel, echec)",
        "Chaque fin a un texte narratif",
    ]
    for c in checks_ends:
        story.append(checklist_item(c, styles))

    story.append(Paragraph("<b>Introduction</b>", styles["H3"]))
    checks_intro = [
        "Le tag, titre et sous-titre du header sont definis",
        "2 a 4 cartes sont definies avec titre, contenu et colonne",
    ]
    for c in checks_intro:
        story.append(checklist_item(c, styles))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=C_PRIMARY))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Serious Job Game — Guide de creation de scenarios v1.0",
        styles["SmallMuted"],
    ))

    # ── BUILD ─────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )
    doc.build(story)
    print(f"Guide generated: {output_path}")


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "guide_creation_scenario.pdf"
    generate_guide(output)
