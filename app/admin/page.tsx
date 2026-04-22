"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  id: string;
  scenario_id: string;
  adminLocked?: boolean;
  lockMessage?: string;
  prerequisites?: string[];
  categoryOverride?: string;
  sortOrder?: number;
  featured?: boolean;
}

interface StudioScenario {
  id: string;
  title: string;
  status: string;
  updatedAt?: string;
  jobFamilies?: string[];
  isTeaserVisible?: boolean;
}

interface JobFamilyRow {
  id: string;
  label: string;
  active: boolean;
  order?: number;
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
        {activeTab === "scenarios" && <ScenariosTab token={userToken || ""} router={router} />}
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
// TAB 3: SCÉNARIOS (unified management + AI editor + studio)
// ═══════════════════════════════════════════════════════════════════

function ScenariosTab({ token, router }: { token: string; router: any }) {
  // ── Deployed scenarios (management) ──
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [configs, setConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [editingConfigs, setEditingConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [savingConfigs, setSavingConfigs] = useState<Record<string, boolean>>({});
  const [scenariosLoading, setScenariosLoading] = useState(false);

  // ── Studio scenarios ──
  const [studioScenarios, setStudioScenarios] = useState<StudioScenario[]>([]);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState("");

  // ── Studio create modal ──
  const [studioShowModal, setStudioShowModal] = useState(false);
  const [studioModalTitle, setStudioModalTitle] = useState("");
  const [studioModalTags, setStudioModalTags] = useState("");
  const [studioCreating, setStudioCreating] = useState(false);

  // ── Studio delete ──
  const [studioDeleteConfirm, setStudioDeleteConfirm] = useState<string | null>(null);
  const [studioDeleting, setStudioDeleting] = useState<string | null>(null);

  // ── Job families ──
  const [jobFamilies, setJobFamilies] = useState<JobFamilyRow[]>([]);
  const [jobFamiliesLoading, setJobFamiliesLoading] = useState(false);
  const [jobFamiliesError, setJobFamiliesError] = useState("");
  const [newFamilyLabel, setNewFamilyLabel] = useState("");
  const [newFamilyId, setNewFamilyId] = useState("");

  // ── AI Editor state ──
  const [editorScenarioId, setEditorScenarioId] = useState<string | null>(null);
  const [editorInput, setEditorInput] = useState("");
  const [editorMessages, setEditorMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [editorPendingChanges, setEditorPendingChanges] = useState<any[] | null>(null);
  const [editorSending, setEditorSending] = useState(false);
  const [editorApplying, setEditorApplying] = useState(false);
  const editorChatEndRef = useRef<HTMLDivElement>(null);

  // ── PDF Conversion state ──
  type Step = "idle" | "uploading" | "extracting" | "converting" | "done" | "error";
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [scenarioJson, setScenarioJson] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Sub-view ──
  type SubView = "list" | "editor" | "convert";
  const [subView, setSubView] = useState<SubView>("list");

  // ── Load data ──
  useEffect(() => {
    loadScenarios();
    loadStudioScenarios();
    loadJobFamilies();
  }, []);

  const loadScenarios = async () => {
    try {
      setScenariosLoading(true);
      const [scenariosRes, configsRes] = await Promise.all([
        fetch("/api/scenarios"),
        fetch("/api/admin/scenario-config"),
      ]);

      if (scenariosRes.ok) {
        const data = await scenariosRes.json();
        setScenarios(data.scenarios || []);
      }

      if (configsRes.ok) {
        const data = await configsRes.json();
        const configMap: Record<string, ScenarioConfig> = {};
        (data.configs || []).forEach((cfg: any) => {
          const mapped: ScenarioConfig = {
            id: cfg.scenarioId || cfg.scenario_id,
            scenario_id: cfg.scenarioId || cfg.scenario_id,
            adminLocked: cfg.adminLocked,
            lockMessage: cfg.lockMessage,
            prerequisites: cfg.prerequisites,
            categoryOverride: cfg.category,
            sortOrder: cfg.order,
            featured: cfg.featured,
          };
          configMap[mapped.scenario_id] = mapped;
        });
        setConfigs(configMap);
      }
    } catch (err: any) {
      console.error("Failed to load scenarios:", err);
    } finally {
      setScenariosLoading(false);
    }
  };

  const loadStudioScenarios = async () => {
    try {
      setStudioLoading(true);
      setStudioError("");
      const res = await fetch("/api/studio", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load studio scenarios");
      const data = await res.json();
      setStudioScenarios(data.scenarios || []);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setStudioLoading(false);
    }
  };

  const loadJobFamilies = async () => {
    try {
      setJobFamiliesLoading(true);
      setJobFamiliesError("");
      const res = await fetch("/api/job-families", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setJobFamilies(data.families || []);
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setJobFamiliesLoading(false);
    }
  };

  // ── Config management ──
  const getEditingConfig = (scenarioId: string): ScenarioConfig => {
    if (editingConfigs[scenarioId]) return editingConfigs[scenarioId];
    if (configs[scenarioId]) return configs[scenarioId];
    return {
      id: scenarioId,
      scenario_id: scenarioId,
      adminLocked: false,
      lockMessage: "",
      prerequisites: [],
      categoryOverride: "",
      sortOrder: 0,
      featured: false,
    };
  };

  const handleConfigChange = (scenarioId: string, field: keyof ScenarioConfig, value: any) => {
    const current = getEditingConfig(scenarioId);
    setEditingConfigs((prev) => ({ ...prev, [scenarioId]: { ...current, [field]: value } }));
  };

  const handleSaveConfig = async (scenarioId: string) => {
    if (!token) return;
    setSavingConfigs((prev) => ({ ...prev, [scenarioId]: true }));
    try {
      const config = getEditingConfig(scenarioId);
      const payload = {
        scenarioId: config.scenario_id,
        adminLocked: config.adminLocked === true,
        lockMessage: config.lockMessage ?? "",
        prerequisites: Array.isArray(config.prerequisites) ? config.prerequisites : [],
        category: config.categoryOverride ?? "",
        order: typeof config.sortOrder === "number" ? config.sortOrder : 0,
        featured: config.featured === true,
      };

      const res = await fetch("/api/admin/scenario-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Erreur (${res.status}): ${errText}`);
      }

      setEditingConfigs((prev) => {
        const next = { ...prev };
        delete next[scenarioId];
        return next;
      });
      await loadScenarios();
    } catch (err: any) {
      console.error("Save config error:", err);
      alert(err?.message || "Erreur lors de la sauvegarde");
    } finally {
      setSavingConfigs((prev) => ({ ...prev, [scenarioId]: false }));
    }
  };

  // ── Studio CRUD ──
  const handleStudioCreate = async () => {
    if (!studioModalTitle.trim()) {
      setStudioError("Le titre est requis");
      return;
    }
    try {
      setStudioCreating(true);
      setStudioError("");
      const tags = studioModalTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: studioModalTitle.trim(), tags }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Echec de la creation");
      const createdId = data.scenario?.id;
      if (!createdId) throw new Error("ID manquant dans la reponse");
      setStudioShowModal(false);
      setStudioModalTitle("");
      setStudioModalTags("");
      router.push(`/studio/${createdId}`);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Erreur lors de la creation");
    } finally {
      setStudioCreating(false);
    }
  };

  const handleStudioDelete = async (id: string) => {
    try {
      setStudioDeleting(id);
      setStudioError("");
      const res = await fetch(`/api/studio/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Echec de la suppression");
      setStudioScenarios((prev) => prev.filter((s) => s.id !== id));
      setStudioDeleteConfirm(null);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setStudioDeleting(null);
    }
  };

  // ── Job families CRUD ──
  const handleCreateJobFamily = async () => {
    const label = newFamilyLabel.trim();
    if (!label) { setJobFamiliesError("Label requis"); return; }
    const id = newFamilyId.trim() || label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    try {
      setJobFamiliesError("");
      const res = await fetch("/api/job-families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, label, active: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setNewFamilyLabel("");
      setNewFamilyId("");
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleToggleJobFamily = async (id: string, active: boolean) => {
    try {
      setJobFamiliesError("");
      const res = await fetch(`/api/job-families/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.error || "Erreur"); }
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleRenameJobFamily = async (id: string, label: string) => {
    if (!label.trim()) return;
    try {
      setJobFamiliesError("");
      const res = await fetch(`/api/job-families/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.error || "Erreur"); }
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleDeleteJobFamily = async (id: string) => {
    if (!confirm(`Supprimer la famille "${id}" ?`)) return;
    try {
      setJobFamiliesError("");
      const res = await fetch(`/api/job-families/${id}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.error || "Erreur"); }
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  // ── AI Editor send ──
  async function handleEditorSend() {
    if (!editorInput.trim() || !token || !editorScenarioId || editorSending) return;
    const msg = editorInput.trim();
    setEditorInput("");
    setEditorMessages((prev) => [...prev, { role: "user", content: msg }]);
    setEditorSending(true);
    setEditorPendingChanges(null);

    try {
      const res = await fetch("/api/admin/scenario-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scenarioId: editorScenarioId,
          message: msg,
          conversationHistory: editorMessages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.error || `Erreur serveur (${res.status})`;
        const detail = data.detail ? `\n${data.detail}` : "";
        setEditorMessages((prev) => [...prev, { role: "assistant", content: `❌ ${errMsg}${detail}` }]);
        return;
      }

      if (!data.reply && !data.rawReply) {
        setEditorMessages((prev) => [...prev, { role: "assistant", content: "❌ Reponse vide de l'IA." }]);
        return;
      }

      setEditorMessages((prev) => [...prev, { role: "assistant", content: data.reply || data.rawReply }]);
      if (data.changes && data.changes.length > 0) {
        setEditorPendingChanges(data.changes);
      }
    } catch (err) {
      setEditorMessages((prev) => [...prev, { role: "assistant", content: `❌ Erreur : ${err instanceof Error ? err.message : "Connexion echouee"}` }]);
    } finally {
      setEditorSending(false);
      setTimeout(() => editorChatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  // ── PDF Conversion ──
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Seuls les fichiers PDF sont acceptes.");
      setStep("error");
      return;
    }
    setStep("uploading");
    setErrorMsg("");
    setScenarioJson(null);
    setSaveSuccess(false);

    try {
      setStep("extracting");
      const formData = new FormData();
      formData.append("file", file);
      setStep("converting");

      const res = await fetch("/api/admin/convert", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Erreur de conversion");

      setScenarioJson(data.scenario);
      setStep("done");
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur inconnue");
      setStep("error");
    }
  }, []);

  const handleSaveConverted = async () => {
    if (!scenarioJson) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/save-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioJson }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Erreur de sauvegarde");
      setSaveSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadJson = () => {
    if (!scenarioJson) return;
    const blob = new Blob([JSON.stringify(scenarioJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenarioJson.scenario_id || "scenario"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  // ── Helpers ──
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  };

  const getStatusBadge = (status: string) => {
    const m: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: "rgba(234,179,8,0.2)", color: "#eab308", label: "Brouillon" },
      compiled: { bg: "rgba(59,130,246,0.2)", color: "#3b82f6", label: "Compile" },
      published: { bg: "rgba(34,197,94,0.2)", color: "#22c55e", label: "Publie" },
      error: { bg: "rgba(239,68,68,0.2)", color: "#ef4444", label: "Erreur" },
    };
    return m[status] || m.draft;
  };

  const stepLabel: Record<Step, string> = {
    idle: "",
    uploading: "Envoi du fichier...",
    extracting: "Extraction du texte...",
    converting: "Conversion IA en cours... (30-60 secondes)",
    done: "Conversion terminee !",
    error: "Erreur",
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  // ── Editor sub-view ──
  if (subView === "editor" && editorScenarioId) {
    const currentScenario = scenarios.find((s) => s.id === editorScenarioId || s.scenario_id === editorScenarioId);
    return (
      <div>
        <button
          onClick={() => { setSubView("list"); setEditorScenarioId(null); setEditorMessages([]); setEditorPendingChanges(null); }}
          style={{ ...btnSecondary, marginBottom: 20, padding: "8px 16px", fontSize: 13 }}
        >
          ← Retour aux scenarios
        </button>

        <div style={{ ...card, marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>
            Editeur IA — {currentScenario?.title || editorScenarioId}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>
            Decrivez les modifications souhaitees. L'IA proposera des changements que vous pourrez appliquer.
          </p>
        </div>

        {/* Chat area */}
        <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 500, padding: 0, overflow: "hidden" }}>
          {/* Messages */}
          <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", maxHeight: 500, display: "flex", flexDirection: "column", gap: 14 }}>
            {editorMessages.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: COLORS.textDim }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                <p style={{ fontSize: 14 }}>
                  Commencez a decrire les modifications souhaitees.
                  Par exemple : "Change le titre de la phase 2 en ..." ou "Ajoute un critere de scoring sur la diplomatie"
                </p>
              </div>
            )}

            {editorMessages.map((msg, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  borderTopRightRadius: msg.role === "user" ? 4 : 14,
                  borderTopLeftRadius: msg.role === "user" ? 14 : 4,
                  background: msg.role === "user" ? COLORS.primary : "rgba(255,255,255,0.1)",
                  color: COLORS.text,
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {editorSending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.1)", borderRadius: 14, color: COLORS.textMuted, fontSize: 14 }}>
                  Reflexion en cours...
                </div>
              </div>
            )}

            <div ref={editorChatEndRef} />
          </div>

          {/* Pending changes */}
          {editorPendingChanges && editorPendingChanges.length > 0 && (
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${COLORS.border}`, background: "rgba(91,95,199,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.accent }}>
                  {editorPendingChanges.length} modification{editorPendingChanges.length > 1 ? "s" : ""} proposee{editorPendingChanges.length > 1 ? "s" : ""}
                </h4>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditorPendingChanges(null)} style={{ ...btnSecondary, padding: "8px 16px", fontSize: 13 }}>Annuler</button>
                  <button
                    onClick={async () => {
                      if (!token || !editorScenarioId || !editorPendingChanges) return;
                      setEditorApplying(true);
                      try {
                        const res = await fetch("/api/admin/scenario-editor", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ scenarioId: editorScenarioId, changes: editorPendingChanges }),
                        });
                        const data = await res.json();
                        const msg = `✅ Modifications appliquees : ${(data.applied || []).length} reussie(s)${(data.failed || []).length > 0 ? `, ${data.failed.length} echouee(s)` : ""}`;
                        setEditorMessages((prev) => [...prev, { role: "assistant", content: msg }]);
                        setEditorPendingChanges(null);
                      } catch {
                        setEditorMessages((prev) => [...prev, { role: "assistant", content: "❌ Erreur lors de l'application." }]);
                      } finally {
                        setEditorApplying(false);
                      }
                    }}
                    disabled={editorApplying}
                    style={{ ...btnPrimary, padding: "8px 20px", fontSize: 13, background: COLORS.success, opacity: editorApplying ? 0.6 : 1 }}
                  >
                    {editorApplying ? "Application..." : "Appliquer les modifications"}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {editorPendingChanges.map((c: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 12, padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 6, color: "#ccc" }}>
                    <strong style={{ color: COLORS.accent }}>{c.path}</strong>: {typeof c.new_value === "string" ? c.new_value.slice(0, 100) : JSON.stringify(c.new_value).slice(0, 100)}{(typeof c.new_value === "string" ? c.new_value.length : JSON.stringify(c.new_value).length) > 100 ? "..." : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "16px 24px", borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 12 }}>
            <input
              value={editorInput}
              onChange={(e) => setEditorInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditorSend(); } }}
              placeholder="Decrivez la modification souhaitee..."
              style={{ ...inputStyle, flex: 1 }}
              disabled={editorSending}
            />
            <button
              onClick={handleEditorSend}
              disabled={editorSending || !editorInput.trim()}
              style={{ ...btnPrimary, opacity: (editorSending || !editorInput.trim()) ? 0.5 : 1 }}
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Convert sub-view ──
  if (subView === "convert") {
    return (
      <div>
        <button
          onClick={() => setSubView("list")}
          style={{ ...btnSecondary, marginBottom: 20, padding: "8px 16px", fontSize: 13 }}
        >
          ← Retour aux scenarios
        </button>

        <div style={{ ...card, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>Conversion PDF → Scenario</h2>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
            Glissez-deposez un PDF structure selon le guide de creation. L'IA le convertira en JSON jouable.
          </p>
          <a
            href="/guide_creation_scenario.pdf"
            download
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: COLORS.primary,
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 13,
              marginTop: 12,
            }}
          >
            Telecharger le guide PDF
          </a>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => (step === "idle" || step === "error" || step === "done") ? fileInputRef.current?.click() : null}
          style={{
            background: dragOver ? "rgba(91,95,199,0.2)" : step === "done" ? "rgba(22,163,74,0.1)" : step === "error" ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.04)",
            borderRadius: 16,
            padding: "48px 24px",
            border: `2px dashed ${dragOver ? COLORS.primary : step === "done" ? COLORS.success : step === "error" ? COLORS.error : "rgba(255,255,255,0.15)"}`,
            textAlign: "center",
            cursor: (step === "idle" || step === "error" || step === "done") ? "pointer" : "default",
            transition: "all 0.3s",
            marginBottom: 24,
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

          {step === "idle" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.6 }}>📄</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>Glissez-deposez votre scenario PDF ici</h3>
              <p style={{ margin: 0, fontSize: 13, color: COLORS.textDim }}>ou cliquez pour selectionner un fichier</p>
            </>
          )}

          {(step === "uploading" || step === "extracting" || step === "converting") && (
            <>
              <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.15)", borderTopColor: COLORS.primary, borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>{stepLabel[step]}</h3>
            </>
          )}

          {step === "done" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#4ade80" }}>Scenario converti avec succes !</h3>
              <p style={{ margin: 0, fontSize: 13, color: COLORS.textDim }}>Cliquez pour convertir un autre fichier</p>
            </>
          )}

          {step === "error" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#f87171" }}>Erreur de conversion</h3>
              <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>{errorMsg}</p>
            </>
          )}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Result */}
        {scenarioJson && step === "done" && (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>
                  {scenarioJson.meta?.title || scenarioJson.scenario_id}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: COLORS.textDim }}>
                  {scenarioJson.phases?.length || 0} phases · {scenarioJson.actors?.length || 0} acteurs · {scenarioJson.meta?.estimated_duration_min || "?"} min
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleDownloadJson} style={btnSecondary}>Telecharger JSON</button>
                <button
                  onClick={handleSaveConverted}
                  disabled={saving || saveSuccess}
                  style={{ ...btnPrimary, background: saveSuccess ? COLORS.success : COLORS.primary, opacity: saving ? 0.6 : 1 }}
                >
                  {saveSuccess ? "Sauvegarde !" : saving ? "Sauvegarde..." : "Deployer le scenario"}
                </button>
              </div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 16, maxHeight: 400, overflowY: "auto", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.7)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {JSON.stringify(scenarioJson, null, 2)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // MAIN LIST VIEW
  // ════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>
            Scenarios ({scenarios.length + studioScenarios.length})
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>
            Scenarios deployes et projets studio
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setSubView("convert")} style={btnSecondary}>
            📄 Convertir un PDF
          </button>
          <button
            onClick={() => setStudioShowModal(true)}
            style={btnPrimary}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.primaryHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.primary; }}
          >
            + Creer un scenario
          </button>
        </div>
      </div>

      {studioError && (
        <div style={{ background: COLORS.errorBg, border: `1px solid rgba(239,68,68,0.5)`, color: COLORS.errorText, padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {studioError}
        </div>
      )}

      {/* ── Job families panel ── */}
      <div style={{ ...card, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Familles metier</h3>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>
            {jobFamilies.filter((f) => f.active).length} active{jobFamilies.filter((f) => f.active).length > 1 ? "s" : ""} / {jobFamilies.length} total
          </span>
        </div>

        {jobFamiliesError && <div style={{ color: COLORS.errorText, fontSize: 12, marginBottom: 8 }}>{jobFamiliesError}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {jobFamilies.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: f.active ? "rgba(91,95,199,0.25)" : "rgba(255,255,255,0.05)", border: f.active ? `1px solid ${COLORS.primary}` : `1px solid rgba(255,255,255,0.15)`, fontSize: 12, color: f.active ? COLORS.text : COLORS.textDim }}>
              <span onClick={() => { const label = prompt("Nouveau label", f.label); if (label) handleRenameJobFamily(f.id, label); }} style={{ cursor: "pointer", fontWeight: 600 }} title="Renommer">{f.label}</span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>({f.id})</span>
              <button onClick={() => handleToggleJobFamily(f.id, !f.active)} style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.2)`, color: f.active ? COLORS.accent : COLORS.textDim, fontSize: 10, padding: "2px 6px", borderRadius: 4, cursor: "pointer" }}>
                {f.active ? "Desactiver" : "Activer"}
              </button>
              <button onClick={() => handleDeleteJobFamily(f.id)} style={{ background: "transparent", border: "none", color: "rgba(239,68,68,0.7)", fontSize: 12, cursor: "pointer" }} title="Supprimer">✕</button>
            </div>
          ))}
          {jobFamilies.length === 0 && !jobFamiliesLoading && (
            <div style={{ fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>Aucune famille. Creez-en une ci-dessous.</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="text" value={newFamilyLabel} onChange={(e) => setNewFamilyLabel(e.target.value)} placeholder="Label (ex. Management)" style={{ ...inputStyle, flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13 }} />
          <input type="text" value={newFamilyId} onChange={(e) => setNewFamilyId(e.target.value)} placeholder="ID (optionnel, kebab-case)" style={{ ...inputStyle, flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13 }} />
          <button onClick={handleCreateJobFamily} style={{ ...btnPrimary, padding: "6px 14px", fontSize: 13 }}>+ Ajouter</button>
        </div>
      </div>

      {/* ── DEPLOYED SCENARIOS ── */}
      <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: COLORS.text }}>
        Scenarios deployes
      </h3>

      {scenariosLoading ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textMuted }}>Chargement...</div>
      ) : scenarios.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textDim }}>Aucun scenario deploye</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20, marginBottom: 36 }}>
          {scenarios.map((scenario) => {
            const config = getEditingConfig(scenario.scenario_id);
            const isSaving = savingConfigs[scenario.scenario_id];

            return (
              <div key={scenario.scenario_id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Title & meta */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{scenario.title}</h3>
                    {config.adminLocked && <span style={{ fontSize: 14 }} title="Verrouille">🔒</span>}
                    {config.featured && <span style={{ fontSize: 14 }} title="En vedette">⭐</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>{scenario.subtitle}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", background: "rgba(91,95,199,0.2)", color: COLORS.accent, borderRadius: 4 }}>
                      {scenario.job_family || "Autre"}
                    </span>
                    <span style={{ fontSize: 12, padding: "3px 8px", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", borderRadius: 4 }}>
                      {scenario.difficulty}
                    </span>
                  </div>
                </div>

                {/* Config toggles */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "rgba(0,0,0,0.15)", borderRadius: 10, fontSize: 13 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={config.adminLocked || false} onChange={(e) => handleConfigChange(scenario.scenario_id, "adminLocked", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: COLORS.primary }} />
                    Verrouiller
                  </label>
                  {config.adminLocked && (
                    <input type="text" placeholder="Message de verrouillage (optionnel)" value={config.lockMessage || ""} onChange={(e) => handleConfigChange(scenario.scenario_id, "lockMessage", e.target.value)} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }} />
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={config.featured || false} onChange={(e) => handleConfigChange(scenario.scenario_id, "featured", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: COLORS.primary }} />
                    En vedette
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 2 }}>Ordre</label>
                      <input type="number" value={config.sortOrder || 0} onChange={(e) => handleConfigChange(scenario.scenario_id, "sortOrder", parseInt(e.target.value, 10))} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 2 }}>Categorie</label>
                      <input type="text" placeholder={scenario.job_family || "Categorie"} value={config.categoryOverride || ""} onChange={(e) => handleConfigChange(scenario.scenario_id, "categoryOverride", e.target.value)} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 2 }}>Prerequis (IDs separes par des virgules)</label>
                    <input type="text" placeholder="ID1, ID2" value={(config.prerequisites || []).join(", ")} onChange={(e) => handleConfigChange(scenario.scenario_id, "prerequisites", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }} />
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleSaveConfig(scenario.scenario_id)}
                    disabled={isSaving}
                    style={{ ...btnPrimary, flex: 1, padding: "8px 12px", fontSize: 12, opacity: isSaving ? 0.6 : 1 }}
                  >
                    {isSaving ? "Sauvegarde..." : "Enregistrer"}
                  </button>
                  <button
                    onClick={() => { setEditorScenarioId(scenario.id || scenario.scenario_id); setSubView("editor"); }}
                    style={{ flex: 1, padding: "8px 12px", background: "rgba(91,95,199,0.15)", color: COLORS.accent, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    🤖 Modifier (IA)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── STUDIO SCENARIOS ── */}
      <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: COLORS.text }}>
        Projets Studio
      </h3>

      {studioLoading ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textMuted }}>Chargement...</div>
      ) : studioScenarios.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textDim }}>
          Aucun projet studio. Cliquez sur "+ Creer un scenario" pour commencer.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {studioScenarios.map((sc) => {
            const badge = getStatusBadge(sc.status);
            return (
              <div
                key={sc.id}
                style={{ ...card, transition: "all 0.2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.bgHover; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.bg; e.currentTarget.style.borderColor = COLORS.border; }}
              >
                <div onClick={() => router.push(`/studio/${sc.id}`)} style={{ cursor: "pointer", marginBottom: 12 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>{sc.title}</h3>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                    {sc.isTeaserVisible && (
                      <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(255,171,64,0.2)", color: "#ffab40", border: "1px solid rgba(255,171,64,0.4)" }}>
                        🚧 Teaser
                      </span>
                    )}
                    {(sc.jobFamilies || []).slice(0, 2).map((fid) => {
                      const f = jobFamilies.find((jf) => jf.id === fid);
                      return (
                        <span key={fid} style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: "rgba(91,95,199,0.15)", color: COLORS.accent }}>
                          {f?.label || fid}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${COLORS.border}` }}>
                  <p style={{ margin: 0, fontSize: 12, color: COLORS.textDim }}>
                    Mis a jour {formatDate(sc.updatedAt)}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => router.push(`/studio/${sc.id}`)}
                    style={{ flex: 1, background: "rgba(91,95,199,0.2)", color: COLORS.accent, border: "none", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Ouvrir dans le Studio
                  </button>
                  {studioDeleteConfirm === sc.id ? (
                    <>
                      <button
                        onClick={() => handleStudioDelete(sc.id)}
                        disabled={studioDeleting === sc.id}
                        style={{ flex: 1, background: "#ef4444", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: studioDeleting === sc.id ? "wait" : "pointer", opacity: studioDeleting === sc.id ? 0.7 : 1 }}
                      >
                        {studioDeleting === sc.id ? "..." : "Confirmer"}
                      </button>
                      <button
                        onClick={() => setStudioDeleteConfirm(null)}
                        style={{ flex: 1, background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setStudioDeleteConfirm(sc.id)}
                      style={{ flex: 1, background: "rgba(255,255,255,0.1)", color: COLORS.textMuted, border: "none", padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = COLORS.errorText; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = COLORS.textMuted; }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ── */}
      {studioShowModal && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          onClick={() => setStudioShowModal(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1a2e", border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 32, maxWidth: 400, width: "100%" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700 }}>Creer un nouveau scenario</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: COLORS.textMuted }}>Titre *</label>
              <input
                type="text"
                value={studioModalTitle}
                onChange={(e) => setStudioModalTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleStudioCreate(); }}
                placeholder="Ex: Negociation difficile"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: COLORS.textMuted }}>Tags (optionnel, separes par des virgules)</label>
              <input
                type="text"
                value={studioModalTags}
                onChange={(e) => setStudioModalTags(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleStudioCreate(); }}
                placeholder="Ex: difficult, sales, high-stakes"
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStudioShowModal(false)} style={{ ...btnSecondary, flex: 1 }}>Annuler</button>
              <button onClick={handleStudioCreate} disabled={studioCreating} style={{ ...btnPrimary, flex: 1, opacity: studioCreating ? 0.7 : 1 }}>
                {studioCreating ? "Creation..." : "Creer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
