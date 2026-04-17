"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}

export default function EnterpriseLayout({ children, params: paramsPromise }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgId, setOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("Organisation");
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
        const res = await fetch(`/api/organizations/${params.orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrgName(data.name || "Organisation");
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
    { label: "Tableau de bord", href: `/enterprise/${orgId}`, icon: "📊" },
    { label: "Utilisateurs", href: `/enterprise/${orgId}/users`, icon: "👥" },
    { label: "Assigner scénarios", href: `/enterprise/${orgId}/assign`, icon: "📋" },
    { label: "Résultats", href: `/enterprise/${orgId}/results`, icon: "📈" },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        Chargement...
      </div>
    );
  }

  if (!authToken) {
    return null;
  }

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
        {/* Logo / Home */}
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

        {/* Org Name Header */}
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
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#999" }}>
            Espace d'administration
          </p>
        </div>

        {/* Nav Items */}
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
                  color: isActive ? "#2563eb" : "#666",
                  background: isActive ? "rgba(37, 99, 235, 0.1)" : "transparent",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 14,
                  transition: "all 0.2s",
                  borderLeft: isActive ? "3px solid #2563eb" : "3px solid transparent",
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main
        data-main-content="true"
        style={{
          flex: 1,
          padding: "32px 40px",
          overflowY: "auto",
          maxHeight: "100vh",
        }}
      >
        {children}
      </main>
    </div>
  );
}
