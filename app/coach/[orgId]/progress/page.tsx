"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Assignment {
  id: string;
  scenarioId: string;
  userId: string;
  type: string;
  status: string;
  assignedAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface Member {
  userId: string;
  role: string;
  user: { id: string; name: string; email: string } | null;
}

interface Stats {
  total: number;
  assigned: number;
  started: number;
  completed: number;
  mandatoryTotal: number;
  mandatoryCompleted: number;
}

export default function CoachProgressPage({ params: paramsPromise }: { params: Promise<{ orgId: string }> }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    const init = async () => {
      const { orgId: id } = await paramsPromise;
      setOrgId(id);
      const token = localStorage.getItem("auth_token");
      if (!token) { router.push("/login"); return; }

      try {
        const [assignRes, memRes] = await Promise.all([
          fetch(`/api/organizations/${id}/assignments?stats=true`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/organizations/${id}/members`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (assignRes.ok) {
          const d = await assignRes.json();
          setAssignments(d.assignments || []);
          setStats(d.stats || null);
        }
        if (memRes.ok) {
          const d = await memRes.json();
          setMembers(d.members || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [paramsPromise, router]);

  if (loading) return <div style={{ padding: 40 }}>Chargement...</div>;

  const completionRate = stats && stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const filteredAssignments = filterStatus === "all"
    ? assignments
    : assignments.filter((a) => a.status === filterStatus);

  // Build per-coachee stats
  const coacheeMembers = members.filter((m) => m.role === "member");
  const perCoachee = coacheeMembers.map((m) => {
    const userAssignments = assignments.filter((a) => a.userId === m.userId);
    const completed = userAssignments.filter((a) => a.status === "completed").length;
    const mandatory = userAssignments.filter((a) => a.type === "mandatory");
    const mandatoryDone = mandatory.filter((a) => a.status === "completed").length;
    return {
      userId: m.userId,
      name: m.user?.name || "—",
      email: m.user?.email || "",
      total: userAssignments.length,
      completed,
      mandatoryTotal: mandatory.length,
      mandatoryCompleted: mandatoryDone,
      rate: userAssignments.length > 0 ? Math.round((completed / userAssignments.length) * 100) : 0,
    };
  });

  const statCards = [
    { label: "Total assignations", value: stats?.total || 0, color: "#7c3aed" },
    { label: "En attente", value: stats?.assigned || 0, color: "#6b7280" },
    { label: "En cours", value: stats?.started || 0, color: "#f59e0b" },
    { label: "Terminés", value: stats?.completed || 0, color: "#16a34a" },
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#1f2937" }}>Progression</h1>
      <p style={{ margin: "0 0 32px", fontSize: 14, color: "#666" }}>
        Suivi de la progression de vos coachés
      </p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {statCards.map((c) => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Overall Progress */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20, marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Taux de complétion global</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#7c3aed" }}>{completionRate}%</span>
        </div>
        <div style={{ background: "#f3f4f6", borderRadius: 8, height: 14, overflow: "hidden" }}>
          <div style={{ width: `${completionRate}%`, height: "100%", background: "linear-gradient(90deg, #7c3aed, #a855f7)", borderRadius: 8, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Per Coachee */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#1f2937" }}>Par coaché</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
        {perCoachee.map((c) => (
          <div
            key={c.userId}
            style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#999" }}>{c.email}</div>
              </div>
              <span style={{ fontWeight: 700, fontSize: 18, color: "#7c3aed" }}>{c.rate}%</span>
            </div>
            <div style={{ background: "#f3f4f6", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${c.rate}%`, height: "100%", background: "#7c3aed", borderRadius: 6 }} />
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#666" }}>
              <span>{c.completed}/{c.total} terminés</span>
              <span>|</span>
              <span>{c.mandatoryCompleted}/{c.mandatoryTotal} obligatoires</span>
            </div>
          </div>
        ))}
        {perCoachee.length === 0 && (
          <p style={{ color: "#999", fontSize: 14 }}>Aucun coaché</p>
        )}
      </div>

      {/* Detailed Table */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1f2937", margin: 0 }}>Détail des assignations</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {[{ key: "all", label: "Tous" }, { key: "assigned", label: "Assignés" }, { key: "started", label: "En cours" }, { key: "completed", label: "Terminés" }].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600,
                cursor: "pointer",
                background: filterStatus === f.key ? "#7c3aed" : "#f3f4f6",
                color: filterStatus === f.key ? "#fff" : "#666",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Coaché</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Scénario</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Type</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Statut</th>
              <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Dates</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssignments.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14 }}>Aucune assignation</td></tr>
            )}
            {filteredAssignments.map((a) => {
              const member = members.find((m) => m.userId === a.userId);
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: 500 }}>{member?.user?.name || a.userId}</td>
                  <td style={{ padding: "12px 20px", fontSize: 13 }}>{a.scenarioId}</td>
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
                  <td style={{ padding: "12px 20px", fontSize: 12, color: "#999" }}>
                    <div>Assigné: {new Date(a.assignedAt).toLocaleDateString("fr-FR")}</div>
                    {a.startedAt && <div>Débuté: {new Date(a.startedAt).toLocaleDateString("fr-FR")}</div>}
                    {a.completedAt && <div>Terminé: {new Date(a.completedAt).toLocaleDateString("fr-FR")}</div>}
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
