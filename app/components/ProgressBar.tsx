"use client";

interface ProgressBarProps {
  label: string;
  percent: number;
  color: string;
  detail?: string;
}

/**
 * Reusable progress bar for dashboards.
 */
export default function ProgressBar({ label, percent, color, detail }: ProgressBarProps) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 24,
      }}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>{label}</h3>
      <div
        style={{
          background: "#f3f4f6",
          borderRadius: 8,
          height: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: color,
            borderRadius: 8,
            transition: "width 0.3s",
          }}
        />
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "#666" }}>
        {detail || `${percent}% complétés`}
      </p>
    </div>
  );
}
