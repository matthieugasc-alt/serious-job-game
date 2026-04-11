#!/usr/bin/env python3
"""Generate a PDF debrief report from JSON data.

Usage: echo '<json>' | python3 generate_debrief_pdf.py /path/to/output.pdf
"""

import json
import sys
import os
import subprocess

# Auto-install reportlab if missing
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
)


# ── Colors ────────────────────────────────────────────────────────
COLOR_PRIMARY = HexColor("#5b5fc7")
COLOR_SUCCESS = HexColor("#16a34a")
COLOR_PARTIAL = HexColor("#d97706")
COLOR_FAILURE = HexColor("#dc2626")
COLOR_BG_LIGHT = HexColor("#f8f9fa")
COLOR_BORDER = HexColor("#e0e0e0")
COLOR_TEXT = HexColor("#333333")
COLOR_MUTED = HexColor("#666666")

RATING_COLORS = {
    "maitrise": {"color": HexColor("#1a7f37"), "bg": HexColor("#dcfce7"), "label": "Maitrise"},
    "acquis": {"color": HexColor("#2563eb"), "bg": HexColor("#dbeafe"), "label": "Acquis"},
    "en_cours": {"color": HexColor("#b45309"), "bg": HexColor("#fef3c7"), "label": "En cours"},
    "non_acquis": {"color": HexColor("#991b1b"), "bg": HexColor("#fee2e2"), "label": "Non acquis"},
}


def get_ending_color(ending: str):
    if ending == "success":
        return COLOR_SUCCESS
    if ending == "partial_success":
        return COLOR_PARTIAL
    return COLOR_FAILURE


def get_ending_label(ending: str) -> str:
    if ending == "success":
        return "Succes"
    if ending == "partial_success":
        return "Succes partiel"
    return "Echec"


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        "DocTitle",
        parent=styles["Title"],
        fontSize=22,
        leading=28,
        textColor=COLOR_PRIMARY,
        spaceAfter=4,
        alignment=TA_CENTER,
    ))

    styles.add(ParagraphStyle(
        "SectionHead",
        parent=styles["Heading2"],
        fontSize=14,
        leading=18,
        textColor=COLOR_PRIMARY,
        spaceBefore=16,
        spaceAfter=8,
        borderPadding=0,
    ))

    styles.add(ParagraphStyle(
        "PhaseHead",
        parent=styles["Heading3"],
        fontSize=13,
        leading=17,
        textColor=COLOR_TEXT,
        spaceBefore=12,
        spaceAfter=6,
    ))

    styles.add(ParagraphStyle(
        "BodyText2",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=COLOR_TEXT,
        alignment=TA_JUSTIFY,
        spaceAfter=6,
    ))

    styles.add(ParagraphStyle(
        "SmallMuted",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=COLOR_MUTED,
    ))

    styles.add(ParagraphStyle(
        "BulletItem",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=COLOR_TEXT,
        leftIndent=12,
        spaceAfter=3,
    ))

    styles.add(ParagraphStyle(
        "CenterMuted",
        parent=styles["Normal"],
        fontSize=10,
        textColor=COLOR_MUTED,
        alignment=TA_CENTER,
        spaceAfter=12,
    ))

    return styles


def safe(text) -> str:
    """Escape HTML-sensitive characters for reportlab Paragraphs."""
    if not text:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def generate_pdf(data: dict, output_path: str):
    styles = build_styles()
    story = []

    ending = data.get("ending", "failure")
    ending_color = get_ending_color(ending)
    ending_label = get_ending_label(ending)
    scenario_title = data.get("scenario_title", "Scenario")
    player_name = data.get("player_name", "Joueur")
    game_date = data.get("game_date", "")

    # ── Title block ───────────────────────────────────────────────
    story.append(Paragraph("Serious Job Game", styles["DocTitle"]))
    story.append(Paragraph(
        f"Debrief — {safe(scenario_title)}",
        styles["CenterMuted"],
    ))

    # Player + date info
    meta_text = f"Joueur : <b>{safe(player_name)}</b>"
    if game_date:
        meta_text += f"&nbsp;&nbsp;|&nbsp;&nbsp;Date : {safe(game_date)}"
    story.append(Paragraph(meta_text, styles["CenterMuted"]))
    story.append(Spacer(1, 6))

    # ── Ending banner ─────────────────────────────────────────────
    banner_data = [[Paragraph(
        f'<font color="white" size="14"><b>{safe(ending_label)}</b></font>',
        styles["Normal"],
    )]]
    banner_table = Table(banner_data, colWidths=[170 * mm])
    banner_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ending_color),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 8))

    # Ending narrative
    ending_narrative = data.get("ending_narrative", "")
    if ending_narrative:
        story.append(Paragraph(safe(ending_narrative), styles["BodyText2"]))
        story.append(Spacer(1, 4))

    # ── Overall summary ───────────────────────────────────────────
    overall = data.get("overall_summary", "")
    if overall:
        story.append(Paragraph("Resume global", styles["SectionHead"]))
        story.append(Paragraph(safe(overall), styles["BodyText2"]))

    # Average score
    phases = data.get("phases", [])
    if phases:
        scores = [p.get("phase_score", 0) for p in phases]
        avg = round(sum(scores) / len(scores)) if scores else 0
        story.append(Paragraph(
            f'Score moyen : <b><font color="{ending_color.hexval()}">{avg}%</font></b>',
            styles["BodyText2"],
        ))

    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.5, color=COLOR_BORDER))

    # ── Per-phase analysis ────────────────────────────────────────
    for idx, phase in enumerate(phases):
        phase_title = phase.get("phase_title", f"Phase {idx + 1}")
        phase_score = phase.get("phase_score", 0)
        score_color = COLOR_SUCCESS if phase_score >= 70 else COLOR_PARTIAL if phase_score >= 40 else COLOR_FAILURE

        story.append(Paragraph(
            f'Phase {idx + 1} — {safe(phase_title)}&nbsp;&nbsp;<font color="{score_color.hexval()}" size="12"><b>{phase_score}/100</b></font>',
            styles["PhaseHead"],
        ))

        phase_summary = phase.get("phase_summary", "")
        if phase_summary:
            story.append(Paragraph(
                f'<i>{safe(phase_summary)}</i>',
                styles["SmallMuted"],
            ))
            story.append(Spacer(1, 4))

        # Competencies table
        competencies = phase.get("competencies", [])
        if competencies:
            table_data = [
                [
                    Paragraph('<b>Competence</b>', styles["SmallMuted"]),
                    Paragraph('<b>Niveau</b>', styles["SmallMuted"]),
                    Paragraph('<b>Justification</b>', styles["SmallMuted"]),
                ]
            ]

            for comp in competencies:
                rating_key = comp.get("rating", "non_acquis")
                rcfg = RATING_COLORS.get(rating_key, RATING_COLORS["non_acquis"])

                name_p = Paragraph(safe(comp.get("name", "")), styles["SmallMuted"])
                rating_p = Paragraph(
                    f'<font color="{rcfg["color"].hexval()}"><b>{safe(rcfg["label"])}</b></font>',
                    styles["SmallMuted"],
                )
                just_p = Paragraph(safe(comp.get("justification", "")), styles["SmallMuted"])
                table_data.append([name_p, rating_p, just_p])

            comp_table = Table(table_data, colWidths=[55 * mm, 25 * mm, 90 * mm])
            comp_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), COLOR_BG_LIGHT),
                ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(comp_table)
            story.append(Spacer(1, 6))

    story.append(HRFlowable(width="100%", thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 4))

    # ── Strengths ─────────────────────────────────────────────────
    strengths = data.get("strengths", [])
    if strengths:
        story.append(Paragraph("Points forts", styles["SectionHead"]))
        for s in strengths:
            story.append(Paragraph(f"<bullet>&bull;</bullet> {safe(s)}", styles["BulletItem"]))
        story.append(Spacer(1, 4))

    # ── Improvements ──────────────────────────────────────────────
    improvements = data.get("improvements", [])
    if improvements:
        story.append(Paragraph("Axes d'amelioration", styles["SectionHead"]))
        for s in improvements:
            story.append(Paragraph(f"<bullet>&bull;</bullet> {safe(s)}", styles["BulletItem"]))
        story.append(Spacer(1, 4))

    # ── Pedagogical advice ────────────────────────────────────────
    advice = data.get("pedagogical_advice", "")
    if advice:
        story.append(Paragraph("Conseil pedagogique", styles["SectionHead"]))
        story.append(Paragraph(safe(advice), styles["BodyText2"]))

    # ── Footer ────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=COLOR_BORDER))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Genere par Serious Job Game — Evaluation IA",
        styles["CenterMuted"],
    ))

    # ── Build PDF ─────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )
    doc.build(story)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: echo '<json>' | python3 generate_debrief_pdf.py output.pdf", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    raw = sys.stdin.read()
    data = json.loads(raw)
    generate_pdf(data, output_path)
    print(f"PDF generated: {output_path}")
