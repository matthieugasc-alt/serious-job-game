/**
 * mediation — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : chat à trois voix dédié avec sélecteur de destinataire +
 *    toggle « accord / constat de désaccord » saisi à la clôture.
 *  - v3 : les DEUX parties sont participants du MÊME fil Messages —
 *    le reducer fait répondre CHAQUE participant à chaque message du
 *    joueur (actor_reply par participant, comportement natif), et la
 *    directive ci-dessous scope chaque acteur (« tu joues l'une des
 *    deux parties, jamais l'autre »). L'adressage se fait dans le texte
 *    du joueur. Output { dialogue, resolution } réinterprété :
 *    terms = la formalisation du joueur (dernier mail/message, sinon
 *    notes) ; reached = critère observé conventionnel « accord_atteint »
 *    s'il est déclaré par le step, sinon vrai dès qu'une formalisation
 *    existe (la distinction accord/constat vit dans le texte).
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  lastFormalisation,
  notesForObservation,
  optionalString,
  rawNotes,
  requireString,
  stepDialogue,
  threadsForObservation,
} from "../specHelpers";

/** Critère conventionnel pilotant resolution.reached s'il est déclaré. */
export const MEDIATION_AGREEMENT_CRITERION = "accord_atteint";

function partyIds(params: JsonObject): string[] {
  return ["party_a_actor", "party_b_actor"]
    .map((k) => (typeof params[k] === "string" ? (params[k] as string) : ""))
    .filter((v) => v.length > 0);
}

export const mediationSpec: MechanicSpec = {
  manifest: {
    id: "mediation",
    version: "3.0.0",
    title: "Médiation",
    description:
      "Le joueur conduit une médiation entre deux acteurs IA présents dans le MÊME fil Messages (chaque partie répond). L'observateur regarde le fil à trois voix et la formalisation de l'issue.",
    output_keys: ["dialogue", "resolution"],
    required_params: ["party_a_actor", "party_b_actor", "conflict_brief"],
    default_tools: [],
  },

  /** Directive UNIQUE reçue par chaque partie : elle scope l'acteur
   *  (« tu joues l'une des deux parties ») — même esprit que le v2
   *  (MEDIATION_DIRECTIVE), adapté au fil partagé. */
  directive(params: JsonObject): string {
    const [a, b] = [
      typeof params.party_a_actor === "string" ? params.party_a_actor : "?",
      typeof params.party_b_actor === "string" ? params.party_b_actor : "?",
    ];
    const brief =
      typeof params.conflict_brief === "string" ? params.conflict_brief : "";
    const scenarioDirective =
      typeof params.directive === "string" ? params.directive.trim() : "";
    return [
      "Une médiation est en cours dans le poste de travail du joueur : il régule un conflit entre deux parties présentes dans le MÊME fil de discussion.",
      `Les parties sont « ${a} » et « ${b} ». Tu joues UNE SEULE de ces deux parties — celle qui correspond à ton personnage. Ne parle jamais au nom de l'autre partie et ne rédige jamais ses répliques.`,
      brief ? `Conflit : ${brief}` : "",
      "L'autre partie et le médiateur voient tes messages. Réponds à ce qui t'est adressé ; si le message ne t'est pas adressé, réagis brièvement ou pas du tout.",
      scenarioDirective
        ? `Consigne du scénario (chaque partie n'applique que ce qui concerne son personnage) : ${scenarioDirective}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : le fil à trois voix + notes + formalisation. */
  buildArtifacts(ws, step, log): JsonObject {
    return {
      conflit:
        typeof step.params.conflict_brief === "string"
          ? step.params.conflict_brief
          : "",
      parties: partyIds(step.params),
      dialogue: threadsForObservation(ws, step, partyIds(step.params)),
      notes: notesForObservation(ws),
      issue_formalisee: lastFormalisation(ws, log, step) || "(aucune formalisation envoyée)",
    };
  },

  /** resolution réinterprétée depuis le workspace (voir en-tête). */
  buildOutput(ws, step, observation, log): JsonObject {
    const formalisation = lastFormalisation(ws, log, step);
    const notes = rawNotes(ws);
    const terms = formalisation.length > 0 ? formalisation : notes;
    const reached =
      MEDIATION_AGREEMENT_CRITERION in observation.criteria
        ? observation.criteria[MEDIATION_AGREEMENT_CRITERION] === true
        : terms.length > 0;
    return {
      dialogue: stepDialogue(ws, step, partyIds(step.params)),
      resolution: { reached, terms },
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "party_a_actor", errors);
    requireString(params, "party_b_actor", errors);
    if (
      typeof params.party_a_actor === "string" &&
      params.party_a_actor.trim().length > 0 &&
      params.party_a_actor === params.party_b_actor
    ) {
      errors.push("params.party_a_actor et params.party_b_actor doivent être distincts");
    }
    requireString(params, "conflict_brief", errors);
    optionalString(params, "directive", errors);
    return errors;
  },
};
