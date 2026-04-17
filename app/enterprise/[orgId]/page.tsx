"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDashboardData } from "@/app/hooks/useDashboardData";
import StatCard from "@/app/components/StatCard";

interface PageProps {
  params: Promise<{ orgId: string }>;
}

interface FeatureFlags {
  custom_scenarios: boolean;
  studio_access: boolean;
  max_managed_users: number;
  advanced_analytics: boolean;
}

export default function DashboardPage({ params: paramsPromise }: PageProps) {
  const { orgId, org, stats, memberCount, loading, error, token } = useDashboardData(paramsPromise);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);

  // Enterprise-specific: fetch feature flags
  useEffect(() => {
    if (!token || !orgId) return;
    fetch(`/api/organizations/${orgId}/features`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setFeatures(d.features || null); })
      .catch(() => {});
  }, [token, orgId]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 16, color: "#666" }}>Chargement...</p>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 16, color: "#dc2626" }}>{error || "Erreur"}</p>
      </div>
    );
  }

  const statCards = [
    { label: "Membres", value: memberCount, color: "#3b82f6", icon: "👥" },
    { label: "Scénarios assignés", value: stats?.assigned ?? 0, color: "#2563eb", icon: "📋" },
    { label: "Commencés", value: stats?.started ?? 0, color: "#f59e0b", icon: "▶️" },
    { label: "Complétés", value: stats?.completed ?? 0, color: "#16a34a", icon: "✅" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 700, color: "#1f2937" }}>
          Tableau de bord
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
          Type d'organisation: <strong>{org.type}</strong>
        </p>
      </div>

      {/* Stats Grid */}
      <div
        data-stats-grid="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 20,
          marginBottom: 40,
        }}
      >
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Quick Links */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "#1f2937" }}>
          Accès rapide
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { href: `/enterprise/${orgId}/users`, label: "👥 Utilisateurs" },
            { href: `/enterprise/${orgId}/assign`, label: "📋 Assigner" },
            { href: `/enterprise/${orgId}/results`, label: "📈 Résultats" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                background: "#2563eb",
                color: "#fff",
                textDecoration: "none",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#1d4ed8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#2563eb"; }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(37, 99, 235, 0.02) 100%)",
          border: "1px solid #dbeafe",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#2563eb" }}>
          💡 Conseils
        </h3>
        <ul style={{ margin: "0 0 0 20px", fontSize: 14, color: "#666", lineHeight: 1.8 }}>
          <li>Gérez les utilisateurs de votre organisation dans la section Utilisateurs</li>
          <li>Assignez des scénarios à vos utilisateurs pour leur permettre de s'entraîner</li>
          <li>Consultez les résultats pour suivre la progression de chaque utilisateur</li>
        </ul>
      </div>

      {/* Premium Features */}
      {features && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1f2937", marginBottom: 16 }}>
            Fonctionnalités
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { key: "custom_scenarios", label: "Scénarios personnalisés", desc: "Créez vos propres scénarios adaptés à votre entreprise", icon: "🎭" },
              { key: "studio_access", label: "Accès Studio", desc: "Éditeur visuel pour concevoir des scénarios", icon: "🎬" },
              { key: "advanced_analytics", label: "Analytics avancées", desc: "Tableaux de bord détaillés et export de données", icon: "📊" },
            ].map((feat) => {
              const enabled = features[feat.key as keyof FeatureFlags] as boolean;
              return (
                <div
                  key={feat.key}
                  style={{
                    background: enabled ? "#fff" : "#f9fafb",
                    border: `1px solid ${enabled ? "#dbeafe" : "#e5e7eb"}`,
                    borderRadius: 14,
                    padding: 20,
                    opacity: enabled ? 1 : 0.7,
                    position: "relative",
                  }}
                >
                  {!enabled && (
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: "#fef3c7", color: "#92400e",
                    }}>
                      Premium
                    </div>
                  )}
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{feat.icon}</div>
                  <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: enabled ? "#1f2937" : "#999" }}>
                    {feat.label}
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: "#999" }}>{feat.desc}</p>
                  {enabled && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                      ✓ Activé
                    </div>
                  )}
                </div>
              );
            })}
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
              <h4 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#1f2937" }}>
                Utilisateurs max
              </h4>
              <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#2563eb" }}>
                {features.max_managed_users}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>
                Places disponibles dans votre organisation
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
