"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}

export default function CoachLayout({ children, params: paramsPromise }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgId, setOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("Cabinet");
  const [coachLevel, setCoachLevel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);

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

      // Set active organization context
      localStorage.setItem("active_org_id", params.orgId);

      try {
        const [orgRes, capRes] = await Promise.all([
          fetch(`/api/organizations/${params.orgId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/capabilities", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (orgRes.ok) {
          const data = await orgRes.json();
          setOrgName(data.organization?.name || "Cabinet");
        }
        if (capRes.ok) {
          const capData = await capRes.json();
          setCoachLevel(capData.user?.coachProfile?.level || "");
        }
      } catch (err) {
        console.error("Failed to load org:", err);
      } finally {
        setLoading(false);
      }
    };
    initAsync();
  }, [paramsPromise, router]);

  const navItems = [
    { label: "Tableau de bord", href: `/coach/${orgId}`, icon: "🏠" },
    { label: "Mes coachés", href: `/coach/${orgId}/coachees`, icon: "🎓" },
    { label: "Assigner parcours", href: `/coach/${orgId}/assign`, icon: "📋" },
    { label: "Progression", href: `/coach/${orgId}/progress`, icon: "📈" },
  ];

  const levelBadge = coachLevel === "confirme"
    ? { label: "Coach confirmé", bg: "#dcfce7", color: "#166534" }
    : { label: "Coach apprenti", bg: "#fef3c7", color: "#92400e" };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        Chargement...
      </div>
    );
  }

  if (!authToken) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#fafafa", fontFamily: "Arial, sans-serif", color: "#333" }}>
      {/* Sidebar */}
      <aside
        data-sidebar="true"
        style={{
          width: 280,
          background: "#fff",
          borderRight: "1px solid #e5e7eb",
          padding: "24px 0",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ paddingLeft: 24, paddingRight: 24, marginBottom: 32 }}>
          <button
            onClick={() => { localStorage.removeItem("active_org_id"); router.push("/"); }}
            style={{
              background: "none",
              border: "none",
              fontSize: 14,
              color: "#666",
              cursor: "pointer",
              padding: "8px 0",
              textAlign: "left",
              fontWeight: 500,
            }}
          >
            ← Retour à l'accueil
          </button>
        </div>

        <div
          style={{
            paddingLeft: 24,
            paddingRight: 24,
            marginBottom: 28,
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1f2937" }}>
            {orgName}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: levelBadge.bg,
                color: levelBadge.color,
              }}
            >
              {levelBadge.label}
            </span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#999" }}>
            Espace coaching
          </p>
        </div>

        <nav style={{ padding: "0 12px" }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  marginBottom: 8,
                  borderRadius: 10,
                  textDecoration: "none",
                  color: isActive ? "#7c3aed" : "#666",
                  background: isActive ? "rgba(124, 58, 237, 0.1)" : "transparent",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 14,
                  transition: "all 0.2s",
                  borderLeft: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {coachLevel === "apprenti" && (
          <div
            style={{
              margin: "32px 16px 0",
              padding: 16,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 12,
              fontSize: 12,
              color: "#92400e",
              lineHeight: 1.5,
            }}
          >
            <strong>Niveau Apprenti</strong>
            <p style={{ margin: "6px 0 0" }}>
              Certaines fonctionnalités avancées (analytics, scénarios personnalisés) sont réservées aux coachs confirmés.
            </p>
          </div>
        )}
      </aside>

      <main data-main-content="true" style={{ flex: 1, padding: "32px 40px", overflowY: "auto", maxHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
