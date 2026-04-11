"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGameHistory, deleteGameRecord } from "@/app/lib/gameHistory";
import type { GameRecord } from "@/app/lib/gameHistory";

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const endingConfig: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  success: { label: "Succes", color: "#16a34a", bg: "#dcfce7", emoji: "🎉" },
  partial_success: { label: "Succes partiel", color: "#d97706", bg: "#fef3c7", emoji: "⚠️" },
  failure: { label: "Echec", color: "#dc2626", bg: "#fee2e2", emoji: "💡" },
};

// ── PDF download ─────────────────────────────────────────────────

async function downloadPdf(record: GameRecord) {
  const payload = {
    ...record.debrief,
    scenario_title: record.scenarioTitle,
    player_name: record.playerName,
    game_date: formatDate(record.date),
  };

  const res = await fetch("/api/debrief/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    alert(errData?.error || "Erreur lors de la generation du PDF");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `debrief-${record.scenarioTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Page component ───────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setRecords(getGameHistory());
    setLoading(false);
  }, []);

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cette partie de l'historique ?")) return;
    deleteGameRecord(id);
    setRecords(getGameHistory());
  };

  const handleDownload = async (record: GameRecord) => {
    setDownloadingId(record.id);
    try {
      await downloadPdf(record);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
        padding: "28px 20px 40px",
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 700, color: "#111" }}>
              Historique des parties
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
              Retrouvez vos parties terminees et telechargez vos debriefs en PDF
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: "#555",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f9f9f9";
              e.currentTarget.style.borderColor = "#bbb";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#ddd";
            }}
          >
            Retour a l'accueil
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#666" }}>
            Chargement...
          </div>
        ) : records.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 4px 16px rgba(0,0,0,.04)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#333", margin: "0 0 8px" }}>
              Aucune partie enregistree
            </h2>
            <p style={{ fontSize: 14, color: "#888", margin: "0 0 20px" }}>
              Jouez un scenario pour voir votre historique ici.
            </p>
            <button
              onClick={() => router.push("/")}
              style={{
                padding: "12px 24px",
                background: "#5b5fc7",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Choisir un scenario
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {records.map((record) => {
              const cfg = endingConfig[record.ending] || endingConfig.failure;
              const isDownloading = downloadingId === record.id;

              return (
                <div
                  key={record.id}
                  style={{
                    background: "#fff",
                    borderRadius: 14,
                    padding: "20px 24px",
                    boxShadow: "0 2px 12px rgba(0,0,0,.05)",
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    transition: "box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      "0 4px 20px rgba(0,0,0,.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      "0 2px 12px rgba(0,0,0,.05)";
                  }}
                >
                  {/* Ending badge */}
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      background: cfg.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 28,
                      flexShrink: 0,
                    }}
                  >
                    {cfg.emoji}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        margin: "0 0 4px",
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#111",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {record.scenarioTitle}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: cfg.color,
                          background: cfg.bg,
                          padding: "2px 10px",
                          borderRadius: 12,
                        }}
                      >
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: 13, color: "#888" }}>
                        Score : {record.avgScore}%
                      </span>
                      <span style={{ fontSize: 12, color: "#aaa" }}>
                        {formatDate(record.date)}
                      </span>
                    </div>
                    {record.playerName && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 12,
                          color: "#999",
                        }}
                      >
                        Joueur : {record.playerName}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleDownload(record)}
                      disabled={isDownloading}
                      title="Telecharger le debrief en PDF"
                      style={{
                        padding: "8px 16px",
                        background: isDownloading ? "#e0e0e0" : "#5b5fc7",
                        color: isDownloading ? "#999" : "#fff",
                        border: "none",
                        borderRadius: 8,
                        cursor: isDownloading ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "background 0.2s",
                      }}
                    >
                      {isDownloading ? (
                        <>
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              border: "2px solid #ccc",
                              borderTopColor: "#999",
                              borderRadius: "50%",
                              display: "inline-block",
                              animation: "spin .6s linear infinite",
                            }}
                          />
                          PDF...
                        </>
                      ) : (
                        "PDF"
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(record.id)}
                      title="Supprimer"
                      style={{
                        padding: "8px 12px",
                        background: "#fff",
                        color: "#999",
                        border: "1px solid #e0e0e0",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 14,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#dc2626";
                        e.currentTarget.style.borderColor = "#fca5a5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#999";
                        e.currentTarget.style.borderColor = "#e0e0e0";
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
