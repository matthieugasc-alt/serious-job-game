"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { ScenarioDefinition } from "@/app/lib/types";

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
