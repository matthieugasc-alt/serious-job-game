"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════
// ADMIN PAGE — Refonte: 3 onglets (Utilisateurs, Organisations, Scénarios)
// ═══════════════════════════════════════════════════════════════════

type ActiveTab = "users" | "organizations" | "scenarios";

// ── Shared types ─────────────────────────────────────────────────

interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt?: string;
  status?: string;
  createdBy?: string;
  coachProfile?: { level: string; certifiedAt?: string };
  founderAccess?: boolean;
}

interface OrgData {
  id: string;
  name: string;
  type: string;
  status: string;
  adminUserId: string;
  createdAt: string;
  settings: { description?: string };
}

interface OrgMember {
  userId: string;
  organizationId: string;
  role: string;
  user: { id: string; email: string; name: string; role: string; status?: string } | null;
}

interface Scenario {
  id: string;
  scenario_id: string;
  title: string;
  subtitle: string;
  difficulty: string;
  job_family?: string;
}

interface ScenarioConfig {
  scenario_id: string;
  adminLocked?: boolean;
  lockMessage?: string;
  prerequisites?: string[];
  category?: string;
}

// ── Styles ───────────────────────────────────────────────────────

const COLORS = {
  primary: "#5b5fc7",
  primaryHover: "#4949a8",
  accent: "#a5a8ff",
  bg: "rgba(255,255,255,0.06)",
  bgHover: "rgba(255,255,255,0.1)",
  border: "rgba(255,255,255,0.1)",
  borderHover: "rgba(255,255,255,0.2)",
  text: "#fff",
  textMuted: "rgba(255,255,255,0.6)",
  textDim: "rgba(255,255,255,0.4)",
  success: "#16a34a",
  successBg: "rgba(22,163,74,0.15)",
  successText: "#86efac",
  error: "#dc2626",
  errorBg: "rgba(220,38,38,0.15)",
  errorText: "#fca5a5",
};

const card = {
  background: COLORS.bg,
  borderRadius: 16,
  padding: 24,
  border: `1px solid ${COLORS.border}`,
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  background: "rgba(255,255,255,0.08)",
  border: `1px solid rgba(255,255,255,0.15)`,
  borderRadius: 8,
  color: COLORS.text,
  fontSize: 14,
  outline: "none" as const,
  boxSizing: "border-box" as const,
};

const btnPrimary = {
  padding: "10px 20px",
  background: COLORS.primary,
  color: COLORS.text,
  border: "none",
  borderRadius: 8,
  fontWeight: 600 as const,
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnSecondary = {
  padding: "10px 20px",
  background: "rgba(255,255,255,0.1)",
  color: COLORS.text,
  border: `1px solid ${COLORS.borderHover}`,
  borderRadius: 8,
  fontWeight: 600 as const,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s",
};

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AdminPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");

  useEffect(() => {
    const role = localStorage.getItem("user_role");
    const name = localStorage.getItem("user_name");
    const token = localStorage.getItem("auth_token");
    if (!name || !role) {
      router.push("/login");
      return;
    }
    if (role !== "super_admin" && role !== "admin") {
      router.push("/");
      return;
    }
    setUserRole(role);
    setUserToken(token);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, sans-serif", background: "#1a1a2e", color: "#fff" }}>
        Chargement...
      </div>
    );
  }

  if (userRole !== "super_admin" && userRole !== "admin") return null;

  const tabs: { key: ActiveTab; label: string; icon: string }[] = [
    { key: "users", label: "Utilisateurs", icon: "👤" },
    { key: "organizations", label: "Organisations", icon: "🏢" },
    { key: "scenarios", label: "Scénarios", icon: "🎬" },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        padding: "28px 20px 40px",
        fontFamily: "Segoe UI, sans-serif",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(91, 95, 199, 0.3)",
                  color: COLORS.accent,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Admin
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Espace Administrateur</h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: COLORS.textMuted }}>
              Gestion des utilisateurs, organisations et scénarios
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            style={btnSecondary}
          >
            Retour a l'accueil
          </button>
        </div>

        {/* Navigation tabs */}
        <div
          style={{
            display: "flex",
            gap: 24,
            borderBottom: `1px solid ${COLORS.border}`,
            marginBottom: 32,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "12px 0",
                fontSize: 16,
                fontWeight: activeTab === tab.key ? 700 : 500,
                color: activeTab === tab.key ? COLORS.accent : COLORS.textMuted,
                background: "none",
                border: "none",
                cursor: "pointer",
                borderBottom: activeTab === tab.key ? `2px solid ${COLORS.primary}` : "none",
                transition: "all 0.2s",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "users" && <UsersTab token={userToken || ""} />}
        {activeTab === "organizations" && <OrganizationsTab token={userToken || ""} />}
        {activeTab === "scenarios" && <ScenariosTab token={userToken || ""} />}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1: UTILISATEURS
// ═══════════════════════════════════════════════════════════════════

function UsersTab({ token }: { token: string }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [togglingFounder, setTogglingFounder] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, orgsRes] = await Promise.all([
        fetch("/api/auth/users", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/organizations", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      let allUsers: PublicUser[] = [];
      let allOrgs: OrgData[] = [];

      if (usersRes.ok) {
        const data = await usersRes.json();
        allUsers = data.users || [];
      }
      if (orgsRes.ok) {
        const data = await orgsRes.json();
        allOrgs = data.organizations || [];
      }

      setUsers(allUsers);
      setOrgs(allOrgs);

      // Fetch members for each org to map users → orgs
      const membersMap: Record<string, OrgMember[]> = {};
      await Promise.all(
        allOrgs.map(async (org) => {
          try {
            const res = await fetch(`/api/organizations/${org.id}/members`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              membersMap[org.id] = data.members || [];
            }
          } catch {
            // ignore
          }
        })
      );
      setOrgMembers(membersMap);
    } catch (err) {
      console.error("Failed to load users data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFounderAccess(userId: string, currentValue: boolean) {
    setTogglingFounder(userId);
    try {
      const res = await fetch("/api/auth/users/founder-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, founderAccess: !currentValue }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, founderAccess: !currentValue } : u));
      }
    } catch (err) {
      console.error("Failed to toggle founder access:", err);
    } finally {
      setTogglingFounder(null);
    }
  }

  // Build user → org mapping
  function getUserOrg(userId: string): { org: OrgData; role: string } | null {
    for (const org of orgs) {
      const members = orgMembers[org.id] || [];
      const member = members.find((m) => m.userId === userId);
      if (member) return { org, role: member.role };
    }
    return null;
  }

  // Categorize users
  function categorizeUser(user: PublicUser): "solo" | "enterprise" | "coach" {
    if (user.coachProfile) return "coach";
    const orgInfo = getUserOrg(user.id);
    if (orgInfo && orgInfo.org.type === "enterprise") return "enterprise";
    if (orgInfo && orgInfo.org.type === "coach") return "coach";
    return "solo";
  }

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const soloUsers = filtered.filter((u) => categorizeUser(u) === "solo");
  const enterpriseUsers = filtered.filter((u) => categorizeUser(u) === "enterprise");
  const coachUsers = filtered.filter((u) => categorizeUser(u) === "coach");

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.textMuted }}>Chargement des utilisateurs...</div>;
  }

  function renderUserRow(user: PublicUser) {
    const orgInfo = getUserOrg(user.id);
    const roleBadge = getRoleBadge(user.role);
    const hasFounder = user.founderAccess === true;
    const isToggling = togglingFounder === user.id;

    return (
      <div
        key={user.id}
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 2fr 1fr 1.5fr 0.8fr 0.8fr",
          gap: 12,
          padding: "14px 16px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          alignItems: "center",
          fontSize: 13,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      >
        <div style={{ fontWeight: 600, color: COLORS.text }}>{user.name}</div>
        <div style={{ color: COLORS.textMuted, fontSize: 12 }}>{user.email}</div>
        <div>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: roleBadge.bg,
              color: roleBadge.color,
            }}
          >
            {roleBadge.label}
          </span>
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
          {orgInfo ? (
            <span>
              {orgInfo.org.type === "enterprise" ? "🏢" : "🎓"}{" "}
              {orgInfo.org.name}
              <span style={{ opacity: 0.6 }}> ({orgInfo.role})</span>
            </span>
          ) : (
            <span style={{ opacity: 0.5 }}>—</span>
          )}
        </div>
        <div style={{ color: COLORS.textDim, fontSize: 11 }}>
          {user.status === "pending" ? (
            <span style={{ color: "#eab308" }}>En attente</span>
          ) : user.status === "disabled" ? (
            <span style={{ color: COLORS.errorText }}>Desactive</span>
          ) : (
            <span style={{ color: COLORS.successText }}>Actif</span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: isToggling ? "wait" : "pointer" }}>
            <input
              type="checkbox"
              checked={hasFounder}
              disabled={isToggling}
              onChange={() => toggleFounderAccess(user.id, hasFounder)}
              style={{ width: 16, height: 16, cursor: isToggling ? "wait" : "pointer", accentColor: COLORS.primary }}
            />
          </label>
        </div>
      </div>
    );
  }

  function renderGroup(title: string, icon: string, groupUsers: PublicUser[], description: string) {
    return (
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: COLORS.text }}>
              {icon} {title}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textMuted }}>{description}</p>
          </div>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              background: "rgba(91,95,199,0.2)",
              color: COLORS.accent,
            }}
          >
            {groupUsers.length}
          </span>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 2fr 1fr 1.5fr 0.8fr 0.8fr",
            gap: 12,
            padding: "8px 16px",
            fontSize: 11,
            fontWeight: 600,
            color: COLORS.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            borderBottom: `1px solid ${COLORS.border}`,
            marginBottom: 8,
          }}
        >
          <div>Nom</div>
          <div>Email</div>
          <div>Role</div>
          <div>Rattachement</div>
          <div>Statut</div>
          <div style={{ textAlign: "center" }}>Orisio</div>
        </div>

        {groupUsers.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: COLORS.textDim, fontSize: 13 }}>
            Aucun utilisateur dans ce groupe
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {groupUsers.map(renderUserRow)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Search bar */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Rechercher un utilisateur (nom, email, role)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 500 }}
        />
      </div>

      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {[
          { label: "Total", value: filtered.length, color: COLORS.accent },
          { label: "Solo", value: soloUsers.length, color: "#60a5fa" },
          { label: "Entreprise", value: enterpriseUsers.length, color: "#34d399" },
          { label: "Coach", value: coachUsers.length, color: "#f472b6" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: COLORS.bg,
              borderRadius: 12,
              padding: "16px 20px",
              border: `1px solid ${COLORS.border}`,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {renderGroup("Utilisateurs solo", "👤", soloUsers, "Comptes individuels sans rattachement a une organisation")}
      {renderGroup("Utilisateurs entreprise", "🏢", enterpriseUsers, "Membres d'une organisation de type entreprise")}
      {renderGroup("Coachs", "🎓", coachUsers, "Coachs rattaches a une organisation de coaching")}
    </div>
  );
}

function getRoleBadge(role: string): { bg: string; color: string; label: string } {
  switch (role) {
    case "super_admin":
      return { bg: "rgba(239,68,68,0.2)", color: "#fca5a5", label: "Super Admin" };
    case "admin":
      return { bg: "rgba(234,179,8,0.2)", color: "#eab308", label: "Admin" };
    default:
      return { bg: "rgba(91,95,199,0.15)", color: "#a5a8ff", label: "Utilisateur" };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2: ORGANISATIONS
// ═══════════════════════════════════════════════════════════════════

function OrganizationsTab({ token }: { token: string }) {
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [orgMemberCounts, setOrgMemberCounts] = useState<Record<string, number>>({});
  const [orgAdminNames, setOrgAdminNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"enterprise" | "coach">("enterprise");
  const [formAdminEmail, setFormAdminEmail] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  async function fetchOrgs() {
    setLoading(true);
    try {
      const [orgsRes, usersRes] = await Promise.all([
        fetch("/api/organizations", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/auth/users", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      let allOrgs: OrgData[] = [];
      let allUsers: PublicUser[] = [];

      if (orgsRes.ok) {
        const data = await orgsRes.json();
        allOrgs = data.organizations || [];
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        allUsers = data.users || [];
      }
      setOrgs(allOrgs);

      // Build admin name mapping
      const adminNames: Record<string, string> = {};
      allOrgs.forEach((org) => {
        const admin = allUsers.find((u) => u.id === org.adminUserId);
        if (admin) adminNames[org.id] = admin.name;
      });
      setOrgAdminNames(adminNames);

      // Fetch member counts
      const counts: Record<string, number> = {};
      await Promise.all(
        allOrgs.map(async (org) => {
          try {
            const res = await fetch(`/api/organizations/${org.id}/members`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              counts[org.id] = (data.members || []).length;
            }
          } catch {
            counts[org.id] = 0;
          }
        })
      );
      setOrgMemberCounts(counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName || !formAdminEmail) return;
    setCreating(true);
    setMessage(null);

    try {
      const usersRes = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      let adminUserId = "";
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const adminUser = (usersData.users || []).find(
          (u: any) => u.email.toLowerCase() === formAdminEmail.toLowerCase()
        );
        if (adminUser) adminUserId = adminUser.id;
      }

      if (!adminUserId) {
        setMessage({ type: "error", text: `Utilisateur "${formAdminEmail}" non trouve` });
        setCreating(false);
        return;
      }

      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formName,
          type: formType,
          adminUserId,
          description: formDescription || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Organisation "${formName}" creee !` });
        setFormName("");
        setFormAdminEmail("");
        setFormDescription("");
        setShowCreate(false);
        await fetchOrgs();
      } else {
        setMessage({ type: "error", text: data.error || "Erreur" });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur reseau" });
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.textMuted }}>Chargement...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: COLORS.text }}>
            Organisations ({orgs.length})
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>
            Gerez vos organisations entreprise et coach
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={btnPrimary}
          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.primaryHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.primary; }}
        >
          {showCreate ? "Annuler" : "+ Nouvelle organisation"}
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            fontSize: 13,
            marginBottom: 16,
            background: message.type === "success" ? COLORS.successBg : COLORS.errorBg,
            border: `1px solid ${message.type === "success" ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)"}`,
            color: message.type === "success" ? COLORS.successText : COLORS.errorText,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{ ...card, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: COLORS.text }}>Creer une organisation</h3>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>Nom</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nom de l'organisation"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>Email de l'admin</label>
                <input
                  type="email"
                  value={formAdminEmail}
                  onChange={(e) => setFormAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["enterprise", "coach"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "none",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        background: formType === t ? COLORS.primary : "rgba(255,255,255,0.1)",
                        color: formType === t ? COLORS.text : COLORS.textMuted,
                      }}
                    >
                      {t === "enterprise" ? "🏢 Entreprise" : "🎓 Coach"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>Description (optionnel)</label>
                <input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Description courte"
                  style={inputStyle}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              style={{ ...btnPrimary, alignSelf: "flex-start", opacity: creating ? 0.6 : 1, cursor: creating ? "not-allowed" : "pointer" }}
            >
              {creating ? "Creation..." : "Creer l'organisation"}
            </button>
          </form>
        </div>
      )}

      {/* Org grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
        {orgs.map((org) => (
          <div
            key={org.id}
            style={{
              ...card,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.bgHover;
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.bg;
              e.currentTarget.style.borderColor = COLORS.border;
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{org.type === "enterprise" ? "🏢" : "🎓"}</span>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.text }}>{org.name}</h3>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                  {org.type === "enterprise" ? "Entreprise" : "Coach"} · Cree le {new Date(org.createdAt).toLocaleDateString("fr-FR")}
                </div>
              </div>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: org.status === "active" ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)",
                  color: org.status === "active" ? COLORS.successText : COLORS.errorText,
                }}
              >
                {org.status === "active" ? "Actif" : "Suspendu"}
              </span>
            </div>

            {org.settings.description && (
              <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
                {org.settings.description}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: 16,
                padding: "10px 14px",
                background: "rgba(0,0,0,0.15)",
                borderRadius: 10,
                fontSize: 12,
                color: COLORS.textMuted,
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: COLORS.text }}>{orgMemberCounts[org.id] ?? "..."}</span> membre{(orgMemberCounts[org.id] ?? 0) > 1 ? "s" : ""}
              </div>
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 16 }}>
                Admin : <span style={{ fontWeight: 600, color: COLORS.text }}>{orgAdminNames[org.id] || "..."}</span>
              </div>
            </div>

            <a
              href={org.type === "enterprise" ? `/enterprise/${org.id}` : `/coach/${org.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 16px",
                background: "rgba(91,95,199,0.15)",
                border: "none",
                borderRadius: 8,
                color: COLORS.accent,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              Ouvrir l'espace →
            </a>
          </div>
        ))}

        {orgs.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: COLORS.textDim, fontSize: 14, gridColumn: "1 / -1" }}>
            Aucune organisation creee. Cliquez sur "+ Nouvelle organisation" pour commencer.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3: SCÉNARIOS — gestion de catalogue pure
//
// Source : /api/scenarios (même lib que la home : app/lib/scenarios.ts).
// Contrôles par scénario, tous branchés sur /api/admin/scenario-config
// (app/lib/scenarioConfig.ts → data/scenario_config.json) :
//   - Verrouiller / Déverrouiller (+ message de verrouillage)
//   - Prérequis (IDs de scénarios à compléter d'abord)
// La création/édition de scénarios ne se fait PAS ici (studio gelé,
// un vrai studio viendra plus tard).
// ═══════════════════════════════════════════════════════════════════

function ScenariosTab({ token }: { token: string }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [configs, setConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [editingConfigs, setEditingConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [savingConfigs, setSavingConfigs] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    loadScenarios();
  }, []);

  async function loadScenarios() {
    try {
      setLoading(true);
      setLoadError("");
      const [scenariosRes, configsRes] = await Promise.all([
        fetch("/api/scenarios", { cache: "no-store" }),
        fetch("/api/admin/scenario-config", { cache: "no-store" }),
      ]);

      if (!scenariosRes.ok) throw new Error(`Chargement des scénarios impossible (${scenariosRes.status})`);
      const scenariosData = await scenariosRes.json();
      setScenarios(scenariosData.scenarios || []);

      if (!configsRes.ok) throw new Error(`Chargement de la configuration impossible (${configsRes.status})`);
      const configsData = await configsRes.json();
      const configMap: Record<string, ScenarioConfig> = {};
      (configsData.configs || []).forEach((cfg: any) => {
        const sid = cfg.scenarioId || cfg.scenario_id;
        configMap[sid] = {
          scenario_id: sid,
          adminLocked: cfg.adminLocked,
          lockMessage: cfg.lockMessage,
          prerequisites: cfg.prerequisites,
          category: cfg.category,
        };
      });
      setConfigs(configMap);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  function getEditingConfig(scenarioId: string): ScenarioConfig {
    if (editingConfigs[scenarioId]) return editingConfigs[scenarioId];
    if (configs[scenarioId]) return configs[scenarioId];
    return { scenario_id: scenarioId, adminLocked: false, lockMessage: "", prerequisites: [], category: "" };
  }

  function handleConfigChange(scenarioId: string, field: keyof ScenarioConfig, value: any) {
    const current = getEditingConfig(scenarioId);
    setEditingConfigs((prev) => ({ ...prev, [scenarioId]: { ...current, [field]: value } }));
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });
  }

  async function handleSaveConfig(scenarioId: string) {
    if (!token) return;
    setSavingConfigs((prev) => ({ ...prev, [scenarioId]: true }));
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[scenarioId];
      return next;
    });
    try {
      const config = getEditingConfig(scenarioId);
      const payload = {
        scenarioId: config.scenario_id,
        adminLocked: config.adminLocked === true,
        lockMessage: config.lockMessage ?? "",
        prerequisites: Array.isArray(config.prerequisites) ? config.prerequisites : [],
        category: config.category ?? "",
      };

      const res = await fetch("/api/admin/scenario-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }

      setConfigs((prev) => ({ ...prev, [scenarioId]: config }));
      setEditingConfigs((prev) => {
        const next = { ...prev };
        delete next[scenarioId];
        return next;
      });
      setFeedback((prev) => ({ ...prev, [scenarioId]: { type: "success", text: "Enregistré ✓" } }));
      setTimeout(() => {
        setFeedback((prev) => {
          if (prev[scenarioId]?.type !== "success") return prev;
          const next = { ...prev };
          delete next[scenarioId];
          return next;
        });
      }, 3000);
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [scenarioId]: { type: "error", text: err instanceof Error ? err.message : "Erreur lors de la sauvegarde" },
      }));
    } finally {
      setSavingConfigs((prev) => ({ ...prev, [scenarioId]: false }));
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.textMuted }}>Chargement des scénarios...</div>;
  }

  // Categories already in use (config overrides + job_family fallbacks) for the datalist
  const knownCategories = Array.from(
    new Set<string>(
      [
        ...Object.values(configs).map((c) => c.category || ""),
        ...Object.values(editingConfigs).map((c) => c.category || ""),
        ...scenarios.map((s) => s.job_family || ""),
      ].map((c) => c.trim()).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>
            Catalogue ({scenarios.length} scénario{scenarios.length > 1 ? "s" : ""})
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>
            Verrouillage et prérequis des scénarios déployés. La création de scénarios ne se fait pas ici.
          </p>
        </div>
        <button onClick={loadScenarios} style={btnSecondary}>
          Rafraîchir
        </button>
      </div>

      {/* Shared datalist for the per-card "Catégorie" inputs */}
      <datalist id="admin-scenario-categories">
        {knownCategories.map((cat) => (
          <option key={cat} value={cat} />
        ))}
      </datalist>

      {loadError && (
        <div style={{ background: COLORS.errorBg, border: "1px solid rgba(220,38,38,0.4)", color: COLORS.errorText, padding: 14, borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {!loadError && scenarios.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textDim }}>Aucun scénario déployé</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
          {scenarios.map((scenario) => {
            const config = getEditingConfig(scenario.scenario_id);
            const isSaving = savingConfigs[scenario.scenario_id];
            const cardFeedback = feedback[scenario.scenario_id];
            const isDirty = !!editingConfigs[scenario.scenario_id];

            return (
              <div key={scenario.scenario_id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Title & meta */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{scenario.title}</h3>
                    {config.adminLocked && <span style={{ fontSize: 14 }} title="Verrouillé">🔒</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>{scenario.subtitle}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", background: "rgba(91,95,199,0.2)", color: COLORS.accent, borderRadius: 4 }}>
                      {config.category?.trim() || scenario.job_family || "Autre"}
                    </span>
                    <span style={{ fontSize: 12, padding: "3px 8px", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", borderRadius: 4 }}>
                      {scenario.difficulty}
                    </span>
                    <span style={{ fontSize: 12, padding: "3px 8px", background: "rgba(255,255,255,0.06)", color: COLORS.textDim, borderRadius: 4, fontFamily: "monospace" }}>
                      {scenario.scenario_id}
                    </span>
                  </div>
                </div>

                {/* Config controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "rgba(0,0,0,0.15)", borderRadius: 10, fontSize: 13 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 2 }}>
                      Catégorie (affichage catalogue — vide = famille métier du scénario)
                    </label>
                    <input
                      type="text"
                      list="admin-scenario-categories"
                      placeholder={scenario.job_family || "Autre"}
                      value={config.category || ""}
                      onChange={(e) => handleConfigChange(scenario.scenario_id, "category", e.target.value)}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={config.adminLocked || false}
                      onChange={(e) => handleConfigChange(scenario.scenario_id, "adminLocked", e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: COLORS.primary }}
                    />
                    Verrouiller (visible sur le catalogue, mais non jouable)
                  </label>
                  {config.adminLocked && (
                    <input
                      type="text"
                      placeholder="Message de verrouillage (optionnel)"
                      value={config.lockMessage || ""}
                      onChange={(e) => handleConfigChange(scenario.scenario_id, "lockMessage", e.target.value)}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}
                    />
                  )}
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 2 }}>
                      Prérequis (IDs de scénarios, séparés par des virgules)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex : cpo_diagnostic, cpo_decision"
                      value={(config.prerequisites || []).join(", ")}
                      onChange={(e) => handleConfigChange(scenario.scenario_id, "prerequisites", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}
                    />
                  </div>
                </div>

                {/* Save + feedback */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => handleSaveConfig(scenario.scenario_id)}
                    disabled={isSaving}
                    style={{ ...btnPrimary, padding: "8px 16px", fontSize: 12, opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "wait" : "pointer" }}
                  >
                    {isSaving ? "Sauvegarde..." : "Enregistrer"}
                  </button>
                  {cardFeedback && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: cardFeedback.type === "success" ? COLORS.successText : COLORS.errorText }}>
                      {cardFeedback.text}
                    </span>
                  )}
                  {!cardFeedback && isDirty && (
                    <span style={{ fontSize: 12, color: COLORS.textDim }}>Modifications non enregistrées</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
