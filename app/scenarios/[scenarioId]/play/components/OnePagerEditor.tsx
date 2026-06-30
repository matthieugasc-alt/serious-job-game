/**
 * OnePagerEditor — S1 (founder_01_incubator) overlay where the player
 * fills the one-pager template and submits it to the jury.
 *
 * Pure presentation. State lives in hooks/useOnePagerEditor; the
 * "submit" side-effects (cloneSession + updateMailDraft +
 * sendCurrentPhaseMail + completeCurrentPhaseAndAdvance + …) live in
 * page.tsx and are passed in as a single `onSubmit(text)` callback.
 *
 * The contentEditable ref is owned by this component — page.tsx no
 * longer needs to reach in to extract the user's text.
 */

import React, { useRef } from "react";

export type OnePagerEditorProps = {
  visible: boolean;
  edited: boolean;
  submitted: boolean;
  /** PDF template path resolved by parent (one_pager_template file_path). */
  pdfPath: string;
  /** Scenario id, used for the secured download URL. */
  scenarioId: string;
  onClose: () => void;
  onEditedFirst: () => void;
  /** Called with the contentEditable inner text on submit. */
  onSubmit: (text: string) => void;
};

export function OnePagerEditor({
  visible,
  edited,
  submitted,
  pdfPath,
  scenarioId,
  onClose,
  onEditedFirst,
  onSubmit,
}: OnePagerEditorProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          maxWidth: 800,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 24px",
            background: "linear-gradient(135deg, #1a1a2e, #16213e)",
            borderRadius: "16px 16px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#5b5fc7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              📝
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                One-Pager — Orisio
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                Remplis chaque section puis soumets au jury
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              fontSize: 18,
              color: "#fff",
              cursor: "pointer",
              padding: "4px 10px",
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Progress indicator */}
        <div
          style={{
            padding: "8px 24px",
            background: "#f8f9fa",
            borderBottom: "1px solid #e8e8e8",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
          }}
        >
          <span style={{ color: "#16a34a", fontWeight: 700 }}>1. Remplir le document</span>
          <span style={{ color: "#ccc" }}>→</span>
          <span
            style={{
              color: edited ? "#16a34a" : "#666",
              fontWeight: edited ? 700 : 500,
            }}
          >
            2. Relire
          </span>
          <span style={{ color: "#ccc" }}>→</span>
          <span
            style={{
              color: submitted ? "#16a34a" : "#666",
              fontWeight: submitted ? 700 : 500,
            }}
          >
            3. Soumettre
          </span>
        </div>

        {/* Instruction banner */}
        {!submitted && (
          <div
            style={{
              padding: "10px 24px",
              background: "#eff6ff",
              borderBottom: "1px solid #bfdbfe",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
            }}
          >
            <span style={{ fontSize: 16 }}>✏️</span>
            <span style={{ color: "#1e40af", fontWeight: 600 }}>
              Cliquez sur le texte entre crochets pour le remplacer par vos informations.
            </span>
            {edited && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "#16a34a",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                Modifié
              </span>
            )}
          </div>
        )}

        {/* Editable content */}
        <div
          ref={contentRef}
          contentEditable={!submitted}
          suppressContentEditableWarning
          onInput={() => {
            if (!edited) onEditedFirst();
          }}
          style={{
            flex: 1,
            overflow: "auto",
            background: "#fff",
            padding: "32px 40px",
            fontSize: 14,
            lineHeight: 1.8,
            color: "#1a1a2e",
            fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
            outline: "none",
            cursor: !submitted ? "text" : "default",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: "0 0 8px",
                color: "#1a1a2e",
                letterSpacing: -0.5,
              }}
            >
              <span style={{ color: "#9ca3af", fontStyle: "italic" }}>[NOM DE LA STARTUP]</span>
            </h1>
            <p style={{ fontSize: 14, color: "#9ca3af", fontStyle: "italic", margin: 0 }}>
              [Tagline — une phrase qui résume ce que vous faites]
            </p>
          </div>
          <hr
            style={{
              border: "none",
              borderTop: "2px solid #5b5fc7",
              margin: "16px 0 24px",
              width: 60,
            }}
          />

          {SECTIONS.map((s) => (
            <React.Fragment key={s.title}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>
                {s.title}
              </h2>
              <p style={{ color: "#9ca3af", fontStyle: "italic" }}>{s.placeholder}</p>
            </React.Fragment>
          ))}
        </div>

        {/* PDF link */}
        {pdfPath && (
          <div
            style={{
              padding: "6px 24px",
              borderTop: "1px solid #e8e8e8",
              background: "#fafafa",
              textAlign: "center",
            }}
          >
            <a
              href={
                pdfPath.startsWith("/")
                  ? pdfPath
                  : `/api/download?file=${encodeURIComponent(pdfPath)}&scenarioId=${encodeURIComponent(scenarioId)}`
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                padding: "4px 12px",
                borderRadius: 6,
                background: "#f0f0ff",
                color: "#5b5fc7",
                textDecoration: "none",
                border: "1px solid rgba(91,95,199,0.2)",
              }}
            >
              Voir aussi le template PDF original
            </a>
          </div>
        )}

        {/* Submit area */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "2px solid #5b5fc7",
            background: submitted ? "#f0fdf4" : "#f8f9fa",
          }}
        >
          {!submitted ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                  {edited
                    ? "Votre one-pager est prêt à être soumis."
                    : "Remplissez le document avant de soumettre."}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  Le one-pager sera envoyé au jury de Technowest.
                </div>
              </div>
              <button
                onClick={() => {
                  const text = contentRef.current?.innerText || "";
                  onSubmit(text);
                }}
                disabled={!edited}
                style={{
                  padding: "12px 32px",
                  flexShrink: 0,
                  background: edited
                    ? "linear-gradient(135deg, #5b5fc7, #4a4eb3)"
                    : "#ccc",
                  border: edited ? "2px solid rgba(91,95,199,0.4)" : "2px solid #ddd",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: edited ? "pointer" : "not-allowed",
                  boxShadow: edited ? "0 4px 16px rgba(91,95,199,0.3)" : "none",
                  transition: "all 0.2s",
                  opacity: edited ? 1 : 0.5,
                }}
                onMouseEnter={(e) => {
                  if (edited) {
                    e.currentTarget.style.transform = "scale(1.02)";
                    e.currentTarget.style.boxShadow = "0 6px 24px rgba(91,95,199,0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = edited
                    ? "0 4px 16px rgba(91,95,199,0.3)"
                    : "none";
                }}
              >
                📤 Soumettre le one-pager
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                  One-pager soumis au jury
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  Le jury va maintenant l&apos;examiner. Prépare ton pitch.
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  marginLeft: "auto",
                  padding: "8px 16px",
                  background: "#5b5fc7",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sections of the one-pager — kept as data so adding/reordering
// requires no JSX surgery. Same content as the original inline JSX.
const SECTIONS: { title: string; placeholder: string }[] = [
  {
    title: "Problème",
    placeholder:
      "[Décrivez le problème que vous résolvez. Soyez concret : qui souffre, pourquoi, combien ça coûte. 3-4 phrases max.]",
  },
  {
    title: "Solution",
    placeholder:
      "[Décrivez votre produit/service. Ce qu'il fait, comment il fonctionne, en quoi il est différent. Pas de jargon. 3-4 phrases max.]",
  },
  {
    title: "Marché",
    placeholder:
      "[Taille du marché cible. Nombre d'établissements/utilisateurs potentiels. Segment initial visé. Chiffrez.]",
  },
  {
    title: "Modèle économique",
    placeholder:
      "[Comment vous gagnez de l'argent. Prix, récurrence, panier moyen. Soyez précis.]",
  },
  {
    title: "Traction",
    placeholder:
      "[Ce que vous avez déjà accompli. Entretiens, pilotes, lettres d'intention, premiers revenus. Chiffres concrets uniquement.]",
  },
  {
    title: "Équipe",
    placeholder:
      "[Qui vous êtes. Noms, rôles, pourquoi vous êtes les bonnes personnes pour ce projet. 2-3 lignes par personne.]",
  },
  {
    title: "Demande",
    placeholder:
      "[Ce que vous attendez de l'incubateur. Soyez spécifique : mentorat, réseau, financement, locaux, introductions.]",
  },
  { title: "Contact", placeholder: "[Nom — email — téléphone]" },
];
