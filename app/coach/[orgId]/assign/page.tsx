"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Scenario {
  id: string;
  scenario_id: string;
  title: string;
  subtitle: string;
  difficulty: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string } | null;
}

interface Assignment {
  id: string;
  scenarioId: string;
  userId: string;
  type: string;
  status: string;
  assignedAt: string;
}

export default function CoachAssignPage({ params: paramsPromise }: { params: Promise<{ orgId: string }> }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [assignType, setAssignType] = useState<"visible" | "mandatory">("visible");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const { orgId: id } = await paramsPromise;
      setOrgId(id);
      const token = localStorage.getItem("auth_token");
      if (!token) { router.push("/login"); return; }
      await loadAll(id, token);
    };
    init();
  }, [paramsPromise, router]);

  async function loadAll(id: string, token: string) {
    setLoading(true);
    try {
      const [scenRes, memRes, assignRes] = await Promise.all([
        fetch("/api/scenarios", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/organizations/${id}/members`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/organizations/${id}/assignments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (scenRes.ok) {
        const d = await scenRes.json();
        setScenarios(d.scenarios || d || []);
      }
      if (memRes.ok) {
        const d = await memRes.json();
        setMembers((d.members || []).filter((m: Member) => m.role === "member"));
      }
      if (assignRes.ok) {
        const d = await assignRes.json();
        setAssignments(d.assignments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toggleScenario(id: string) {
    setSelectedScenarios((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  function toggleUser(id: string) {
    setSelectedUsers((prev) => prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]);
  }

  async function handleAssign() {
    if (selectedScenarios.length === 0 || selectedUsers.length === 0) {
      setMessage({ type: "error", text: "Sélectionnez au moins un scénario et un coaché" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("auth_token");

    try {
      const res = await fetch(`/api/organizations/${orgId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scenarioIds: selectedScenarios,
          userIds: selectedUsers,
          type: assignType,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `${data.created || 0} assignation(s) créée(s), ${data.updated || 0} mise(s) à jour` });
        setSelectedScenarios([]);
        setSelectedUsers([]);
        await loadAll(orgId, token!);
      } else {
        setMessage({ type: "error", text: data.error || "Erreur" });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Chargement...</div>;

  return (
    <div>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#1f2937" }}>Assigner des parcours</h1>
      <p style={{ margin: "0 0 32px", fontSize: 14, color: "#666" }}>
        Sélectionnez des scénarios et des coachés, puis choisissez le type d'assignation.
      </p>

      {message && (
        <div
          style={{
            padding: 14, borderRadius: 10, fontSize: 13, marginBottom: 20,
            background: message.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${message.type === "success" ? "#bbf7d0" : "#fecaca"}`,
            color: message.type === "success" ? "#166534" : "#991b1b",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        {/* Scenarios */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
            Scénarios ({selectedScenarios.length} sélectionné{selectedScenarios.length !== 1 ? "s" : ""})
          </h3>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {scenarios.map((s) => {
              const selected = selectedScenarios.includes(s.scenario_id || s.id);
              return (
                <div
                  key={s.scenario_id || s.id}
                  onClick={() => toggleScenario(s.scenario_id || s.id)}
                  style={{
                    padding: "12px 14px", marginBottom: 8, borderRadius: 10, cursor: "pointer",
                    border: selected ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                    background: selected ? "#f5f3ff" : "#fff",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{s.subtitle}</div>
                </div>
              );
            })}
            {scenarios.length === 0 && (
              <p style={{ color: "#999", fontSize: 13 }}>Aucun scénario disponible</p>
            )}
          </div>
        </div>

        {/* Coachees */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
            Coachés ({selectedUsers.length} sélectionné{selectedUsers.length !== 1 ? "s" : ""})
          </h3>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {members.map((m) => {
              const selected = selectedUsers.includes(m.userId);
              return (
                <div
                  key={m.userId}
                  onClick={() => toggleUser(m.userId)}
                  style={{
                    padding: "12px 14px", marginBottom: 8, borderRadius: 10, cursor: "pointer",
                    border: selected ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                    background: selected ? "#f5f3ff" : "#fff",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.user?.name || "—"}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{m.user?.email || ""}</div>
                </div>
              );
            })}
            {members.length === 0 && (
              <p style={{ color: "#999", fontSize: 13 }}>Aucun coaché. Ajoutez-en d'abord.</p>
            )}
          </div>
        </div>
      </div>

      {/* Type + Submit */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["visible", "mandatory"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setAssignType(t)}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none", fontSize: 14,
                fontWeight: 600, cursor: "pointer",
                background: assignType === t ? (t === "mandatory" ? "#dc2626" : "#7c3aed") : "#f3f4f6",
                color: assignType === t ? "#fff" : "#666",
              }}
            >
              {t === "visible" ? "Visible (optionnel)" : "Obligatoire"}
            </button>
          ))}
        </div>
        <button
          onClick={handleAssign}
          disabled={submitting || selectedScenarios.length === 0 || selectedUsers.length === 0}
          style={{
            padding: "10px 24px", background: submitting ? "#c4b5fd" : "#7c3aed",
            color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer", marginLeft: "auto",
          }}
        >
          {submitting ? "Assignation..." : "Assigner"}
        </button>
      </div>

      {/* Current Assignments */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1f2937" }}>
        Assignations en cours ({assignments.length})
      </h2>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Scénario</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Coaché</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Type</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14 }}>Aucune assignation</td></tr>
            )}
            {assignments.map((a) => {
              const user = members.find((m) => m.userId === a.userId);
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 20px", fontSize: 13 }}>{a.scenarioId}</td>
                  <td style={{ padding: "12px 20px", fontSize: 13 }}>{user?.user?.name || a.userId}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: a.type === "mandatory" ? "#fef2f2" : "#f5f3ff",
                      color: a.type === "mandatory" ? "#991b1b" : "#7c3aed",
                    }}>
                      {a.type === "mandatory" ? "Obligatoire" : "Visible"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: a.status === "completed" ? "#dcfce7" : a.status === "started" ? "#fef3c7" : "#f3f4f6",
                      color: a.status === "completed" ? "#166534" : a.status === "started" ? "#92400e" : "#555",
                    }}>
                      {a.status === "completed" ? "Terminé" : a.status === "started" ? "En cours" : "Assigné"}
                    </span>
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
