/**
 * /play/[scenarioId] — route du player v2.
 *
 * Server component : lit scenarios/<scenarioId>/scenario.json depuis le
 * disque, vérifie le format v2 (404 sinon), puis délègue au client
 * component PlayerClient qui monte le Shell générique.
 *
 * ?campaign=<id> → saveKey `campaignId::scenarioId` (deep-save séparé
 * par campagne) et campaign_id transmis au POST /api/v2/complete.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import type { ScenarioV2 } from "@/app/lib/engine/mechanics";
import { PlayerClient } from "./PlayerClient";

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

  let scenario: ScenarioV2;
  try {
    scenario = JSON.parse(await fs.readFile(file, "utf8")) as ScenarioV2;
  } catch {
    notFound();
  }
  if (scenario.format !== "v2") notFound();

  return <PlayerClient scenario={scenario} campaignId={campaignId} />;
}
