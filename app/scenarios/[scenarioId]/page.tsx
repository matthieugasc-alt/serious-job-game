"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { ScenarioDefinition } from "@/app/lib/types";
import { filterDocumentsByPhase } from "@/app/lib/runtime";

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

function Card({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        border: "1px solid #e2e4ea",
        borderRadius: 14,
        padding: "20px 24px",
        background: "#fff",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 18, fontWeight: 700, color: "#1a3c6e" }}>
        {title}
      </h2>
      <div style={{ lineHeight: 1.7, fontSize: 14, color: "#444" }}>{children}</div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════

export default function IntroductionPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const router = useRouter();
  const { scenarioId } = use(params);

  const [scenario, setScenario] = useState<ScenarioDefinition | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Filter documents: before game starts, only globally available docs are shown
  const visibleDocuments = scenario
    ? filterDocumentsByPhase(scenario.phases || [], scenario.resources?.documents || [], null)
    : [];

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/scenarios/${scenarioId}`);
        if (!res.ok) throw new Error("Scenario not found");
        setScenario(await res.json());
      } catch {
        setError("Impossible de charger le scénario");
      } finally {
        setLoading(false);
      }
    })();

    if (typeof window !== "undefined") {
      const name = localStorage.getItem("user_name");
      if (name && name !== "undefined") setPlayerName(name);
    }
  }, [scenarioId]);

  function handleStart() {
    const name = playerName.trim() || "Joueur";
    localStorage.setItem(`sjg_playerName_${scenarioId}`, name);
    localStorage.setItem(`sjg_scenarioId`, scenarioId);
    setStarting(true);
    router.push(`/scenarios/${scenarioId}/play`);
  }

  // ── Loading ──
  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#f3f2f1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <p style={{ fontSize: 14, color: "#666" }}>Chargement du scénario...</p>
      </main>
    );
  }

  // ── Error ──
  if (error || !scenario) {
    return (
      <main style={{ minHeight: "100vh", background: "#f3f2f1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,.08)", textAlign: "center" }}>
          <p style={{ color: "#e94b3c", fontWeight: 600, marginBottom: 8 }}>Erreur</p>
          <p style={{ color: "#666", fontSize: 14 }}>{error || "Scénario introuvable"}</p>
          <button onClick={() => router.push("/")} style={{ marginTop: 16, padding: "8px 24px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            Retour
          </button>
        </div>
      </main>
    );
  }

  // ── Resolve cards by title pattern ──
  const cards = scenario.introduction?.cards || [];
  const findCard = (pattern: RegExp) => cards.find((c) => pattern.test(c.title.toLowerCase()));

  const contextCard = findCard(/contexte/);
  const roleCard = findCard(/r[oô]le/);
  const rulesCard = findCard(/r[èe]gle/);
  // "Ce qui t'attend" is hidden by default unless show_phases_preview: true
  const showPhasesPreview = (scenario.meta as any).show_phases_preview === true;
  const phasesCard = showPhasesPreview ? findCard(/attend|phases|étapes/) : null;

  // Any remaining cards not already picked
  const usedTitles = new Set(
    [contextCard, roleCard, rulesCard, phasesCard].filter(Boolean).map((c) => c!.title)
  );
  const extraCards = cards.filter((c) => !usedTitles.has(c.title) && !/attend|phases|étapes/.test(c.title.toLowerCase()));

  const difficulty = scenario.meta.difficulty;
  const difficultyLabel: Record<string, string> = {
    junior: "Débutant",
    intermediate: "Intermédiaire",
    senior: "Avancé",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
        padding: "24px 20px 48px",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* ── Back ── */}
        <button
          onClick={() => router.push("/")}
          style={{
            marginBottom: 20, background: "none", border: "none",
            color: "#5b5fc7", cursor: "pointer", fontSize: 13,
            padding: 0, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Retour aux scénarios
        </button>

        {/* ── Header banner ── */}
        <div
          style={{
            marginBottom: 24, padding: "24px 28px",
            borderRadius: 14, background: "#292929",
            color: "#fff", position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#7b7fff", textTransform: "uppercase", letterSpacing: 1 }}>
              {scenario.introduction?.header?.tag || "Simulation métier"}
            </span>
            <h1 style={{ margin: "8px 0 6px", fontSize: 28, fontWeight: 700 }}>
              {scenario.meta.title}
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#bbb", maxWidth: 700 }}>
              {scenario.introduction?.header?.subtitle || scenario.meta.subtitle}
            </p>
          </div>
          {/* Decorative gradient */}
          <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: "100%", background: "linear-gradient(90deg, transparent, rgba(91,95,199,0.15))", pointerEvents: "none" }} />
        </div>

        {/* ═══════ FULL-WIDTH: Contexte ═══════ */}
        {contextCard && (
          <Card title={contextCard.title} style={{ marginBottom: 16 }}>
            <div dangerouslySetInnerHTML={{ __html: contextCard.content }} />
          </Card>
        )}

        {/* ═══════ FULL-WIDTH: Ton rôle ═══════ */}
        {roleCard && (
          <Card title={roleCard.title} style={{ marginBottom: 16 }}>
            <div dangerouslySetInnerHTML={{ __html: roleCard.content }} />
          </Card>
        )}

        {/* ═══════ FULL-WIDTH: Ce qui t'attend (only if show_phases_preview) ═══════ */}
        {phasesCard && (
          <Card title={phasesCard.title} style={{ marginBottom: 16 }}>
            <div dangerouslySetInnerHTML={{ __html: phasesCard.content }} />
          </Card>
        )}

        {/* ═══════ Extra cards from JSON (full width each) ═══════ */}
        {extraCards.map((card) => (
          <Card key={card.title} title={card.title} style={{ marginBottom: 16 }}>
            <div dangerouslySetInnerHTML={{ __html: card.content }} />
          </Card>
        ))}

        {/* ═══════ 2 COLUMNS: Règles (gauche, 50%) + Identité & Infos empilés (droite, 50%) ═══════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
          {/* Règles du jeu — pleine hauteur gauche */}
          {rulesCard ? (
            <Card title={rulesCard.title} style={{ display: "flex", flexDirection: "column" }}>
              <div dangerouslySetInnerHTML={{ __html: rulesCard.content }} />
            </Card>
          ) : (
            <Card title="Règles du jeu" style={{ display: "flex", flexDirection: "column" }}>
              <p style={{ margin: 0 }}>Aucune règle spécifique n'a été définie pour ce scénario.</p>
            </Card>
          )}

          {/* Colonne droite : Identité + Infos empilés */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Identité */}
            <Card title="Votre identité">
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#555" }}>
                Comment souhaitez-vous être appelé(e) ?
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Votre nom ou pseudo"
                onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
                style={{
                  width: "100%", padding: "10px 12px", fontSize: 14,
                  border: "1px solid #ddd", borderRadius: 8,
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#888" }}>
                Nom réel ou pseudonyme, au choix.
              </p>
            </Card>

            {/* Durée + difficulté */}
            <Card title="Informations">
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#5b5fc7" }}>
                    {scenario.meta.estimated_duration_min}
                    <span style={{ fontSize: 13, fontWeight: 400, color: "#888" }}> min</span>
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>Durée estimée</p>
                </div>
                <div style={{ width: 1, height: 40, background: "#eee" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-block", padding: "3px 12px", borderRadius: 20,
                      fontSize: 12, fontWeight: 600,
                      background: difficulty === "junior" ? "#e8f5e9" : difficulty === "intermediate" ? "#fff3e0" : "#fce4ec",
                      color: difficulty === "junior" ? "#2e7d32" : difficulty === "intermediate" ? "#e65100" : "#c62828",
                    }}
                  >
                    {difficultyLabel[difficulty] || difficulty}
                  </span>
                  {scenario.meta.tags && scenario.meta.tags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {scenario.meta.tags.map((tag) => (
                        <span key={tag} style={{ fontSize: 10, color: "#666", background: "#f0f0f0", padding: "2px 7px", borderRadius: 10 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ═══════ DOCUMENTS SECTION ═══════ */}
        {visibleDocuments.length > 0 && (
          <Card title="📁 Vos documents de travail" style={{ marginBottom: 24 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666" }}>
              Consultez ces documents avant de commencer. Ils seront également accessibles pendant le jeu.
            </p>

            {selectedDocId ? (() => {
              const doc = visibleDocuments.find((d: any) => d.doc_id === selectedDocId);
              if (!doc) return null;
              const isPDF = !!(doc as any).file_path && (doc as any).file_path.endsWith(".pdf");
              return (
                <div>
                  <button
                    onClick={() => setSelectedDocId(null)}
                    style={{ background: "none", border: "none", color: "#5b5fc7", cursor: "pointer", fontSize: 12, fontWeight: 600, marginBottom: 12, padding: 0 }}
                  >
                    ← Retour à la liste
                  </button>
                  <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a3c6e" }}>
                    {(doc as any).image_path ? "🖼️" : isPDF ? "📑" : "📄"} {doc.label}
                  </h3>
                  {isPDF ? (
                    <a
                      href={`/api/download?file=${encodeURIComponent((doc as any).file_path)}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                        background: "#5b5fc7", color: "#fff", textDecoration: "none",
                      }}
                    >
                      ⬇ Télécharger le PDF
                    </a>
                  ) : (
                    <>
                      {(doc as any).image_path && (
                        <div style={{ marginBottom: 12, textAlign: "center" }}>
                          <img
                            src={(doc as any).image_path}
                            alt={doc.label}
                            style={{ maxWidth: "100%", maxHeight: 500, borderRadius: 8, border: "1px solid #e8e8e8", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                          />
                        </div>
                      )}
                      {(doc as any).content && (
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#333", whiteSpace: "pre-wrap", background: "#f9f9f9", padding: 14, borderRadius: 8, border: "1px solid #e8e8e8" }}>
                          {(doc as any).content}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })() : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {visibleDocuments.map((doc: any) => {
                  const hasImage = !!doc.image_path;
                  const hasPDF = !!doc.file_path && doc.file_path.endsWith(".pdf");
                  return hasPDF ? (
                    <a
                      key={doc.doc_id}
                      href={`/api/download?file=${encodeURIComponent(doc.file_path)}`}
                      style={{
                        padding: 14, borderRadius: 10, cursor: "pointer",
                        background: "#f8f9fc", border: "1px solid #e2e4ea",
                        transition: "all .15s", display: "flex", flexDirection: "column", gap: 8,
                        textDecoration: "none", color: "inherit",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(91,95,199,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e4ea"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>📑</span>
                        {doc.label}
                      </div>
                      <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>⬇ Cliquez pour télécharger</span>
                    </a>
                  ) : (
                    <div
                      key={doc.doc_id}
                      onClick={() => setSelectedDocId(doc.doc_id)}
                      style={{
                        padding: 14, borderRadius: 10, cursor: "pointer",
                        background: "#f8f9fc", border: "1px solid #e2e4ea",
                        transition: "all .15s", display: "flex", flexDirection: "column", gap: 8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(91,95,199,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e4ea"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      {hasImage && (
                        <div style={{ height: 100, borderRadius: 6, overflow: "hidden", background: "#eee" }}>
                          <img src={doc.image_path} alt={doc.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{hasImage ? "🖼️" : "📄"}</span>
                        {doc.label}
                      </div>
                      <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>Cliquer pour consulter</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* ═══════ TIP ═══════ */}
        <div style={{ textAlign: "center", marginBottom: 16, padding: "10px 20px", background: "#f0f0ff", borderRadius: 10, border: "1px solid #e0e0f0" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#5b5fc7", fontWeight: 500 }}>
            💡 Prenez le temps de lire les documents ci-dessus avant de commencer — vous pourrez y revenir pendant le jeu.
          </p>
        </div>

        {/* ═══════ START BUTTON ═══════ */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleStart}
            disabled={starting}
            style={{
              padding: "14px 48px", fontSize: 15, fontWeight: 700,
              border: "none", borderRadius: 10,
              background: starting ? "#999" : "#5b5fc7",
              color: "#fff", cursor: starting ? "not-allowed" : "pointer",
              boxShadow: starting ? "none" : "0 4px 16px rgba(91,95,199,0.35)",
              transition: "all .2s",
            }}
          >
            {starting ? "Chargement..." : "Commencer le scénario"}
          </button>
        </div>
      </div>
    </main>
  );
}
