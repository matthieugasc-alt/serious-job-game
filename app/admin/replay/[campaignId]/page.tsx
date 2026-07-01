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
import Link from "next/link";

interface EvaluationHistoryEntry {
  phaseId: string;
  timestamp: string;
  passed: boolean;
  appliedRule: string;
  matched: string[];
  missing: string[];
  unexpected: string[];
  // W-chantier
  criticalFailures?: string[];
  bonusMatched?: string[];
  weightedScore: number | null;
  weightedThreshold: number | null;
  reason: string;
  observation: {
    criteria: Record<string, boolean>;
    evidence?: Record<string, string>;
    meta?: { model?: string; at?: string };
  };
  // VS-chantier
  conditions?: {
    scenario_version?: string;
    engine_version?: string;
    ai_model?: string;
    prompt_version?: string;
    criterion_snapshots?: Array<{
      id: string;
      description: string;
      severity?: string;
      expected?: boolean;
      competencies?: string[];
      error_type?: string;
    }>;
  };
}

type Severity = "critical" | "required" | "bonus" | "minor";

interface PhaseContract {
  phase_id: string;
  title: string;
  observed_criteria?: Array<{
    id: string;
    description: string;
    expected?: boolean;
    severity?: Severity | string;
    competencies?: string[];
    error_type?: string;
  }>;
  required_criteria?: string[];
  min_criteria_count?: number;
  critical_failure_criteria?: string[];
}

const SEVERITY_STYLES: Record<Severity, { color: string; bg: string; label: string }> = {
  critical: { color: "#7f1d1d", bg: "#fee2e2", label: "critical" },
  required: { color: "#7c3aed", bg: "#ede9fe", label: "required" },
  bonus:    { color: "#065f46", bg: "#d1fae5", label: "bonus" },
  minor:    { color: "#374151", bg: "#e5e7eb", label: "minor" },
};

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
  const findContract = (phaseId: string): { contract: PhaseContract; scenarioId: string } | null => {
    for (const [scenarioId, scenarios] of Object.entries(data.phaseContracts)) {
      const found = scenarios.find((p) => p.phase_id === phaseId);
      if (found) return { contract: found, scenarioId };
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
            const lookup = findContract(entry.phaseId);
            // VS-chantier: prefer snapshot from evaluation time; fall back to current contract.
            let contract = lookup?.contract ?? null;
            let scenarioId = lookup?.scenarioId ?? null;
            const snapshots = entry.conditions?.criterion_snapshots;
            if (snapshots && snapshots.length > 0) {
              // Reconstitute contract from snapshot — the "git blame" replay.
              contract = {
                phase_id: entry.phaseId,
                title: contract?.title ?? entry.phaseId,
                observed_criteria: snapshots,
                required_criteria: contract?.required_criteria,
                critical_failure_criteria: contract?.critical_failure_criteria,
              };
            }
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
                    {scenarioId ? (
                      <Link
                        href={`/admin/replay/scenario/${scenarioId}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 11, color: "#2563eb", textDecoration: "underline" }}
                      >
                        voir les {50} dernières parties de {scenarioId} →
                      </Link>
                    ) : null}
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

                    {entry.criticalFailures && entry.criticalFailures.length > 0 ? (
                      <div style={{
                        background: "#fee2e2",
                        border: "2px solid #dc2626",
                        borderRadius: 6,
                        padding: "10px 14px",
                        color: "#7f1d1d",
                        fontSize: 13,
                        fontWeight: 600,
                      }}>
                        ⛔ Critère(s) critique(s) déclenché(s) : {entry.criticalFailures.join(", ")}
                        <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4, color: "#991b1b" }}>
                          Un critère critique observé annule immédiatement la phase — les autres règles n'ont pas été évaluées.
                        </div>
                      </div>
                    ) : null}

                    {contract?.observed_criteria ? (
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Critère</th>
                            <th style={thStyle}>Sévérité</th>
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
                            const isCriticalFired = entry.criticalFailures?.includes(c.id);
                            const isBonusMatched = entry.bonusMatched?.includes(c.id);
                            // Severity precedence: explicit > declared-as-critical-in-rules > default
                            const declaredCritical = contract.critical_failure_criteria?.includes(c.id);
                            const rawSev = c.severity ?? (declaredCritical ? "critical" : "required");
                            const sev: Severity = (["critical", "required", "bonus", "minor"] as const).includes(rawSev as Severity)
                              ? (rawSev as Severity)
                              : "required";
                            const style = SEVERITY_STYLES[sev];
                            return (
                              <tr key={c.id} style={isCriticalFired ? { background: "#fef2f2" } : undefined}>
                                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                                  {c.id}
                                  {isRequired ? (
                                    <span style={requiredBadge}>required</span>
                                  ) : null}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "1px 6px",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: style.color,
                                    background: style.bg,
                                    borderRadius: 4,
                                    textTransform: "uppercase",
                                  }}>{style.label}</span>
                                </td>
                                <td style={{ ...tdStyle, fontSize: 12 }}>{c.description}</td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                  {expected ? "✓" : "✗"}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center" }}>
                                  {observed === true ? "✓" : observed === false ? "✗" : "—"}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "center", fontSize: 16 }}>
                                  {isCriticalFired ? "⛔" : isMatched ? (isBonusMatched ? "⭐" : "🟢") : "🔴"}
                                </td>
                                <td style={{ ...tdStyle, fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                                  {entry.observation.evidence?.[c.id] ?? ""}
                                  {scenarioId ? (
                                    <div style={{ marginTop: 4 }}>
                                      <Link
                                        href={`/admin/edit-criterion/${scenarioId}/${entry.phaseId}/${c.id}`}
                                        style={{ fontSize: 10, color: "#2563eb", textDecoration: "underline" }}
                                      >
                                        éditer ce critère →
                                      </Link>
                                    </div>
                                  ) : null}
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
