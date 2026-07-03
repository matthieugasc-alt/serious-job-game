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
  estimated_duration_min?: number;
  tags?: string[];
  job_family?: string;
}

interface ScenarioConfig {
  scenario_id: string;
  adminLocked?: boolean;
  category?: string; // ID de catégorie du référentiel (data/categories.json)
  level?: string; // Override du niveau : debutant | intermediaire | avance | expert
  prerequisites?: string[]; // scenario_id à terminer avant de jouer (séries)
}

interface Category {
  id: string;
  label: string;
}

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "debutant", label: "Débutant" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "avance", label: "Avancé" },
  { value: "expert", label: "Expert" },
];

// ── Styles ───────────────────────────────────────────────────────

// Thème clair : fond gris très clair, cartes blanches bordées gray-200,
// texte gray-900/gray-600, accents indigo pour les actions primaires.
const COLORS = {
  primary: "#4f46e5", // indigo-600
  primaryHover: "#4338ca", // indigo-700
  accent: "#4f46e5",
  accentBg: "#eef2ff", // indigo-50
  pageBg: "#f9fafb", // gray-50
  bg: "#ffffff",
  bgHover: "#f9fafb",
  bgSubtle: "#f9fafb",
  chipBg: "#f3f4f6", // gray-100
  border: "#e5e7eb", // gray-200
  borderHover: "#d1d5db", // gray-300
  text: "#111827", // gray-900
  textMuted: "#4b5563", // gray-600
  textDim: "#9ca3af", // gray-400
  success: "#16a34a",
  successBg: "#f0fdf4", // green-50
  successBorder: "#bbf7d0",
  successText: "#15803d", // green-700
  error: "#dc2626",
  errorBg: "#fef2f2", // red-50
  errorBorder: "#fecaca",
  errorText: "#b91c1c", // red-700
  amber: "#d97706", // amber-600
  amberBg: "#fffbeb", // amber-50
  amberBorder: "#fde68a",
  amberText: "#b45309", // amber-700
};

const card = {
  background: COLORS.bg,
  borderRadius: 16,
  padding: 24,
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  background: "#fff",
  border: `1px solid ${COLORS.borderHover}`,
  borderRadius: 8,
  color: COLORS.text,
  fontSize: 14,
  outline: "none" as const,
  boxSizing: "border-box" as const,
};

const btnPrimary = {
  padding: "10px 20px",
  background: COLORS.primary,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 600 as const,
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnSecondary = {
  padding: "10px 20px",
  background: "#fff",
  color: COLORS.textMuted,
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, sans-serif", background: COLORS.pageBg, color: COLORS.textMuted }}>
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
        background: COLORS.pageBg,
        padding: "28px 20px 40px",
        fontFamily: "Segoe UI, sans-serif",
        color: COLORS.text,
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
                  background: COLORS.accentBg,
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
          background: COLORS.bgSubtle,
          borderRadius: 10,
          alignItems: "center",
          fontSize: 13,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.chipBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.bgSubtle; }}
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
            <span style={{ color: COLORS.amberText }}>En attente</span>
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
              background: COLORS.accentBg,
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
          { label: "Solo", value: soloUsers.length, color: "#2563eb" },
          { label: "Entreprise", value: enterpriseUsers.length, color: "#059669" },
          { label: "Coach", value: coachUsers.length, color: "#db2777" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: COLORS.bg,
              borderRadius: 12,
              padding: "16px 20px",
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
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
      return { bg: "#fee2e2", color: "#b91c1c", label: "Super Admin" };
    case "admin":
      return { bg: "#fef3c7", color: "#b45309", label: "Admin" };
    default:
      return { bg: "#eef2ff", color: "#4f46e5", label: "Utilisateur" };
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
            border: `1px solid ${message.type === "success" ? COLORS.successBorder : COLORS.errorBorder}`,
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
                        background: formType === t ? COLORS.primary : COLORS.chipBg,
                        color: formType === t ? "#fff" : COLORS.textMuted,
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
              e.currentTarget.style.borderColor = COLORS.borderHover;
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
                  background: org.status === "active" ? "#dcfce7" : "#fee2e2",
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
                background: COLORS.bgSubtle,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                fontSize: 12,
                color: COLORS.textMuted,
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: COLORS.text }}>{orgMemberCounts[org.id] ?? "..."}</span> membre{(orgMemberCounts[org.id] ?? 0) > 1 ? "s" : ""}
              </div>
              <div style={{ borderLeft: `1px solid ${COLORS.border}`, paddingLeft: 16 }}>
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
                background: COLORS.accentBg,
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
// TAB 3: SCÉNARIOS — catalogue minimal
//
// Deux blocs :
//   1. Référentiel de catégories (data/categories.json via
//      /api/admin/categories) : créer, renommer (l'id ne bouge jamais,
//      les assignations survivent), supprimer (refusé si des scénarios
//      sont assignés, sauf confirmation → force=true qui purge leurs
//      overrides : ils retombent sur job_family / « Autre »).
//   2. Cartes scénarios avec 4 contrôles : Catégorie (select sur le
//      référentiel), Niveau (select, override du meta.difficulty du
//      scenario.json), Bloqué/Débloqué (toggle) et Prérequis (select
//      d'ajout + chips supprimables — permet de construire des séries
//      de scénarios ; garde-fou UI contre les boucles directes A→B→A).
//      Sauvegarde immédiate à chaque changement via
//      POST /api/admin/scenario-config — pas de bouton Enregistrer.
// ═══════════════════════════════════════════════════════════════════

type SaveState = { state: "saving" | "saved" | "error"; message?: string };

function ScenariosTab({ token }: { token: string }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [configs, setConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveState>>({});

  // Gestion du référentiel de catégories
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryLabel, setEditingCategoryLabel] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      setLoadError("");
      const [scenariosRes, configsRes, categoriesRes] = await Promise.all([
        fetch("/api/scenarios", { cache: "no-store" }),
        fetch("/api/admin/scenario-config", { cache: "no-store" }),
        fetch("/api/admin/categories", { cache: "no-store" }),
      ]);

      if (!scenariosRes.ok) throw new Error(`Chargement des scénarios impossible (${scenariosRes.status})`);
      const scenariosData = await scenariosRes.json();
      setScenarios(scenariosData.scenarios || []);

      if (!configsRes.ok) throw new Error(`Chargement de la configuration impossible (${configsRes.status})`);
      const configsData = await configsRes.json();
      setConfigs(toConfigMap(configsData.configs || []));

      if (!categoriesRes.ok) throw new Error(`Chargement des catégories impossible (${categoriesRes.status})`);
      const categoriesData = await categoriesRes.json();
      setCategories(categoriesData.categories || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  function toConfigMap(rawConfigs: any[]): Record<string, ScenarioConfig> {
    const configMap: Record<string, ScenarioConfig> = {};
    rawConfigs.forEach((cfg: any) => {
      const sid = cfg.scenarioId || cfg.scenario_id;
      if (!sid) return;
      configMap[sid] = {
        scenario_id: sid,
        adminLocked: cfg.adminLocked,
        category: cfg.category,
        level: cfg.level,
        prerequisites: Array.isArray(cfg.prerequisites) ? cfg.prerequisites : [],
      };
    });
    return configMap;
  }

  function getConfig(scenarioId: string): ScenarioConfig {
    return (
      configs[scenarioId] || {
        scenario_id: scenarioId,
        adminLocked: false,
        category: "",
        level: "",
        prerequisites: [],
      }
    );
  }

  // ── Sauvegarde immédiate (à chaque onChange, pas de bouton) ──────
  async function saveConfig(scenarioId: string, patch: Partial<ScenarioConfig>) {
    const previous = getConfig(scenarioId);
    const next: ScenarioConfig = { ...previous, ...patch, scenario_id: scenarioId };
    // Optimiste : l'UI reflète le changement tout de suite
    setConfigs((prev) => ({ ...prev, [scenarioId]: next }));
    setSaveStatus((prev) => ({ ...prev, [scenarioId]: { state: "saving" } }));

    try {
      const payload: Record<string, unknown> = {
        scenarioId,
        adminLocked: next.adminLocked === true,
        category: next.category || "", // "" = auto (job_family)
        // Explicite (jamais absent) : l'admin est la source de vérité des
        // prérequis — [] = aucun prérequis.
        prerequisites: Array.isArray(next.prerequisites) ? next.prerequisites : [],
      };
      if (next.level) payload.level = next.level; // absent = auto (scenario.json)

      const res = await fetch("/api/admin/scenario-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `Erreur serveur (${res.status})`);
      }

      setSaveStatus((prev) => ({ ...prev, [scenarioId]: { state: "saved" } }));
      setTimeout(() => {
        setSaveStatus((prev) => {
          if (prev[scenarioId]?.state !== "saved") return prev;
          const nextStatus = { ...prev };
          delete nextStatus[scenarioId];
          return nextStatus;
        });
      }, 2500);
    } catch (err) {
      // Rollback : on rétablit la valeur d'avant l'échec
      setConfigs((prev) => ({ ...prev, [scenarioId]: previous }));
      setSaveStatus((prev) => ({
        ...prev,
        [scenarioId]: { state: "error", message: err instanceof Error ? err.message : "Erreur de sauvegarde" },
      }));
    }
  }

  // ── CRUD du référentiel de catégories ────────────────────────────
  function assignedCount(categoryId: string): number {
    return Object.values(configs).filter((c) => (c.category || "").trim() === categoryId).length;
  }

  async function handleAddCategory() {
    const label = newCategoryLabel.trim();
    if (!label || catBusy) return;
    setCatBusy(true);
    setCatError("");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Erreur serveur (${res.status})`);
      setCategories((prev) => [...prev, data.category]);
      setNewCategoryLabel("");
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setCatBusy(false);
    }
  }

  async function handleRenameCategory(id: string) {
    const label = editingCategoryLabel.trim();
    const current = categories.find((c) => c.id === id);
    if (!label || !current || label === current.label) {
      setEditingCategoryId(null);
      return;
    }
    setCatBusy(true);
    setCatError("");
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Erreur serveur (${res.status})`);
      setCategories((prev) => prev.map((c) => (c.id === id ? data.category : c)));
      setEditingCategoryId(null);
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Erreur lors du renommage");
    } finally {
      setCatBusy(false);
    }
  }

  async function handleDeleteCategory(category: Category) {
    if (catBusy) return;
    if (!window.confirm(`Supprimer la catégorie « ${category.label} » ?`)) return;
    setCatBusy(true);
    setCatError("");
    try {
      let res = await fetch(`/api/admin/categories?id=${encodeURIComponent(category.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 409) {
        // Des scénarios sont assignés → seconde confirmation avec le compte,
        // puis suppression forcée (purge des overrides côté serveur).
        const data = await res.json().catch(() => ({}));
        const count = (data.assignedScenarioIds || []).length;
        const ok = window.confirm(
          `${count} scénario${count > 1 ? "s" : ""} utilise${count > 1 ? "nt" : ""} la catégorie « ${category.label} ».\n\n` +
          `Supprimer quand même ? Ces scénarios retomberont sur leur catégorie automatique (job_family / « Autre »).`
        );
        if (!ok) return;
        res = await fetch(`/api/admin/categories?id=${encodeURIComponent(category.id)}&force=true`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `Erreur serveur (${res.status})`);
      }

      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      // Le serveur a purgé les overrides — on aligne l'état local
      setConfigs((prev) => {
        const next: Record<string, ScenarioConfig> = {};
        for (const [sid, cfg] of Object.entries(prev)) {
          next[sid] = (cfg.category || "").trim() === category.id ? { ...cfg, category: "" } : cfg;
        }
        return next;
      });
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setCatBusy(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 20px", color: COLORS.textMuted }}>Chargement des scénarios...</div>;
  }

  const categoryLabelById: Record<string, string> = {};
  categories.forEach((c) => { categoryLabelById[c.id] = c.label; });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>
            Catalogue ({scenarios.length} scénario{scenarios.length > 1 ? "s" : ""})
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>
            Catégorie, niveau et verrouillage des scénarios déployés. La création de scénarios ne se fait pas ici.
          </p>
        </div>
        <button onClick={loadAll} style={btnSecondary}>
          Rafraîchir
        </button>
      </div>

      {loadError && (
        <div style={{ background: COLORS.errorBg, border: `1px solid ${COLORS.errorBorder}`, color: COLORS.errorText, padding: 14, borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {/* ── Bloc Catégories : référentiel dynamique ── */}
      <div style={{ ...card, marginBottom: 28 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Catégories</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: COLORS.textMuted }}>
          Référentiel utilisé par le select « Catégorie » des scénarios et par le catalogue joueur.
          Renommer ne casse pas les assignations (l'identifiant reste stable).
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {categories.length === 0 && (
            <span style={{ fontSize: 13, color: COLORS.textDim }}>Aucune catégorie — ajoutez-en une ci-dessous.</span>
          )}
          {categories.map((category) => {
            const count = assignedCount(category.id);
            const isEditing = editingCategoryId === category.id;
            return (
              <span
                key={category.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px 6px 14px",
                  borderRadius: 20,
                  background: COLORS.accentBg,
                  border: "1px solid #c7d2fe",
                  fontSize: 13,
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingCategoryLabel}
                    onChange={(e) => setEditingCategoryLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameCategory(category.id);
                      if (e.key === "Escape") setEditingCategoryId(null);
                    }}
                    onBlur={() => handleRenameCategory(category.id)}
                    style={{ ...inputStyle, width: 180, padding: "3px 8px", fontSize: 13 }}
                  />
                ) : (
                  <>
                    <span style={{ color: COLORS.accent, fontWeight: 600 }}>{category.label}</span>
                    <span style={{ fontSize: 11, color: COLORS.textDim }} title="Scénarios assignés">
                      {count}
                    </span>
                    <button
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setEditingCategoryLabel(category.label);
                        setCatError("");
                      }}
                      title="Renommer"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 0, color: COLORS.textMuted }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category)}
                      title="Supprimer"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0, color: COLORS.errorText }}
                    >
                      ✕
                    </button>
                  </>
                )}
              </span>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Nouvelle catégorie (ex : Ressources humaines)"
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
            style={{ ...inputStyle, maxWidth: 340, padding: "8px 12px", fontSize: 13 }}
          />
          <button
            onClick={handleAddCategory}
            disabled={catBusy || !newCategoryLabel.trim()}
            style={{ ...btnPrimary, padding: "8px 18px", fontSize: 13, opacity: catBusy || !newCategoryLabel.trim() ? 0.5 : 1 }}
          >
            Ajouter
          </button>
        </div>

        {catError && (
          <div style={{ marginTop: 10, fontSize: 12, color: COLORS.errorText }}>{catError}</div>
        )}
      </div>

      {/* ── Grille des scénarios : 3 contrôles par carte ── */}
      {!loadError && scenarios.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.textDim }}>Aucun scénario déployé</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
          {scenarios.map((scenario) => {
            const config = getConfig(scenario.scenario_id);
            const status = saveStatus[scenario.scenario_id];
            const isLocked = config.adminLocked === true;
            const categoryValue = (config.category || "").trim();
            const isOrphanCategory = !!categoryValue && !categoryLabelById[categoryValue];
            const prerequisites = config.prerequisites || [];

            return (
              <div key={scenario.scenario_id} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Titre + infos */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{scenario.title}</h3>
                    {isLocked && <span style={{ fontSize: 14 }} title="Bloqué">🔒</span>}
                  </div>
                  {scenario.subtitle && (
                    <p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>{scenario.subtitle}</p>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, padding: "3px 8px", background: COLORS.chipBg, color: COLORS.textDim, borderRadius: 4, fontFamily: "monospace" }}>
                      {scenario.scenario_id}
                    </span>
                    {(scenario.estimated_duration_min || 0) > 0 && (
                      <span style={{ fontSize: 12, padding: "3px 8px", background: COLORS.chipBg, color: COLORS.textMuted, borderRadius: 4 }}>
                        ⏱ {scenario.estimated_duration_min} min
                      </span>
                    )}
                    {(scenario.tags || []).slice(0, 3).map((tag) => (
                      <span key={tag} style={{ fontSize: 12, padding: "3px 8px", background: COLORS.chipBg, color: COLORS.textMuted, borderRadius: 4 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Les 4 contrôles — sauvegarde immédiate à chaque changement */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: COLORS.bgSubtle, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 3 }}>
                      Catégorie
                    </label>
                    <select
                      value={categoryValue}
                      onChange={(e) => saveConfig(scenario.scenario_id, { category: e.target.value })}
                      style={{ ...inputStyle, padding: "7px 10px", fontSize: 13, cursor: "pointer" }}
                    >
                      <option value="">— (auto : job_family)</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                      {isOrphanCategory && (
                        <option value={categoryValue}>
                          {categoryValue} (catégorie supprimée)
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 3 }}>
                      Niveau
                    </label>
                    <select
                      value={config.level || ""}
                      onChange={(e) => saveConfig(scenario.scenario_id, { level: e.target.value })}
                      style={{ ...inputStyle, padding: "7px 10px", fontSize: 13, cursor: "pointer" }}
                    >
                      <option value="">Auto ({scenario.difficulty})</option>
                      {LEVEL_OPTIONS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Prérequis — construit des séries de scénarios */}
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 3 }}>
                      Prérequis
                    </label>
                    {prerequisites.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                        {prerequisites.map((prereqId) => {
                          const prereq = scenarios.find((s) => s.scenario_id === prereqId);
                          return (
                            <span
                              key={prereqId}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "3px 8px 3px 10px",
                                borderRadius: 12,
                                background: COLORS.accentBg,
                                border: "1px solid #c7d2fe",
                                fontSize: 12,
                                color: COLORS.accent,
                                fontWeight: 600,
                              }}
                              title={prereq ? prereqId : "Scénario introuvable (id orphelin)"}
                            >
                              {prereq?.title || `${prereqId} (introuvable)`}
                              <button
                                onClick={() =>
                                  saveConfig(scenario.scenario_id, {
                                    prerequisites: prerequisites.filter((id) => id !== prereqId),
                                  })
                                }
                                title="Retirer ce prérequis"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: COLORS.errorText, lineHeight: 1 }}
                              >
                                ✕
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <select
                      value=""
                      onChange={(e) => {
                        const selected = e.target.value;
                        if (!selected || prerequisites.includes(selected)) return;
                        saveConfig(scenario.scenario_id, { prerequisites: [...prerequisites, selected] });
                      }}
                      style={{ ...inputStyle, padding: "7px 10px", fontSize: 13, cursor: "pointer" }}
                    >
                      <option value="">+ Ajouter un prérequis…</option>
                      {scenarios
                        .filter(
                          (candidate) =>
                            candidate.scenario_id !== scenario.scenario_id &&
                            !prerequisites.includes(candidate.scenario_id)
                        )
                        .map((candidate) => {
                          // Garde-fou : si le candidat a déjà ce scénario en
                          // prérequis, l'ajouter créerait une boucle directe A→B→A.
                          const wouldLoop = (
                            configs[candidate.scenario_id]?.prerequisites || []
                          ).includes(scenario.scenario_id);
                          return (
                            <option key={candidate.scenario_id} value={candidate.scenario_id} disabled={wouldLoop}>
                              {candidate.title}
                              {wouldLoop ? " (créerait une boucle)" : ""}
                            </option>
                          );
                        })}
                    </select>
                  </div>

                  {/* Toggle Bloqué / Débloqué — verrouillé = amber clair */}
                  <button
                    onClick={() => saveConfig(scenario.scenario_id, { adminLocked: !isLocked })}
                    title={isLocked ? "Le scénario est visible au catalogue mais non jouable" : "Le scénario est jouable"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      background: isLocked ? COLORS.amberBg : COLORS.successBg,
                      border: `1px solid ${isLocked ? COLORS.amberBorder : COLORS.successBorder}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      color: isLocked ? COLORS.amberText : COLORS.successText,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 34,
                        height: 18,
                        borderRadius: 9,
                        background: isLocked ? COLORS.amber : COLORS.success,
                        position: "relative",
                        flexShrink: 0,
                        transition: "background 0.2s",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: isLocked ? 2 : 18,
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 0.2s",
                        }}
                      />
                    </span>
                    {isLocked ? "🔒 Bloqué" : "🟢 Débloqué"}
                  </button>
                </div>

                {/* Indicateur discret enregistré / erreur */}
                <div style={{ minHeight: 16, fontSize: 12 }}>
                  {status?.state === "saving" && <span style={{ color: COLORS.textDim }}>Enregistrement…</span>}
                  {status?.state === "saved" && <span style={{ color: COLORS.successText, fontWeight: 600 }}>Enregistré ✓</span>}
                  {status?.state === "error" && (
                    <span style={{ color: COLORS.errorText, fontWeight: 600 }}>{status.message || "Erreur"}</span>
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
