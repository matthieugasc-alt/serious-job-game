"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export default function UsersPage({ params: paramsPromise }: PageProps) {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Form state
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [tempPassword, setTempPassword] = useState("");

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
          `/api/organizations/${params.orgId}/members`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (res.ok) {
          const data = await res.json();
          setMembers(data.members || []);
        } else {
          setError("Impossible de charger les membres");
        }
      } catch (err) {
        console.error("Error loading members:", err);
        setError("Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    };
    initAsync();
  }, [paramsPromise, router]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formName.trim()) {
      setSubmitError("Email et nom sont requis");
      return;
    }

    if (!authToken) return;

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    setTempPassword("");

    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            email: formEmail.trim(),
            name: formName.trim(),
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'ajout");
      }

      setSubmitSuccess("Utilisateur ajouté avec succès");
      if (data.tempPassword) {
        setTempPassword(data.tempPassword);
      }
      setFormEmail("");
      setFormName("");

      // Reload members
      const membersRes = await fetch(
        `/api/organizations/${orgId}/members`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.members || []);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Erreur lors de l'ajout");
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
        Utilisateurs
      </h1>
      <p style={{ margin: "0 0 32px", fontSize: 14, color: "#666" }}>
        Gérez les membres de votre organisation
      </p>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 10,
            marginBottom: 24,
            fontSize: 14,
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      )}

      {/* Add User Form */}
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
          Ajouter un utilisateur
        </h2>

        <form onSubmit={handleAddUser} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>
                Email *
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="exemple@email.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                disabled={submitting}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>
                Nom *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Jean Dupont"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                disabled={submitting}
              />
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
              {tempPassword && (
                <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, background: "rgba(0,0,0,0.05)", padding: 8, borderRadius: 4 }}>
                  Mot de passe temporaire: <strong>{tempPassword}</strong>
                </div>
              )}
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
            {submitting ? "Ajout en cours..." : "Ajouter l'utilisateur"}
          </button>
        </form>
      </div>

      {/* Members Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
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
                  Nom
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
                  Email
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
                  Rôle
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
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "40px 20px", textAlign: "center", color: "#999" }}>
                    Aucun utilisateur
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr
                    key={member.id}
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
                      {member.name}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      {member.email}
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          background: "#dbeafe",
                          color: "#1e40af",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 14, color: "#666" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          background:
                            member.status === "active"
                              ? "#dcfce7"
                              : member.status === "pending"
                                ? "#fef3c7"
                                : "#fee2e2",
                          color:
                            member.status === "active"
                              ? "#166534"
                              : member.status === "pending"
                                ? "#92400e"
                                : "#991b1b",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {member.status === "active"
                          ? "Actif"
                          : member.status === "pending"
                            ? "En attente"
                            : "Inactif"}
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
