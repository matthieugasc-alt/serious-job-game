"use client";

/**
 * /debriefs/[id] — réouverture d'un bilan sauvegardé depuis l'espace
 * personnel. Rend le bilan unifié (DebriefView) tel qu'il a été généré,
 * sans nouvel appel IA. Aucun vocabulaire de mécanique.
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getGameRecord, type GameRecord } from "@/app/lib/gameHistory";
import { DebriefView, type FinalDebrief } from "@/app/workspace/debrief/DebriefView";

const ENDING: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: "Succès", color: "#16a34a", bg: "#dcfce7" },
  partial_success: { label: "Succès partiel", color: "#d97706", bg: "#fef3c7" },
  failure: { label: "À retravailler", color: "#dc2626", bg: "#fee2e2" },
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function DebriefDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [record] = useState<GameRecord | null>(() =>
    typeof window !== "undefined" && params?.id ? getGameRecord(params.id) : null,
  );

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)", padding: "28px 20px 48px", fontFamily: "Arial, sans-serif", color: "#111" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <button onClick={() => router.push("/history")} style={{ border: 0, background: "transparent", color: "#4f46e5", fontSize: 14, cursor: "pointer", padding: "4px 0", marginBottom: 12 }}>
          ← Mes bilans
        </button>

        {!record ? (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 32, textAlign: "center", color: "#6b7280" }}>
            Ce bilan n&apos;existe plus dans votre historique.
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: "#6366f1" }}>Votre bilan</p>
                <h1 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 700 }}>{record.scenarioTitle}</h1>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280" }}>{fmt(record.date)}</p>
              </div>
              {ENDING[record.ending] && (
                <span style={{ background: ENDING[record.ending].bg, color: ENDING[record.ending].color, fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>
                  {ENDING[record.ending].label}
                </span>
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              <DebriefView debrief={record.debrief as FinalDebrief} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
