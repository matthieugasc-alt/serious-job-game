"use client";

/**
 * /admin/analytics — Y-chantier Y4.
 *
 * Répond aux 6 questions pilotables :
 *   - Taux d'abandon par phase
 *   - Durée moyenne par phase
 *   - Top critères jamais/peu validés
 *   - Top scenarios par taux de complétion
 *   - Top phases avec critical failures
 *   - Top sources de demandes d'aide
 *
 * super_admin only. Read-only, aucune écriture.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Analytics {
  phases: Array<{
    scenarioId: string;
    phaseId: string;
    attempts: number;
    abandonments: number;
    completions: number;
    abandonRate: number;
    criticalFailures: number;
    averageDurationMs: number;
  }>;
  criteria: Array<{
    scenarioId: string;
    phaseId: string;
    criterionId: string;
    matched: number;
    seen: number;
    matchRate: number;
  }>;
  scenarios: Array<{
    scenarioId: string;
    sessions: number;
    completions: number;
    abandonments: number;
    completionRate: number;
  }>;
  help: Array<{ scenarioId: string; phaseId: string; source: string; count: number }>;
  totalEvents: number;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token || role !== "super_admin") {
      router.push("/");
      return;
    }
    fetch("/api/admin/analytics", { headers: { authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div style={pageStyle}>Chargement…</div>;
  if (error || !data) return <div style={pageStyle}><div style={cardStyle}>Erreur : {error}</div></div>;

  const topAbandon = [...data.phases].filter((p) => p.attempts >= 3).sort((a, b) => b.abandonRate - a.abandonRate).slice(0, 10);
  const topSlow = [...data.phases].filter((p) => p.completions >= 3).sort((a, b) => b.averageDurationMs - a.averageDurationMs).slice(0, 10);
  const worstCriteria = [...data.criteria].filter((c) => c.seen >= 3).sort((a, b) => a.matchRate - b.matchRate).slice(0, 15);
  const topScenarios = [...data.scenarios].filter((s) => s.sessions >= 3).sort((a, b) => b.completionRate - a.completionRate).slice(0, 10);
  const topCritical = [...data.phases].filter((p) => p.criticalFailures > 0).sort((a, b) => b.criticalFailures - a.criticalFailures).slice(0, 10);
  const topHelp = [...data.help].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Analytics pédagogiques</h1>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
          {data.totalEvents.toLocaleString("fr-FR")} événements ingérés · agrégation live
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Section title="🚪 Où les joueurs abandonnent">
          <MetricTable
            columns={["Scénario", "Phase", "Tentatives", "Taux abandon"]}
            rows={topAbandon.map((p) => [
              scenarioLink(p.scenarioId),
              p.phaseId,
              String(p.attempts),
              <span key="r" style={{ color: p.abandonRate > 0.3 ? "#b91c1c" : "#374151", fontWeight: 600 }}>{pct(p.abandonRate)}</span>,
            ])}
            empty="Aucun abandon enregistré"
          />
        </Section>

        <Section title="⏱ Phases les plus longues">
          <MetricTable
            columns={["Scénario", "Phase", "Complétions", "Durée moyenne"]}
            rows={topSlow.map((p) => [
              scenarioLink(p.scenarioId),
              p.phaseId,
              String(p.completions),
              formatDuration(p.averageDurationMs),
            ])}
            empty="Pas assez de complétions pour calculer"
          />
        </Section>

        <Section title="🎯 Critères rarement validés">
          <MetricTable
            columns={["Scénario", "Phase", "Critère", "Match rate"]}
            rows={worstCriteria.map((c) => [
              scenarioLink(c.scenarioId),
              c.phaseId,
              <code key="c" style={{ fontSize: 11 }}>{c.criterionId}</code>,
              <span key="r" style={{ color: c.matchRate < 0.2 ? "#b91c1c" : c.matchRate < 0.5 ? "#d97706" : "#374151", fontWeight: 600 }}>
                {pct(c.matchRate)} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({c.matched}/{c.seen})</span>
              </span>,
            ])}
            empty="Aucun critère avec assez d'observations"
          />
        </Section>

        <Section title="🏆 Meilleurs scénarios (taux complétion)">
          <MetricTable
            columns={["Scénario", "Sessions", "Complétions", "Taux"]}
            rows={topScenarios.map((s) => [
              scenarioLink(s.scenarioId),
              String(s.sessions),
              String(s.completions),
              <span key="r" style={{ color: s.completionRate > 0.7 ? "#059669" : "#374151", fontWeight: 600 }}>{pct(s.completionRate)}</span>,
            ])}
            empty="Pas assez de sessions pour classer"
          />
        </Section>

        <Section title="⛔ Fails critiques par phase">
          <MetricTable
            columns={["Scénario", "Phase", "Fails critiques"]}
            rows={topCritical.map((p) => [
              scenarioLink(p.scenarioId),
              p.phaseId,
              <span key="c" style={{ color: "#7f1d1d", fontWeight: 700 }}>{p.criticalFailures}</span>,
            ])}
            empty="Aucun fail critique enregistré"
          />
        </Section>

        <Section title="🆘 Sources de demandes d'aide">
          <MetricTable
            columns={["Scénario", "Phase", "Source", "Occurrences"]}
            rows={topHelp.map((h) => [
              scenarioLink(h.scenarioId),
              h.phaseId || "(hors phase)",
              h.source,
              String(h.count),
            ])}
            empty="Aucune demande d'aide instrumentée"
          />
        </Section>
      </div>
    </div>
  );
}

function scenarioLink(scenarioId: string) {
  return (
    <Link href={`/admin/replay/scenario/${scenarioId}`} style={{ color: "#2563eb" }}>
      {scenarioId}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "#111" }}>{title}</h2>
      {children}
    </div>
  );
}

function MetricTable({ columns, rows, empty }: { columns: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return <div style={{ color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>{empty}</div>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>{columns.map((c) => <th key={c} style={thStyle}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => <td key={j} style={tdStyle}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const sec = ms / 1000;
  if (sec < 60) return `${Math.round(sec)}s`;
  const min = sec / 60;
  return `${min.toFixed(1)}min`;
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: 32, background: "#f8f9fc", fontFamily: "Segoe UI, sans-serif" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb", color: "#374151", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", fontSize: 12 };
