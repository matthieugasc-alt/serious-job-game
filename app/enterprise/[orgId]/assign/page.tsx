"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

interface Scenario {
  id: string;
  title: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
}

interface Assignment {
  id: string;
  scenario_id: string;
  scenario_title?: string;
  user_id: string;
  user_name?: string;
  assignment_type: string;
  status: string;
  created_at: string;
}

export default function AssignPage({ params: paramsPromise }: PageProps) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string>("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Form state
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [assignmentType, setAssignmentType] = useState<"visible" | "mandatory">("visible");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

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
        const [scenariosRes, membersRes, assignmentsRes] = await Promise.all([
          fetch("/api/scenarios", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/organizations/${params.orgId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(
            `/api/organizations/${params.orgId}/assignments?stats=true`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          ),
        ]);

        if (scenariosRes.ok) {
          const data = await scenariosRes.json();
          setScenarios(data.scenarios || []);
        }

        if (membersRes.ok) {
          const data = await membersRes.json();
          setMembers(data.members || []);
        }

        if (assignmentsRes.ok) {
          const data = await assignmentsRes.json();
          setAssignments(data.assignments || []);
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };
    initAsync();
  }, [paramsPromise, router]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedScenarios.length === 0 || selectedUsers.length === 0) {
      setSubmitError("Veuillez sélectionner au moins un scénario et un utilisateur");
      return;
    }

    if (!authToken) return;

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const res = await fetch(
        `/api/organizations/${orgId}/assignments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            scenario_ids: selectedScenarios,
            user_ids: selectedUsers,
            assignment_type: assignmentType,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'assignation");
      }

      setSubmitSuccess(
        `${selectedScenarios.length * selectedUsers.length} assignation(s) créée(s)`
      );
      setSelectedScenarios([]);
      setSelectedUsers([]);

      // Reload assignments
      const assignmentsRes = await fetch(
        `/api/organizations/${orgId}/assignments?stats=true`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      if (assignmentsRes.ok) {
        const assignmentsData = await assignmentsRes.json();
        setAssignments(assignmentsData.assignments || []);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Erreur lors de l'assignation");
    } finally {
      setSubmitting(false);
    }
  };

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
        Assigner des scénarios
      </h1>
      <p style={{ margin: "0 0 32px", fontSize: 14, color: "#666" }}>
        Assignez des scénarios à vos utilisateurs
      </p>

      {/* Assignment Form */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
          border: "1px solid #e5e7eb",
          marginBottom: 32,
        }}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: "#1f2937" }}>
          Nouvelle assignation
        </h2>

        <form onSubmit={handleAssign} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Scenarios */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>
              Scénarios *
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 10,
                maxHeight: 250,
                overflowY: "auto",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              {scenarios.length === 0 ? (
                <p style={{ color: "#999", fontSize: 14, margin: 0 }}>Aucun scénario disponible</p>
              ) : (
                scenarios.map((scenario) => (
                  <label
                    key={scenario.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: 6,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(37, 99, 235, 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedScenarios([...selectedScenarios, scenario.id]);
                        } else {
                          setSelectedScenarios(
                            selectedScenarios.filter((id) => id !== scenario.id)
                          );
                        }
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                        accentColor: "#2563eb",
                      }}
                    />
                    <span style={{ fontSize: 14, color: "#333" }}>{scenario.title}</span>
                  </label>
                ))
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#999" }}>
              {selectedScenarios.length} scénario(s) sélectionné(s)
            </p>
          </div>

          {/* Users */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>
              Utilisateurs *
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 10,
                maxHeight: 250,
                overflowY: "auto",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              {members.length === 0 ? (
                <p style={{ color: "#999", fontSize: 14, margin: 0 }}>Aucun utilisateur disponible</p>
              ) : (
                members.map((member) => (
                  <label
                    key={member.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: 6,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(37, 99, 235, 0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers([...selectedUsers, member.id]);
                        } else {
                          setSelectedUsers(
                            selectedUsers.filter((id) => id !== member.id)
                          );
                        }
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                        accentColor: "#2563eb",
                      }}
                    />
                    <span style={{ fontSize: 14, color: "#333" }}>{member.name}</span>
                  </label>
                ))
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#999" }}>
              {selectedUsers.length} utilisateur(s) sélectionné(s)
            </p>
          </div>

          {/* Assignment Type */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>
              Type d'assignation
            </label>
            <div style={{ display: "flex", gap: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="assignmentType"
                  value="visible"
                  checked={assignmentType === "visible"}
                  onChange={(e) => setAssignmentType(e.target.value as "visible" | "mandatory")}
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#2563eb" }}
                />
                <span style={{ fontSize: 14, color: "#333" }}>Visible</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="assignmentType"
                  value="mandatory"
                  checked={assignmentType === "mandatory"}
                  onChange={(e) => setAssignmentType(e.target.value as "visible" | "mandatory")}
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#2563eb" }}
                />
                <span style={{ fontSize: 14, color: "#333" }}>Obligatoire</span>
              </label>
            </div>
          </div>

          {submitError && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid #fecaca",
              }}
            >
              {submitError}
            </div>
          )}

          {submitSuccess && (
            <div
              style={{
                background: "#dcfce7",
                color: "#166534",
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid #86efac",
              }}
            >
              {submitSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 20px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.background = "#1d4ed8";
            }}
            onMouseLeave={(e) => {
              if (!submitting) e.currentTarget.style.background = "#2563eb";
            }}
          >
            {submitting ? "Assignation en cours..." : "Assigner"}
          </button>
        </form>
      </div>

      {/* Current Assignments */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
          border: "1px solid #e5e7eb",
        }}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: "#1f2937" }}>
          Assignations actuelles
        </h2>

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
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "40px 20px", textAlign: "center", color: "#999" }}>
                    Aucune assignation
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => (
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
                      {assignment.scenario_title || assignment.scenario_id}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      {assignment.user_name || assignment.user_id}
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
