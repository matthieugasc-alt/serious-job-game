"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
  user: { id: string; email: string; name: string; role: string; status?: string } | null;
}

export default function CoacheesPage({ params: paramsPromise }: { params: Promise<{ orgId: string }> }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const init = async () => {
      const { orgId: id } = await paramsPromise;
      setOrgId(id);
      const token = localStorage.getItem("auth_token");
      if (!token) { router.push("/login"); return; }
      await fetchMembers(id, token);
    };
    init();
  }, [paramsPromise, router]);

  async function fetchMembers(id: string, token: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${id}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      } else {
        setError("Impossible de charger les coachés");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCoachee(e: React.FormEvent) {
    e.preventDefault();
    if (!formEmail || !formName) return;

    setSubmitting(true);
    setError("");
    setSuccessMsg("");

    const token = localStorage.getItem("auth_token");
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: formEmail, name: formName }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(
          data.tempPassword
            ? `Coaché ajouté ! Mot de passe temporaire : ${data.tempPassword}`
            : "Coaché ajouté avec succès !"
        );
        setFormEmail("");
        setFormName("");
        await fetchMembers(orgId, token!);
      } else {
        setError(data.error || "Erreur lors de l'ajout");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Chargement...</div>;

  const coachees = members.filter((m) => m.role === "member");
  const admins = members.filter((m) => m.role === "admin");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#1f2937" }}>Mes coachés</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#666" }}>
            {coachees.length} coaché{coachees.length !== 1 ? "s" : ""} actif{coachees.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "10px 20px", background: "#7c3aed", color: "#fff",
            border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14,
            cursor: "pointer",
          }}
        >
          {showForm ? "Annuler" : "+ Ajouter un coaché"}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 24, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Nouveau coaché</h3>
          <form onSubmit={handleAddCoachee} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>Nom</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Jean Dupont"
                style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, width: 200 }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="jean@example.com"
                style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, width: 260 }}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "10px 20px", background: submitting ? "#c4b5fd" : "#7c3aed",
                color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Ajout..." : "Ajouter"}
            </button>
          </form>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div style={{ padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#991b1b", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ padding: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, color: "#166534", fontSize: 13, marginBottom: 16 }}>
          {successMsg}
        </div>
      )}

      {/* Coachees Table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "14px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Nom</th>
              <th style={{ textAlign: "left", padding: "14px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Email</th>
              <th style={{ textAlign: "left", padding: "14px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Rôle</th>
              <th style={{ textAlign: "left", padding: "14px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Statut</th>
              <th style={{ textAlign: "left", padding: "14px 20px", fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" }}>Depuis</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 14 }}>
                  Aucun coaché pour le moment. Ajoutez votre premier coaché !
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "14px 20px", fontSize: 14, fontWeight: 500 }}>
                  {m.user?.name || "—"}
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: "#666" }}>
                  {m.user?.email || "—"}
                </td>
                <td style={{ padding: "14px 20px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: m.role === "admin" ? "#ede9fe" : "#f3f4f6",
                      color: m.role === "admin" ? "#7c3aed" : "#555",
                    }}
                  >
                    {m.role === "admin" ? "Coach" : "Coaché"}
                  </span>
                </td>
                <td style={{ padding: "14px 20px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8, height: 8, borderRadius: "50%",
                      background: m.status === "active" ? "#16a34a" : "#f59e0b",
                      marginRight: 6,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#666" }}>
                    {m.status === "active" ? "Actif" : m.status === "pending" ? "En attente" : "Désactivé"}
                  </span>
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: "#999" }}>
                  {new Date(m.joinedAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
