"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Scenario {
  id: string;
  title: string;
  status: "draft" | "compiled" | "published" | "error";
  tags?: string[];
  updated_at?: string;
}

export default function StudioPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalTags, setModalTags] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load scenarios on mount
  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/studio", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load scenarios");
      const data = await res.json();
      setScenarios(data.scenarios || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateScenario = async () => {
    if (!modalTitle.trim()) {
      setError("Le titre est requis");
      return;
    }

    try {
      setCreating(true);
      setError("");
      const tags = modalTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: modalTitle.trim(), tags }),
      });

      if (!res.ok) throw new Error("Failed to create scenario");
      const data = await res.json();

      setShowModal(false);
      setModalTitle("");
      setModalTags("");
      router.push(`/studio/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteScenario = async (id: string) => {
    try {
      setDeleting(id);
      setError("");
      const res = await fetch(`/api/studio/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete scenario");

      setScenarios((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeleting(null);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    const baseStyle: React.CSSProperties = {
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      textTransform: "capitalize" as const,
    };

    const statusColors: Record<string, { bg: string; color: string }> = {
      draft: { bg: "rgba(234, 179, 8, 0.2)", color: "#eab308" },
      compiled: { bg: "rgba(59, 130, 246, 0.2)", color: "#3b82f6" },
      published: { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" },
      error: { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" },
    };

    const colors = statusColors[status] || statusColors.draft;
    return { ...baseStyle, background: colors.bg, color: colors.color };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0f0f23, #1a1a2e)",
        padding: "32px 20px",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 700, color: "#fff" }}>
            Scenario Studio
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
            Créez et éditez vos scénarios sans toucher au moteur global
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              color: "#fca5a5",
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Action bar */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: "#5b5fc7",
              color: "#fff",
              border: "none",
              padding: "12px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#4949a8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#5b5fc7";
            }}
          >
            + Nouveau scénario
          </button>
        </div>

        {/* Scenarios list */}
        {loading && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 16, padding: "40px 0" }}>
            Chargement...
          </div>
        )}

        {!loading && scenarios.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              padding: "60px 20px",
            }}
          >
            Aucun scénario. Commencez par en créer un !
          </div>
        )}

        {!loading && scenarios.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 16,
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
              >
                {/* Card header */}
                <div
                  onClick={() => router.push(`/studio/${scenario.id}`)}
                  style={{ marginBottom: 12 }}
                >
                  <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#fff" }}>
                    {scenario.title}
                  </h3>
                  <div style={{ marginBottom: 12 }}>
                    <span style={getStatusBadgeStyle(scenario.status)}>
                      {scenario.status === "draft"
                        ? "Brouillon"
                        : scenario.status === "compiled"
                          ? "Compilé"
                          : scenario.status === "published"
                            ? "Publié"
                            : "Erreur"}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                {scenario.tags && scenario.tags.length > 0 && (
                  <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {scenario.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          background: "rgba(91, 95, 199, 0.2)",
                          color: "#a5a8ff",
                          padding: "4px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Metadata */}
                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    Mis à jour {formatDate(scenario.updated_at)}
                  </p>
                </div>

                {/* Delete button */}
                <div>
                  {deleteConfirm === scenario.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleDeleteScenario(scenario.id)}
                        disabled={deleting === scenario.id}
                        style={{
                          flex: 1,
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          padding: "8px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: deleting === scenario.id ? "wait" : "pointer",
                          opacity: deleting === scenario.id ? 0.7 : 1,
                        }}
                      >
                        {deleting === scenario.id ? "Suppression..." : "Confirmer"}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        style={{
                          flex: 1,
                          background: "rgba(255,255,255,0.1)",
                          color: "#fff",
                          border: "none",
                          padding: "8px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(scenario.id)}
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.6)",
                        border: "none",
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                        e.currentTarget.style.color = "#fca5a5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                        e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a2e",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: 32,
              maxWidth: 400,
              width: "100%",
            }}
          >
            <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#fff" }}>
              Créer un nouveau scénario
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                Titre *
              </label>
              <input
                type="text"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateScenario();
                }}
                placeholder="Ex: Negotiation difficile"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "#fff",
                  fontSize: 13,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                Tags (optionnel, séparés par des virgules)
              </label>
              <input
                type="text"
                value={modalTags}
                onChange={(e) => setModalTags(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateScenario();
                }}
                placeholder="Ex: difficult, sales, high-stakes"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "#fff",
                  fontSize: 13,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreateScenario}
                disabled={creating}
                style={{
                  flex: 1,
                  background: "#5b5fc7",
                  color: "#fff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating ? "wait" : "pointer",
                  opacity: creating ? 0.7 : 1,
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!creating) e.currentTarget.style.background = "#4949a8";
                }}
                onMouseLeave={(e) => {
                  if (!creating) e.currentTarget.style.background = "#5b5fc7";
                }}
              >
                {creating ? "Création..." : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
