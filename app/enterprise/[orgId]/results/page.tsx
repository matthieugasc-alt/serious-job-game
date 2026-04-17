"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

interface Assignment {
  id: string;
  scenario_id: string;
  scenario_title?: string;
  user_id: string;
  user_name?: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  assignment_type: string;
  score?: number;
}

interface Stats {
  total: number;
  assigned: number;
  started: number;
  completed: number;
  mandatory_progress: number;
}

export default function ResultsPage({ params: paramsPromise }: PageProps) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "started" | "pending">("all");

  useEffect(() => {
    const initAsync = async () => {
      const params = await paramsPromise;
      setOrgId(params.orgId);

      const token = localStorage.getItem("auth_token");
      if (!token) {
        router.push("/login");
        return;
      }
      setAuthToken(token);

      try {
        const res = await fetch(
          `/api/organizations/${params.orgId}/assignments?stats=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          setAssignments(data.assignments || []);
          setStats({
            total: data.total || 0,
            assigned: data.assigned || 0,
            started: data.started || 0,
            completed: data.completed || 0,
            mandatory_progress:
              data.mandatory_progress || 0,
          });
        }
      } catch (err) {
        console.error("Error loading results:", err);
      } finally {
        setLoading(false);
      }
    };
    initAsync();
  }, [paramsPromise, router]);

  if (loading) {
    return (
      <div>
        <Link
          href={`/enterprise/${orgId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 24,
            color: "#2563eb",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Retour
        </Link>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: 16, color: "#666" }}>Chargement...</p>
        </div>
      </div>
    );
  }

  const filteredAssignments = assignments.filter((a) => {
    if (filterStatus === "all") return true;
    return a.status === filterStatus;
  });

  const statCards = [
    {
      label: "Total d'assignations",
      value: stats?.total ?? 0,
      icon: "📋",
      color: "#3b82f6",
    },
    {
      label: "Assignées",
      value: stats?.assigned ?? 0,
      icon: "📤",
      color: "#2563eb",
    },
    {
      label: "Commencées",
      value: stats?.started ?? 0,
      icon: "▶️",
      color: "#f59e0b",
    },
    {
      label: "Complétées",
      value: stats?.completed ?? 0,
      icon: "✅",
      color: "#16a34a",
    },
  ];

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/enterprise/${orgId}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
          color: "#2563eb",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        ← Retour
      </Link>

      {/* Header */}
      <h1 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 700, color: "#1f2937" }}>
        Résultats
      </h1>
      <p style={{ margin: "0 0 32px", fontSize: 14, color: "#666" }}>
        Vue d'ensemble de la progression des utilisateurs
      </p>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 20,
          marginBottom: 40,
        }}
      >
        {statCards.map((card, idx) => (
          <div
            key={idx}
            style={{
              background: "#fff",
              borderRadius: 18,
              padding: 20,
              boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 12 }}>{card.icon}</div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#999" }}>
              {card.label}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                color: card.color,
              }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      {stats && stats.total > 0 && (
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
            border: "1px solid #e5e7eb",
            marginBottom: 40,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
            Progression globale
          </h2>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: 12,
                  background: "#e5e7eb",
                  borderRadius: 999,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #f59e0b, #16a34a)",
                    width: `${((stats.completed || 0) / (stats.total || 1)) * 100}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
                <span>0%</span>
                <span>
                  {Math.round(
                    ((stats.completed || 0) / (stats.total || 1)) * 100
                  )}
                  %
                </span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 24, borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#1f2937" }}>
            Détail des assignations
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["all", "pending", "started", "completed"] as const).map(
              (status) => {
                const counts = {
                  all: assignments.length,
                  pending: assignments.filter((a) => a.status === "pending").length,
                  started: assignments.filter((a) => a.status === "started").length,
                  completed: assignments.filter((a) => a.status === "completed").length,
                };
                const label = {
                  all: "Toutes",
                  pending: "Non commencées",
                  started: "Commencées",
                  completed: "Complétées",
                };
                return (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border:
                        filterStatus === status
                          ? "2px solid #2563eb"
                          : "1px solid #ddd",
                      background:
                        filterStatus === status
                          ? "#dbeafe"
                          : "#fafafa",
                      color:
                        filterStatus === status
                          ? "#1e40af"
                          : "#666",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {label[status]} ({counts[status]})
                  </button>
                );
              }
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th
                  style={{
                    padding: "16px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Utilisateur
                </th>
                <th
                  style={{
                    padding: "16px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Scénario
                </th>
                <th
                  style={{
                    padding: "16px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "16px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Statut
                </th>
                <th
                  style={{
                    padding: "16px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Score
                </th>
                <th
                  style={{
                    padding: "16px 20px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Dates
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "40px 20px", textAlign: "center", color: "#999" }}>
                    Aucune assignation
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#1f2937", fontWeight: 500 }}>
                      {assignment.user_name || assignment.user_id}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      {assignment.scenario_title || assignment.scenario_id}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          background:
                            assignment.assignment_type === "mandatory"
                              ? "#fee2e2"
                              : "#e0e7ff",
                          color:
                            assignment.assignment_type === "mandatory"
                              ? "#991b1b"
                              : "#3730a3",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {assignment.assignment_type === "mandatory"
                          ? "Obligatoire"
                          : "Visible"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          background:
                            assignment.status === "completed"
                              ? "#dcfce7"
                              : assignment.status === "started"
                                ? "#fef3c7"
                                : "#dbeafe",
                          color:
                            assignment.status === "completed"
                              ? "#166534"
                              : assignment.status === "started"
                                ? "#92400e"
                                : "#1e40af",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {assignment.status === "completed"
                          ? "Complétée"
                          : assignment.status === "started"
                            ? "Commencée"
                            : "Non commencée"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      {assignment.score !== undefined ? (
                        <span style={{ fontWeight: 600, color: "#2563eb" }}>
                          {Math.round(assignment.score * 100)}%
                        </span>
                      ) : (
                        <span style={{ color: "#999" }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: "#666" }}>
                      <div>
                        {assignment.started_at
                          ? new Date(assignment.started_at).toLocaleDateString("fr-FR")
                          : "-"}
                      </div>
                      {assignment.completed_at && (
                        <div style={{ color: "#16a34a", fontSize: 11 }}>
                          ✓{" "}
                          {new Date(assignment.completed_at).toLocaleDateString("fr-FR")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
