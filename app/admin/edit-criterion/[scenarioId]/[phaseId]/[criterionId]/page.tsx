"use client";

/**
 * /admin/edit-criterion/[scenarioId]/[phaseId]/[criterionId]
 *
 * X1 — vraie page d'édition inline d'un critère depuis le replay.
 * Charge le critère, permet d'éditer description/severity/expected/
 * competencies, PATCH via /api/admin/scenario-patch.
 */

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Criterion {
  id: string;
  description: string;
  expected?: boolean;
  weight?: number;
  severity?: "critical" | "required" | "bonus" | "minor";
  competencies?: string[];
  error_type?: string | null;
}

const SEVERITIES = ["critical", "required", "bonus", "minor"] as const;
const ERROR_TYPES = ["knowledge", "reasoning", "behavior", "regulatory", "communication"] as const;

export default function EditCriterionPage({
  params,
}: {
  params: Promise<{ scenarioId: string; phaseId: string; criterionId: string }>;
}) {
  const { scenarioId, phaseId, criterionId } = usePromise(params);
  const router = useRouter();
  const [criterion, setCriterion] = useState<Criterion | null>(null);
  const [available, setAvailable] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token || role !== "super_admin") {
      router.push("/");
      return;
    }
    // Load scenario JSON to find the criterion + available competencies
    Promise.all([
      fetch(`/api/admin/scenario-config?scenarioId=${scenarioId}`, {
        headers: { authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : Promise.reject("scenario"))),
      fetch(`/api/admin/competencies`, {
        headers: { authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : { competencies: [] })).catch(() => ({ competencies: [] })),
    ])
      .then(([sc, cp]) => {
        const phase = sc.scenario?.phases?.find((p: any) => p.phase_id === phaseId);
        const c = phase?.evaluation?.observed_criteria?.find((x: any) => x.id === criterionId);
        if (!c) {
          setError(`Critère "${criterionId}" introuvable dans ${scenarioId}::${phaseId}`);
        } else {
          setCriterion(c);
        }
        setAvailable(
          Array.isArray(cp.competencies)
            ? cp.competencies.map((x: any) => ({ id: x.id, label: x.label ?? x.id }))
            : [],
        );
      })
      .catch((e) => setError(typeof e === "string" ? `Chargement ${e} échoué` : "Erreur"))
      .finally(() => setLoading(false));
  }, [scenarioId, phaseId, criterionId, router]);

  async function save() {
    if (!criterion) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/admin/scenario-patch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scenarioId, phaseId, criterionId,
          patch: {
            description: criterion.description,
            expected: criterion.expected,
            weight: criterion.weight,
            severity: criterion.severity,
            competencies: criterion.competencies,
            error_type: criterion.error_type,
          },
        }),
      });
      if (!r.ok) {
        const body = await r.json();
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={pageStyle}>Chargement…</div>;
  if (error && !criterion) return <div style={pageStyle}><div style={{ ...cardStyle, borderColor: "#c62828" }}>{error}</div></div>;
  if (!criterion) return null;

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          <Link href={`/admin/replay/scenario/${scenarioId}`} style={{ color: "#2563eb" }}>
            ← {scenarioId}
          </Link>{" "}
          / <code>{phaseId}</code> / <code>{criterionId}</code>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 0" }}>
          Édition du critère
        </h1>
      </header>

      <div style={cardStyle}>
        <Field label="Description">
          <textarea
            value={criterion.description}
            onChange={(e) => setCriterion({ ...criterion, description: e.target.value })}
            rows={3}
            style={inputStyle}
          />
        </Field>

        <Field label="Sévérité">
          <select
            value={criterion.severity ?? ""}
            onChange={(e) => setCriterion({ ...criterion, severity: (e.target.value || undefined) as any })}
            style={inputStyle}
          >
            <option value="">(non déclarée — défaut required)</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Valeur attendue">
          <select
            value={String(criterion.expected ?? true)}
            onChange={(e) => setCriterion({ ...criterion, expected: e.target.value === "true" })}
            style={inputStyle}
          >
            <option value="true">true — le joueur DOIT le faire</option>
            <option value="false">false — le joueur NE DOIT PAS le faire</option>
          </select>
        </Field>

        <Field label="Poids (optionnel — override du severity-derived)">
          <input
            type="number"
            step="0.1"
            min="0"
            value={criterion.weight ?? ""}
            onChange={(e) => setCriterion({ ...criterion, weight: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
            style={inputStyle}
          />
        </Field>

        <Field label="Type d'erreur (CF)">
          <select
            value={criterion.error_type ?? ""}
            onChange={(e) => setCriterion({ ...criterion, error_type: e.target.value || null })}
            style={inputStyle}
          >
            <option value="">(non déclaré)</option>
            {ERROR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Compétences (référentiel Z)">
          {available.length === 0 ? (
            <div style={{ color: "#9ca3af", fontSize: 12 }}>
              Référentiel de compétences vide — configure-le dans <Link href="/admin/competencies" style={{ color: "#2563eb" }}>/admin/competencies</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {available.map((c) => {
                const selected = criterion.competencies?.includes(c.id) ?? false;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      const cur = new Set(criterion.competencies ?? []);
                      if (cur.has(c.id)) cur.delete(c.id); else cur.add(c.id);
                      setCriterion({ ...criterion, competencies: [...cur] });
                    }}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      border: selected ? "1px solid #2563eb" : "1px solid #d1d5db",
                      background: selected ? "#dbeafe" : "#fff",
                      color: selected ? "#1e3a8a" : "#374151",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={save} disabled={saving} style={{
            background: "#2563eb", color: "#fff", padding: "10px 24px",
            fontSize: 14, fontWeight: 600, border: "none", borderRadius: 6,
            cursor: saving ? "wait" : "pointer",
          }}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
          {saved ? <span style={{ color: "#059669", fontSize: 13 }}>✓ enregistré</span> : null}
          {error ? <span style={{ color: "#b91c1c", fontSize: 13 }}>⚠ {error}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: 32, background: "#f8f9fc", fontFamily: "Segoe UI, sans-serif" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 24, maxWidth: 700 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "inherit" };
