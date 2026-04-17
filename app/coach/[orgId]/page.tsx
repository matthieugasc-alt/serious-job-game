"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDashboardData } from "@/app/hooks/useDashboardData";
import StatCard from "@/app/components/StatCard";
import ProgressBar from "@/app/components/ProgressBar";

export default function CoachDashboardPage({ params: paramsPromise }: { params: Promise<{ orgId: string }> }) {
  const { orgId, stats, memberCount, loading, token } = useDashboardData(paramsPromise);
  const [coachLevel, setCoachLevel] = useState<string | null>(null);

  // Fetch coachLevel from user's coachProfile (NOT org.settings)
  useEffect(() => {
    if (!token) return;
    fetch("/api/capabilities", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setCoachLevel(d.user?.coachProfile?.level || null); })
      .catch(() => {});
  }, [token]);

  if (loading) return <div style={{ padding: 40 }}>Chargement...</div>;

  const completionRate = stats && stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const mandatoryTotal = stats?.mandatoryTotal || 0;
  const mandatoryCompleted = stats?.mandatoryCompleted || 0;
  const mandatoryRate = mandatoryTotal > 0 ? Math.round((mandatoryCompleted / mandatoryTotal) * 100) : 0;

  const statCards = [
    { label: "Coachés", value: memberCount, icon: "🎓", color: "#7c3aed" },
    { label: "Parcours assignés", value: stats?.total || 0, icon: "📋", color: "#2563eb" },
    { label: "En cours", value: stats?.started || 0, icon: "⏳", color: "#f59e0b" },
    { label: "Terminés", value: stats?.completed || 0, icon: "✅", color: "#16a34a" },
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#1f2937" }}>
        Tableau de bord
      </h1>
      <p style={{ margin: "0 0 32px", fontSize: 15, color: "#666" }}>
        Vue d'ensemble de votre activité de coaching
      </p>

      {/* Stat Cards */}
      <div data-stats-grid="true" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 32 }}>
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Progress bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
        <ProgressBar label="Progression globale" percent={completionRate} color="#7c3aed" />
        <ProgressBar
          label="Parcours obligatoires"
          percent={mandatoryRate}
          color="#16a34a"
          detail={`${mandatoryCompleted}/${mandatoryTotal} obligatoires terminés`}
        />
      </div>

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {[
          { href: `/coach/${orgId}/coachees`, icon: "🎓", label: "Gérer mes coachés", sub: "Ajouter, voir les profils" },
          { href: `/coach/${orgId}/assign`, icon: "📋", label: "Assigner un parcours", sub: "Scénarios visibles ou obligatoires" },
          { href: `/coach/${orgId}/progress`, icon: "📈", label: "Suivre la progression", sub: "Résultats et complétion" },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 28,
              textDecoration: "none", color: "#333", transition: "all 0.2s",
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <span style={{ fontSize: 32 }}>{action.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{action.label}</span>
            <span style={{ fontSize: 12, color: "#999" }}>{action.sub}</span>
          </Link>
        ))}
      </div>

      {coachLevel === "apprenti" && (
        <div
          style={{
            marginTop: 32, padding: 20, background: "#fffbeb", border: "1px solid #fde68a",
            borderRadius: 14, fontSize: 13, color: "#92400e", lineHeight: 1.6,
          }}
        >
          <strong>Niveau Apprenti</strong> — Vous avez accès aux fonctionnalités essentielles de coaching.
          Passez au niveau Confirmé pour débloquer les analytics avancées et les scénarios personnalisés.
        </div>
      )}
    </div>
  );
}
