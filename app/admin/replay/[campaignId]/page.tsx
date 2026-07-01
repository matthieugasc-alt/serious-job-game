"use client";

/**
 * /admin/replay/[campaignId] — E-chantier E5.
 *
 * Read-only view of a campaign's evaluation_history. For each phase
 * evaluated during the run, shows:
 *   - the scenario's declared observed_criteria (attendus)
 *   - what the AI observed (observés)
 *   - which rule was applied and the moteur's verdict
 *   - the reason (human-readable justification)
 *
 * Zero AI calls, zero side effects. Pure audit surface.
 */

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";

interface EvaluationHistoryEntry {
  phaseId: string;
  timestamp: string;
  passed: boolean;
  appliedRule: string;
  matched: string[];
  missing: string[];
  unexpected: string[];
  weightedScore: number | null;
  weightedThreshold: number | null;
  reason: string;
  observation: {
    criteria: Record<string, boolean>;
    evidence?: Record<string, string>;
    meta?: { model?: string; at?: string };
  };
}

interface PhaseContract {
  phase_id: string;
  title: string;
  observed_criteria?: Array<{ id: string; description: string; expected?: boolean }>;
  required_criteria?: string[];
  min_criteria_count?: number;
}

interface ApiResponse {
  campaign: {
    id: string;
    userId: string;
    status: string;
    createdAt: string;
    currentScenarioIndex: number;
    pendingScenarioId: string | null;
  };
  evaluation_history: EvaluationHistoryEntry[];
  phaseContracts: Record<string, PhaseContract[]>;
}

export default function AdminReplayPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = usePromise(params);
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token) {
      router.push("/login");
      return;
    }
    if (role !== "super_admin") {
      router.push("/");
      return;
    }
    fetch(`/api/admin/replay/${campaignId}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ApiResponse) => setData(d))
      .catch((e) => setError(e.message || "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [campaignId, router]);

  const toggle = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExpanded(next);
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center", padding: 40 }}>Chargement…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, borderColor: "#c62828" }}>
          <strong>Erreur :</strong> {error ?? "aucune donnée"}
        </div>
      </div>
    );
  }

  // Index phases by (scenarioId, phaseId) for cross-reference — the
  // history entry only has phaseId, so we look up across all scenarios.
  const findContract = (phaseId: string): PhaseContract | null => {
    for (const scenarios of Object.values(data.phaseContracts)) {
      const found = scenarios.find((p) => p.phase_id === phaseId);
      if (found) return found;
    }
    return null;
  };

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111" }}>
          Replay — {data.campaign.id}
        </h1>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
          Utilisateur : <code>{data.campaign.userId}</code> · Statut :{" "}
          <strong>{data.campaign.status}</strong> · Créée le{" "}
          {new Date(data.campaign.createdAt).toLocaleString("fr-FR")}
        </div>
      </header>

      {data.evaluation_history.length === 0 ? (
        <div style={{ ...cardStyle, color: "#6b7280" }}>
          Aucune évaluation E-chantier enregistrée pour cette campagne. Les phases
          n'ont pas encore migré vers <code>phase.evaluation.observed_criteria</code>,
          ou l'IA n'a pas encore observé de critères.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.evaluation_history.map((entry, i) => {
            const contract = findContract(entry.phaseId);
            const isOpen = expanded.has(i);
            return (
              <div key={i} style={cardStyle}>
                <button onClick={() => toggle(i)} style={rowButtonStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: entry.passed ? "#10b981" : "#ef4444",
                      }}
                    />
                    <strong style={{ fontSize: 14 }}>{entry.phaseId}</strong>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>
                      · {entry.appliedRule}
                    </span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>
                      · {new Date(entry.timestamp).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen ? (
                  <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 13, color: "#111" }}>{entry.reason}</div>

                    {contract?.observed_criteria ? (
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Critère</th>
                            <th style={thStyle}>Description</th>
                            <th style={thStyle}>Attendu</th>
                            <th style={thStyle}>Observé</th>
                            <th style={thStyle}>Verdict</th>
                            <th style={thStyle}>Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contract.observed_criteria.map((c) => {
                            const observed = entry.observation.criteria[c.id];
                            const expected = c.expected ?? true;
                            const isMatched = entry.matched.includes(c.id);
                            const isRequired = contract.required_criteria?.includes(c.id);
                            return (
                              <tr key={c.id}>
                                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                                  {c.id}
                                  {isRequired ? (
                                    <span style={requiredBadge}>required</span>
                                  ) : null}
                                </td>
                                <td style={{ ...tdStyle, fontSize: 12 }}>{c.description}</td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                  {expected ? "✓" : "✗"}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                  {observed === true ? "✓" : observed === false ? "✗" : "—"}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center", fontSize: 16 }}>
                                  {isMatched ? "🟢" : "🔴"}
                                </td>
                                <td style={{ ...tdStyle, fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                                  {entry.observation.evidence?.[c.id] ?? ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>
                        (Aucun contrat evaluation.observed_criteria retrouvé pour cette phase — probablement supprimé du scenario depuis la simulation.)
                      </div>
                    )}

                    {entry.unexpected.length > 0 ? (
                      <div style={{ fontSize: 12, color: "#b91c1c" }}>
                        ⚠ Critères observés hors schéma (drift IA) :{" "}
                        <code>{entry.unexpected.join(", ")}</code>
                      </div>
                    ) : null}

                    {entry.weightedScore != null ? (
                      <div style={{ fontSize: 12, color: "#374151" }}>
                        Seuil pondéré : <strong>{entry.weightedScore}</strong> /{" "}
                        {entry.weightedThreshold}
                      </div>
                    ) : null}

                    {entry.observation.meta ? (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        Modèle : {entry.observation.meta.model ?? "?"} · à{" "}
                        {entry.observation.meta.at ?? "?"}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 32,
  background: "#f8f9fc",
  fontFamily: "Segoe UI, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
};

const rowButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #e5e7eb",
  color: "#374151",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};

const requiredBadge: React.CSSProperties = {
  display: "inline-block",
  marginLeft: 6,
  padding: "1px 6px",
  fontSize: 9,
  fontWeight: 700,
  color: "#7c3aed",
  background: "#ede9fe",
  borderRadius: 4,
  textTransform: "uppercase",
};
