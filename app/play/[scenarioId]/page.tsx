/**
 * /play/[scenarioId] — route du player (v3 uniquement).
 *
 * Server component : lit scenarios/<scenarioId>/scenario.json depuis le
 * disque, vérifie le format ("v3" sinon 404 — le player v2 est purgé,
 * cf. archive/legacy-v2/ARCHIVE.md), vérifie le verrouillage admin
 * (scenarioConfig → page « scénario verrouillé », jamais le player), puis
 * délègue au WorkspacePlayer (poste de travail immersif).
 *
 * ?campaign=<id> → saveKey `campaignId::scenarioId` (deep-save séparé
 * par campagne) et campaign_id transmis au POST /api/v2/complete.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ScenarioV3 } from "@/app/lib/engine/workspace";
import { getScenarioConfig } from "@/app/lib/scenarioConfig";
import { WorkspacePlayer } from "@/app/workspace/WorkspacePlayer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ scenarioId: string }>;
  searchParams: Promise<{ campaign?: string | string[] }>;
}

export default async function PlayPage({ params, searchParams }: Props) {
  const { scenarioId } = await params;
  const sp = await searchParams;
  const campaignId = typeof sp.campaign === "string" ? sp.campaign : undefined;

  // Garde anti path-traversal : un scenarioId est un nom de dossier simple.
  if (!/^[a-zA-Z0-9_-]+$/.test(scenarioId)) notFound();

  const file = path.join(process.cwd(), "scenarios", scenarioId, "scenario.json");

  let scenario: ScenarioV3;
  try {
    scenario = JSON.parse(await fs.readFile(file, "utf8")) as ScenarioV3;
  } catch {
    notFound();
  }
  if (scenario.format !== "v3") notFound();

  // ── Verrouillage admin (exigence PO) ────────────────────────────
  // Un scénario verrouillé via l'admin reste visible sur le catalogue
  // (carte grisée + cadenas) mais son lancement est bloqué ici, côté
  // serveur : on rend une page « scénario verrouillé », jamais le Shell.
  const config =
    getScenarioConfig(scenario.scenario_id) ?? getScenarioConfig(scenarioId);
  if (config?.adminLocked) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
          fontFamily: "Arial, sans-serif",
          padding: 20,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 18,
            padding: "40px 32px",
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#111" }}>
            Scénario verrouillé
          </h1>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "#666", lineHeight: 1.6 }}>
            {config.lockMessage || "Ce scénario est en cours de développement et n'est pas jouable pour le moment."}
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 8,
              background: "#5b5fc7",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ← Retour au catalogue
          </Link>
        </div>
      </main>
    );
  }

  return <WorkspacePlayer scenario={scenario} campaignId={campaignId} />;
}
