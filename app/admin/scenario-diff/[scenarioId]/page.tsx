"use client";

/**
 * /admin/scenario-diff/[scenarioId] — VS3 git-blame view.
 *
 * Compare 2 versions archivées d'un scenario. Ajouts / retraits /
 * modifications par phase + par critère avec diff des champs.
 */

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";

interface DiffCriterion {
  id: string;
  description?: string;
  severity?: string;
  competencies?: string[];
  error_type?: string;
}
interface DiffEntry {
  phaseId: string;
  added: DiffCriterion[];
  removed: DiffCriterion[];
  modified: Array<{ id: string; before: DiffCriterion; after: DiffCriterion; changes: string[] }>;
}
interface ApiResponse {
  versions: string[];
  from?: string;
  to?: string;
  diff?: DiffEntry[];
}

export default function ScenarioDiffPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = usePromise(params);
  const router = useRouter();
  const [versions, setVersions] = useState<string[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [diff, setDiff] = useState<DiffEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token || role !== "super_admin") { router.push("/"); return; }
    fetch(`/api/admin/scenario-diff/${scenarioId}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setVersions(d.versions ?? []);
        if (d.versions?.length >= 2) {
          setFrom(d.versions[1]);
          setTo(d.versions[0]);
        }
      })
      .catch((e) => setError(String(e)));
  }, [scenarioId, router]);

  useEffect(() => {
    if (!from || !to || from === to) { setDiff(null); return; }
    const token = localStorage.getItem("auth_token");
    fetch(`/api/admin/scenario-diff/${scenarioId}?from=${from}&to=${to}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: ApiResponse) => setDiff(d.diff ?? []))
      .catch((e) => setError(String(e)));
  }, [from, to, scenarioId]);

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Diff scenario — {scenarioId}</h1>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
          {versions.length} version(s) archivée(s)
        </div>
      </header>

      {versions.length < 2 ? (
        <div style={cardStyle}>
          <div style={{ color: "#6b7280" }}>Il faut au moins 2 versions archivées pour comparer.</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
            L'archivage se fait automatiquement quand le champ <code>scenario.version</code>
            change et qu'une évaluation tourne (VS1).
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...cardStyle, marginBottom: 16, display: "flex", gap: 20, alignItems: "center" }}>
            <div>
              <label style={{ fontSize: 12, color: "#374151", marginRight: 8 }}>De :</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle}>
                {versions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <span style={{ color: "#9ca3af" }}>→</span>
            <div>
              <label style={{ fontSize: 12, color: "#374151", marginRight: 8 }}>À :</label>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle}>
                {versions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {error ? <div style={{ ...cardStyle, borderColor: "#c62828" }}>{error}</div> : null}

          {diff?.length === 0 ? (
            <div style={cardStyle}><div style={{ color: "#059669" }}>Aucun changement entre {from} et {to}</div></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {diff?.map((d) => (
                <div key={d.phaseId} style={cardStyle}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Phase <code>{d.phaseId}</code></h3>
                  {d.added.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ color: "#059669", fontSize: 12 }}>+ AJOUTÉS ({d.added.length})</strong>
                      {d.added.map((c) => (
                        <div key={c.id} style={{ ...diffLine, background: "#ecfdf5" }}>
                          <code style={{ fontFamily: "monospace" }}>{c.id}</code>
                          <span style={{ marginLeft: 8, fontSize: 12 }}>{c.description}</span>
                          <span style={sevBadge(c.severity)}>{c.severity ?? "required"}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {d.removed.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ color: "#b91c1c", fontSize: 12 }}>− RETIRÉS ({d.removed.length})</strong>
                      {d.removed.map((c) => (
                        <div key={c.id} style={{ ...diffLine, background: "#fef2f2", textDecoration: "line-through" }}>
                          <code>{c.id}</code>
                          <span style={{ marginLeft: 8, fontSize: 12 }}>{c.description}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {d.modified.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ color: "#d97706", fontSize: 12 }}>~ MODIFIÉS ({d.modified.length})</strong>
                      {d.modified.map((m) => (
                        <div key={m.id} style={{ ...diffLine, background: "#fffbeb", flexDirection: "column", alignItems: "flex-start" }}>
                          <div>
                            <code>{m.id}</code>
                            <span style={{ fontSize: 12, marginLeft: 8, color: "#374151" }}>{m.after.description}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#78350f", marginTop: 4 }}>
                            Changements : {m.changes.join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sevBadge(severity?: string) {
  const colors: Record<string, { bg: string; c: string }> = {
    critical: { bg: "#fee2e2", c: "#7f1d1d" },
    required: { bg: "#ede9fe", c: "#7c3aed" },
    bonus:    { bg: "#d1fae5", c: "#065f46" },
    minor:    { bg: "#e5e7eb", c: "#374151" },
  };
  const s = colors[severity ?? "required"];
  return {
    marginLeft: 8, padding: "1px 6px", fontSize: 9, fontWeight: 700 as const,
    color: s.c, background: s.bg, borderRadius: 4, textTransform: "uppercase" as const,
  };
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: 32, background: "#f8f9fc", fontFamily: "Segoe UI, sans-serif" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 };
const selectStyle: React.CSSProperties = { padding: "6px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4 };
const diffLine: React.CSSProperties = { display: "flex", alignItems: "center", padding: "6px 10px", borderRadius: 4, marginTop: 4, fontSize: 13 };
