import { NextResponse } from "next/server";

/**
 * POST /api/v2/decision-assist — OSSATURE (préparée, non implémentée).
 * Assistant IA d'organisation décisionnelle du Decision Engine
 * (docs/TOOL_DECISION_ENGINE.md §11 ; contrat dans
 * app/workspace/tools/decision-engine/assistant.ts).
 *
 * Garde-fous de l'implémentation future (jamais violables) :
 *   - ne reçoit QUE l'état d'un board/décision (jamais scénario, critères
 *     d'évaluation, prompts d'acteurs) ;
 *   - ne renvoie que des OPS PROPOSÉES (via l'API publique), refusables ;
 *   - ne choisit JAMAIS à la place du joueur.
 *
 * Aujourd'hui : renvoie 501 (non implémenté) pour matérialiser la couture
 * sans introduire de non-déterminisme avant le playtest de la boucle IA.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Assistant décisionnel préparé mais non implémenté. Sera branché en version finale, après le playtest de la boucle IA.",
    },
    { status: 501 },
  );
}
