"use client";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: string;
}

/**
 * Reusable stat card for dashboards (enterprise & coach).
 * Inline styles — consistent with codebase conventions.
 */
export default function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div
      data-stats-grid-item="true"
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 24,
        boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 28 }}>{icon}</span>
        <span style={{ fontSize: 32, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ fontSize: 13, color: "#666", fontWeight: 500 }}>{label}</div>
    </div>
  );
}
