"use client";

import { useEffect, useRef, useState } from "react";
import { saveGameRecord } from "@/app/lib/gameHistory";
import type { ScenarioDefinition } from "@/app/lib/types";

/**
 * Parameters for the useDebrief hook.
 * Every value comes from the parent component — no logic change.
 */
interface UseDebriefParams {
  view: any;
  scenario: ScenarioDefinition | null;
  session: any;
  scenarioId: string;
  isFounderScenario: boolean;
  displayPlayerName: string;
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
  authTokenRef: React.MutableRefObject<string | null>;
  /** Called once when debrief starts, to stop TTS/mic */
  onDebriefStart: () => void;
  /** Called when founder scenario finishes to clear checkpoint */
  notifyCheckpointClear: () => void;
}

interface UseDebriefReturn {
  debriefData: any;
  debriefLoading: boolean;
  debriefError: string | null;
}

export function useDebrief({
  view,
  scenario,
  session,
  scenarioId,
  isFounderScenario,
  displayPlayerName,
  apiHeaders,
  authTokenRef,
  onDebriefStart,
  notifyCheckpointClear,
}: UseDebriefParams): UseDebriefReturn {
  const [debriefData, setDebriefData] = useState<any>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const debriefCalledRef = useRef(false);
  const debriefSavedRef = useRef(false);

  // ── Call AI debrief when game finishes (once only) ──
  useEffect(() => {
    if (!view?.isFinished || !scenario || !session || debriefCalledRef.current) return;
    debriefCalledRef.current = true;

    // Stop any TTS audio still playing from the last phase + stop mic
    onDebriefStart();

    // ── FOUNDER MODE: build micro-debrief locally (no classic debrief API) ──
    if (isFounderScenario) {
      const flags = session.flags || {};
      let decision = "";
      let impact = "";
      let strength = "";
      let risk = "";
      let advice = "";
      let ending = "partial_success";

      if (scenarioId === "founder_00_cto") {
        // Scenario 0 — CTO + pacte
        const hasCleanPacte = !!flags.pacte_signed_clean;
        const hasBadLeaver = !!flags.bad_leaver_triggered;
        const paidToLeave = !!flags.cto_paid_to_leave;

        if (hasCleanPacte && hasBadLeaver) {
          decision = "Tu as repéré la clause manquante dans le pacte et exigé son ajout. Quand le CTO a trahi, tu avais les armes juridiques pour agir.";
          impact = "Clause de bad leaver activée. Le CTO sort avec 0 € d'indemnité. Equity récupérée. Trésorerie intacte.";
          strength = "Lecture attentive du pacte et réflexe juridique au bon moment.";
          risk = "Tu repars sans CTO. Il faudra en retrouver un rapidement.";
          ending = "success";
        } else if (paidToLeave) {
          decision = "Tu as signé le pacte sans repérer l'absence de clause d'exclusivité. Le CTO a exploité cette faille.";
          impact = "Le CTO part avec 2 500 € d'indemnité. Ta trésorerie passe de 15 000 € à 12 500 €.";
          strength = "Tu as quand même agi en envoyant un mail formel de rupture.";
          risk = "Un pacte d'associés se lit ligne par ligne. Chaque clause manquante est un risque futur.";
          advice = "Avant de signer tout document juridique, compare-le systématiquement avec les recommandations de ton avocat.";
          ending = "failure";
        } else {
          decision = "Tu as confronté le CTO sur sa double activité et formalisé la rupture par mail.";
          impact = "La situation est résolue. Le CTO quitte Orisio.";
          strength = "Tu as pris une décision claire et tu l'as formalisée.";
          risk = "Vérifie toujours que tes documents juridiques couvrent les cas critiques avant de les signer.";
        }
      } else if (scenarioId === "founder_02_mvp") {
        // Scenario 2 — MVP + négociation NovaDev
        const alexandreOk = !!flags.alexandre_convinced;
        const scopeOk = !!flags.scope_reduced;
        const dealDone = !!flags.novadev_negotiated;
        const signed = !!flags.contract_signed;

        if (signed && scopeOk) {
          decision = "Tu as convaincu Alexandre de réduire le scope, négocié un prix serré avec NovaDev, et signé le contrat.";
          impact = "Le MVP sera livré en 7 semaines. Planning + annulations. Budget maîtrisé.";
          strength = "Capacité à recadrer un cofondateur passionné sans le braquer, et à négocier un prix réaliste.";
          risk = "Le MVP est minimal — il faudra itérer vite après la V1 pour convaincre les premiers clients.";
          ending = "success";
        } else if (dealDone) {
          decision = "Tu as trouvé un accord avec NovaDev, mais le prix négocié laisse peu de marge.";
          impact = "Le MVP est lancé mais la trésorerie est sous tension.";
          strength = "Tu as quand même réussi à lancer le développement.";
          risk = "Avec un budget aussi serré, le moindre imprévu peut tout bloquer.";
          ending = "partial_success";
        } else {
          decision = "La négociation n'a pas abouti dans les temps.";
          impact = "Pas de MVP lancé. NovaDev est passée à un autre projet.";
          strength = alexandreOk ? "Tu as au moins aligné ton cofondateur sur le scope." : "Le dialogue avec Alexandre était difficile.";
          risk = "Sans MVP, Orisio perd du temps précieux. Il faudra trouver un autre prestataire.";
          ending = "failure";
        }
      } else if (scenarioId === "founder_04_v1") {
        // Scenario 4 — Passage en V1 : diagnostic pilote + négociation Thomas
        const devisTotal = flags.devis_total ?? 0;
        const selectedFeatures: string[] = flags.devis_selected_features ?? [];
        const badDeal = !!flags.deal_interessement_uncapped || !!flags.deal_bsa_excessive;
        const featureTrap = devisTotal > 15000 || selectedFeatures.length >= 4;
        const goodDeal = !!flags.deal_interessement_capped || !!flags.deal_bsa_reasonable;
        const cashOnly = !!flags.deal_cash_only;
        const surgicalScope = devisTotal <= 5000;

        if (badDeal) {
          decision = "Tu as cédé trop à Thomas : intéressement sans plafond ou BSA excessifs. Le coût peut exploser.";
          impact = `Devis signé à ${devisTotal.toLocaleString("fr-FR")} €. Mais le deal financier avec Thomas est disproportionné — les investisseurs verront une cap table polluée.`;
          strength = "Tu as maintenu la relation avec Thomas. Il est motivé et aligné.";
          risk = "Un intéressement sans plafond ou 5% de BSA pour un prestataire, c'est un signal de fondateur naïf en due diligence.";
          advice = "Lis TOUJOURS la note de l'avocat AVANT de négocier. Et un plafond protège les deux parties.";
          ending = "bad_deal";
        } else if (featureTrap) {
          decision = `Tu as commandé ${selectedFeatures.length} modules pour ${devisTotal.toLocaleString("fr-FR")} €. Le budget explose et le vrai problème (adoption) n'est pas adressé.`;
          impact = "La dette technique monte, le cash fond, et les 10 chirurgiens inactifs le resteront — personne n'a été formé.";
          strength = "Le produit sera plus complet. Si l'adoption finit par décoller, tu auras de l'avance sur les features.";
          risk = "Tu as dépensé gros sans adresser le vrai problème. Un produit riche que personne n'utilise ne vaut rien.";
          advice = "Il n'est pas trop tard pour lancer un plan de formation EN PARALLÈLE du dev.";
          ending = "feature_trap";
        } else if (surgicalScope && (goodDeal || cashOnly)) {
          decision = "Tu as identifié le vrai problème (adoption, pas features), priorisé le bug critique, et négocié un deal raisonnable.";
          impact = `${devisTotal.toLocaleString("fr-FR")} € de dev ciblé. La dette technique baisse, le budget est maîtrisé.`;
          strength = "Tu as résisté à la pression de ton cofondateur. C'est la compétence la plus rare chez un fondateur : dire non à son associé quand il a tort.";
          risk = "Alexandre est frustré. Il faudra gérer cette tension et prouver par les données que l'adoption est le vrai levier.";
          advice = "Documente les résultats du plan de formation. Dans 4 semaines, si l'adoption monte, tu auras les données pour convaincre Alexandre.";
          ending = "optimal";
        } else {
          decision = `Devis à ${devisTotal.toLocaleString("fr-FR")} € avec un deal correct. La V1 avance sur des bases raisonnables.`;
          impact = "Le bug est corrigé et quelques améliorations utiles sont en cours. Le deal avec Thomas est acceptable.";
          strength = "Tu as pris des décisions raisonnables sous pression.";
          risk = "Le plan de formation n'est pas assez poussé. L'adoption risque de stagner même avec un meilleur produit.";
          advice = "Surveille les métriques d'adoption de près. Si dans 3 semaines les connexions ne remontent pas, le problème est humain, pas technique.";
          ending = "good";
        }
      } else {
        // Generic founder debrief for other scenarios
        decision = "Scénario terminé.";
        impact = "Les résultats seront visibles sur le dashboard de campagne.";
        strength = "Tu as complété cette étape.";
        risk = "";
        ending = session.scores?.total >= 8 ? "success" : "partial_success";
      }

      const founderDebrief = {
        isFounderDebrief: true,
        decision,
        impact,
        strength,
        risk,
        advice,
        ending,
        ending_narrative: decision,
        overall_summary: decision,
        phases: [],
        strengths: [strength],
        improvements: risk ? [risk] : [],
        pedagogical_advice: advice,
        contractPrice: flags.devis_cash_paid ?? flags.devis_total ?? flags.contract_price ?? null,
        contractEquity: flags.deal_bsa_pct ?? flags.contract_equity ?? null,
        royaltiesPct: flags.royalties_pct ?? null,
        royaltiesCap: flags.royalties_cap ?? null,
        royaltiesDuration: flags.royalties_duration_years ?? null,
      };
      setDebriefData(founderDebrief);
      setDebriefLoading(false);
      return;
    }

    // ── CLASSIC MODE: call AI debrief API ──
    setDebriefLoading(true);
    setDebriefError(null);

    const debriefPayload = {
      playerName: displayPlayerName,
      scenarioTitle: scenario.meta?.title || "Scénario",
      phases: scenario.phases,
      conversation: session.chatMessages,
      sentMails: session.sentMails,
      inboxMails: session.inboxMails,
      endings: scenario.endings || [],
      defaultEnding: (scenario as any).default_ending || null,
    };

    const MAX_DEBRIEF_RETRIES = 3;
    (async () => {
      for (let attempt = 0; attempt < MAX_DEBRIEF_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const freshToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
            if (freshToken) authTokenRef.current = freshToken;
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }

          const r = await fetch("/api/debrief", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify(debriefPayload),
          });

          if (r.status === 504 || r.status === 502 || r.status >= 500) {
            if (attempt < MAX_DEBRIEF_RETRIES - 1) continue;
            throw new Error(`Erreur serveur (${r.status}) — le débrief a pris trop de temps.`);
          }

          if (r.status === 401) {
            if (attempt < MAX_DEBRIEF_RETRIES - 1) continue;
            throw new Error("Session expirée. Reconnectez-vous pour générer le débrief.");
          }

          if (r.status === 429) throw new Error("Trop de requêtes. Veuillez patienter quelques instants.");
          if (r.status === 400) throw new Error("Données invalides pour le débrief.");
          if (!r.ok) throw new Error(`Erreur serveur (${r.status})`);

          const data = await r.json();
          setDebriefData(data);
          setDebriefLoading(false);
          return;
        } catch (err: any) {
          if (attempt < MAX_DEBRIEF_RETRIES - 1 && !err.message?.includes("Session expirée")) {
            continue;
          }
          setDebriefError(err.message || "Erreur lors du débrief");
          setDebriefLoading(false);
          return;
        }
      }
    })();
  }, [view?.isFinished]);

  // ── Save debrief to game history (once only) — localStorage + server ──
  useEffect(() => {
    if (!debriefData || debriefSavedRef.current || !scenario) return;
    debriefSavedRef.current = true;

    // Clear Founder checkpoint — scenario is finished
    notifyCheckpointClear();

    const phases = debriefData.phases || [];
    const avgScore =
      phases.length > 0
        ? Math.round(
            phases.reduce((s: number, p: any) => s + (p.phase_score || 0), 0) /
              phases.length
          )
        : 0;

    // Save to localStorage (legacy)
    saveGameRecord({
      scenarioId: scenarioId as string,
      scenarioTitle: scenario.meta?.title || "Scenario",
      playerName: displayPlayerName,
      ending: debriefData.ending || "failure",
      avgScore,
      debrief: debriefData,
    });

    // Save to server (for profile/history/PDF)
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) {
      fetch("/api/profile/save-game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scenarioId: scenarioId as string,
          scenarioTitle: scenario.meta?.title || "Scenario",
          playerName: displayPlayerName,
          ending: debriefData.ending || "failure",
          avgScore,
          durationMin: Math.max(1, Math.round(
            (Date.now() - (session.realStartTime || Date.now())) / 60000
          )),
          phasesCompleted: session.completedPhases?.length || 0,
          totalPhases: scenario.phases?.length || 0,
          debrief: { ...debriefData, scenarioCompetencies: scenario.meta?.competencies || [] },
          jobFamily: scenario.meta?.job_family || "",
          difficulty: scenario.meta?.difficulty || "junior",
          organizationId: typeof window !== "undefined" ? localStorage.getItem("active_org_id") || undefined : undefined,
        }),
      }).then(async (res) => {
        if (!res || !res.ok) {
          const errBody = await res?.json().catch(() => ({}));
          console.error("Erreur sauvegarde partie:", res?.status, errBody);
          return;
        }
        const data = await res.json();
        // Trigger async skill extraction
        if (data.record?.id && token) {
          fetch("/api/profile/extract-skills", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ recordId: data.record.id }),
          }).catch((err) => console.error("Skill extraction failed:", err));
        }
      }).catch((err) => console.error("Failed to save game to server:", err));
    }
  }, [debriefData]);

  return { debriefData, debriefLoading, debriefError };
}
