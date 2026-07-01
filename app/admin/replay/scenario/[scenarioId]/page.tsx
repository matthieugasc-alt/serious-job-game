"use client";

/**
 * /admin/replay/scenario/[scenarioId] — X-chantier X2.
 *
 * Vue agrégée cross-campaign pour un scenario donné.
 * Affiche :
 *   - Taux de complétion et de fail critique par phase
 *   - Match rate par critère (identifie les critères jamais matchés = trop
 *     durs à observer, prompt à améliorer, ou attente irréaliste)
 *   - Liste des 50 dernières campagnes avec drilldown vers le replay individuel
 */

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PhaseStats {
  phase_id: string;
  title: string;
  attempts: number;
  passRate: number | null;
  criticalRate: number | null;
  criteriaMatchRates: Record<string, { matched: number; seen: number; rate: number }>;
}

interface PhaseContract {
  phase_id: string;
  title: string;
  observed_criteria?: Array<{ id: string; description: string; severity?: string }>;
  required_criteria?: string[];
  critical_failure_criteria?: string[];
}

interface CampaignRow {
  campaignId: string;
  userId: string;
  createdAt: string;
  entries: Array<{
    phaseId: string;
    passed: boolean;
    appliedRule: string;
    timestamp: string;
    criticalFailures: string[];
  }>;
}

interface ApiResponse {
  scenarioId: string;
  scenarioTitle: string;
  phaseContract: PhaseContract[];
  phaseStats: PhaseStats[];
  campaigns: CampaignRow[];
  totalCampaigns: number;
}

export default function ScenarioReplayPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = usePromise(params);
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token || role !== "super_admin") {
      router.push("/");
      return;
    }
    fetch(`/api/admin/replay/scenario/${scenarioId}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ApiResponse) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scenarioId, router]);

  if (loading) return <div style={pageStyle}>Chargement…</div>;
  if (error || !data) return <div style={pageStyle}><div style={cardStyle}>Erreur : {error}</div></div>;

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          {data.scenarioTitle}
        </h1>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
          <code>{data.scenarioId}</code> · {data.totalCampaigns} campagne(s) enregistrée(s)
        </div>
      </header>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Statistiques par phase</h2>
      <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
        {data.phaseStats.map((ps) => {
          const contract = data.phaseContract.find((c) => c.phase_id === ps.phase_id);
          return (
            <div key={ps.phase_id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: 14 }}>{ps.phase_id}</strong>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{ps.title}</span>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 12 }}>
                <MetricBadge label="Tentatives" value={String(ps.attempts)} />
                <MetricBadge label="Taux de complétion" value={pct(ps.passRate)} color={rateColor(ps.passRate, false)} />
                <MetricBadge label="Fail critique" value={pct(ps.criticalRate)} color={rateColor(ps.criticalRate, true)} />
              </div>
              {contract?.observed_criteria ? (
                <table style={{ ...tableStyle, marginTop: 16 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Critère</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Match rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contract.observed_criteria.map((c) => {
                      const s = ps.criteriaMatchRates[c.id];
                      const rate = s?.rate ?? null;
                      return (
                        <tr key={c.id}>
                          <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{c.id}</td>
                          <td style={{ ...tdStyle, fontSize: 12 }}>{c.description}</td>
                          <td style={{ ...tdStyle, fontSize: 12, textAlign: "right" }}>
                            {s ? (
                              <span style={{ color: rate! < 0.2 ? "#b91c1c" : rate! > 0.8 ? "#059669" : "#374151", fontWeight: 600 }}>
                                {pct(rate)} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({s.matched}/{s.seen})</span>
                              </span>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>
        Dernières campagnes ({data.campaigns.length})
      </h2>
      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Campagne</th>
              <th style={thStyle}>Utilisateur</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Phases jouées</th>
              <th style={thStyle}>Résultat</th>
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map((c) => {
              const totalPhases = c.entries.length;
              const passed = c.entries.filter((e) => e.passed).length;
              const critical = c.entries.filter((e) => e.criticalFailures.length > 0).length;
              return (
                <tr key={c.campaignId}>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                    <Link href={`/admin/replay/${c.campaignId}`} style={{ color: "#2563eb" }}>
                      {c.campaignId.slice(0, 12)}…
                    </Link>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, fontFamily: "monospace" }}>{c.userId.slice(0, 8)}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{new Date(c.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td style={{ ...tdStyle, fontSize: 12, textAlign: "center" }}>{totalPhases}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>
                    <span style={{ color: "#059669" }}>{passed} ✓</span>
                    {" · "}
                    <span style={{ color: "#b91c1c" }}>{totalPhases - passed} ✗</span>
                    {critical > 0 ? <span style={{ marginLeft: 6, color: "#7f1d1d", fontWeight: 700 }}>⛔ {critical}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricBadge({ label, value, color = "#374151" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function rateColor(v: number | null, inverse: boolean): string {
  if (v == null) return "#9ca3af";
  const green = inverse ? v < 0.1 : v > 0.7;
  const red = inverse ? v > 0.3 : v < 0.4;
  return green ? "#059669" : red ? "#b91c1c" : "#d97706";
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: 32, background: "#f8f9fc", fontFamily: "Segoe UI, sans-serif" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb", color: "#374151", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: "8px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
