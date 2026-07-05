/**
 * Helpers PURS partagés par les specs headless v3 (app/mechanics/<id>/spec.ts).
 * Extraient l'observable RÉEL du WorkspaceState + actionLog : notes,
 * documents, messages envoyés, mails, état du contrat. Zéro React, zéro I/O
 * (garde-fou specs.headless.test.ts).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  LoggedAction,
  StepInvocationV3,
  WorkspaceState,
} from "@/app/lib/engine/workspace";
import { describeNotesForObservation } from "@/app/workspace/tools/notes/spec";

/** Actions du journal appartenant au step (défensif : le spec ne suppose
 *  jamais que l'appelant a déjà découpé le log). */
export function stepLog(
  log: readonly LoggedAction[],
  step: StepInvocationV3,
): LoggedAction[] {
  return log.filter((e) => e.step_id === step.step_id);
}

// ─── Notes ────────────────────────────────────────────────────────

/** Contenu brut du bloc-notes ("" si vide/non initialisé). */
export function rawNotes(ws: WorkspaceState): string {
  const state = ws.toolStates["notes"];
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const content = (state as { content?: Json }).content;
    if (typeof content === "string") return content.trim();
  }
  return "";
}

/** Résumé des notes pour l'observateur IA. */
export function notesForObservation(ws: WorkspaceState): string {
  return describeNotesForObservation(ws.toolStates["notes"] ?? null);
}

// ─── Documents ────────────────────────────────────────────────────

export function documentsStatus(
  ws: WorkspaceState,
  step: StepInvocationV3,
): { opened: string[]; unopened: string[] } {
  const ids = step.document_ids ?? Object.keys(ws.documents);
  const opened: string[] = [];
  const unopened: string[] = [];
  for (const id of ids) {
    (ws.documents[id]?.opened ? opened : unopened).push(id);
  }
  return { opened, unopened };
}

// ─── Messages ─────────────────────────────────────────────────────

/** Messages envoyés par le joueur pendant ce step (contenu + destinataires). */
export function playerMessages(
  ws: WorkspaceState,
  log: readonly LoggedAction[],
  step: StepInvocationV3,
): { thread_id: string; to_actors: string[]; content: string }[] {
  const out: { thread_id: string; to_actors: string[]; content: string }[] = [];
  for (const e of stepLog(log, step)) {
    if (e.action.type !== "message_sent") continue;
    out.push({
      thread_id: e.action.thread_id,
      to_actors: [...(ws.threads[e.action.thread_id]?.participants ?? [])],
      content: e.action.content,
    });
  }
  return out;
}

/** Fil complet d'une discussion, rendu lisible pour l'observateur. */
export function threadTranscript(ws: WorkspaceState, threadId: string): string {
  const thread = ws.threads[threadId];
  if (!thread || thread.messages.length === 0) return "(fil vide)";
  return thread.messages
    .map((m) => `${m.from === "player" ? "Joueur" : m.actor_id ?? m.from} : ${m.content}`)
    .join("\n");
}

/**
 * Fils pertinents pour un step : ceux qu'il déclare (step.threads),
 * sinon ceux où participe l'un des acteurs donnés, sinon tous les fils.
 * Les threads persistent entre steps — les specs ne supposent jamais
 * qu'un fil leur appartient.
 */
export function stepThreadIds(
  ws: WorkspaceState,
  step: StepInvocationV3,
  actorIds: readonly string[] = [],
): string[] {
  const declared = (step.threads ?? [])
    .map((t) => t.thread_id)
    .filter((id) => Boolean(ws.threads[id]));
  if (declared.length > 0) return declared;
  const withActors = Object.keys(ws.threads).filter((id) =>
    actorIds.some((a) => ws.threads[id].participants.includes(a)),
  );
  return withActors.length > 0 ? withActors : Object.keys(ws.threads);
}

/**
 * Dialogue des fils du step, format compact « Joueur : … / <actor_id> : … »
 * (successeur v3 du buildDialogue des Runtime v2). "" si rien ne s'est dit.
 */
export function stepDialogue(
  ws: WorkspaceState,
  step: StepInvocationV3,
  actorIds: readonly string[] = [],
): string {
  return stepThreadIds(ws, step, actorIds)
    .filter((id) => (ws.threads[id]?.messages.length ?? 0) > 0)
    .map((id) => threadTranscript(ws, id))
    .join("\n\n");
}

/** Même dialogue, mais préfixé par fil — la vue de l'observateur IA. */
export function threadsForObservation(
  ws: WorkspaceState,
  step: StepInvocationV3,
  actorIds: readonly string[] = [],
): string {
  const ids = stepThreadIds(ws, step, actorIds);
  if (ids.length === 0) return "(aucun fil de discussion)";
  return ids
    .map((id) => `— Fil ${id} —\n${threadTranscript(ws, id)}`)
    .join("\n\n");
}

// ─── Mails ────────────────────────────────────────────────────────

export interface SentMailArtifact {
  title: string;
  /** Snapshot textuel exhaustif de l'artefact, figé à l'envoi. */
  snapshot: string;
}

export interface SentMail {
  to: string[];
  subject: string;
  body: string;
  /** Artefacts joints (note/mind map/décision/tableau/tableau blanc). Leur
   *  contenu exhaustif entre dans l'analyse — le snapshot voyage dans
   *  l'action, aucun Tool n'est lu ici (invariant préservé). */
  artifacts?: SentMailArtifact[];
}

/** Mails envoyés par le joueur pendant ce step (journal, pas la boîte). */
export function sentMails(
  log: readonly LoggedAction[],
  step: StepInvocationV3,
): SentMail[] {
  const out: SentMail[] = [];
  for (const e of stepLog(log, step)) {
    if (e.action.type !== "mail_sent") continue;
    const artifacts = (e.action.attachment_artifacts ?? []).map((a) => ({
      title: a.title,
      snapshot: a.snapshot,
    }));
    out.push({
      to: [...e.action.to],
      subject: e.action.subject,
      body: e.action.body,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    });
  }
  return out;
}

/** Rend les artefacts joints en texte, pour l'analyse IA. */
function formatArtifacts(artifacts: SentMailArtifact[] | undefined): string {
  if (!artifacts || artifacts.length === 0) return "";
  const blocks = artifacts.map(
    (a) => `— Pièce jointe : ${a.title} —\n${a.snapshot}`,
  );
  return `\n\n[Artefacts joints au mail — contenu intégral]\n${blocks.join("\n\n")}`;
}

/** Dernier mail envoyé pendant le step (au destinataire donné si précisé). */
export function lastSentMail(
  log: readonly LoggedAction[],
  step: StepInvocationV3,
  toActor?: string,
): SentMail | null {
  const mails = sentMails(log, step).filter(
    (m) => toActor === undefined || m.to.includes(toActor),
  );
  return mails[mails.length - 1] ?? null;
}

export function formatMail(mail: SentMail): string {
  return `À : ${mail.to.join(", ")}\nObjet : ${mail.subject}\n\n${mail.body}${formatArtifacts(mail.artifacts)}`;
}

/**
 * Dernière formalisation du joueur pendant le step : dernier mail
 * envoyé (prioritaire, comme la spec decision), sinon dernier message.
 */
export function lastFormalisation(
  ws: WorkspaceState,
  log: readonly LoggedAction[],
  step: StepInvocationV3,
): string {
  const mail = lastSentMail(log, step);
  if (mail) return `Objet : ${mail.subject}\n\n${mail.body}${formatArtifacts(mail.artifacts)}`;
  const messages = playerMessages(ws, log, step);
  return messages[messages.length - 1]?.content ?? "";
}

// ─── Livrables (payload du journal — les tools ne sont pas requis) ─

/** Dernier payload deliverable_submitted du step (du tool donné). */
export function lastDeliverablePayload(
  log: readonly LoggedAction[],
  step: StepInvocationV3,
  toolId?: string,
): JsonObject | null {
  let out: JsonObject | null = null;
  for (const e of stepLog(log, step)) {
    if (e.action.type !== "deliverable_submitted") continue;
    if (toolId !== undefined && e.action.tool_id !== toolId) continue;
    out = e.action.payload;
  }
  return out;
}

// ─── Validation de params (mêmes messages que les Runtime v2) ─────

export function requireInstructions(params: JsonObject, errors: string[]): void {
  if (typeof params.instructions !== "string" || params.instructions.trim().length === 0) {
    errors.push("params.instructions doit être une string non vide");
  }
}

/** Param string non vide requis — même message que les Runtime v2. */
export function requireString(
  params: JsonObject,
  key: string,
  errors: string[],
): void {
  if (typeof params[key] !== "string" || (params[key] as string).trim().length === 0) {
    errors.push(`params.${key} doit être une string non vide`);
  }
}

/** Param string optionnel — même message que les Runtime v2. */
export function optionalString(
  params: JsonObject,
  key: string,
  errors: string[],
): void {
  if (params[key] !== undefined && typeof params[key] !== "string") {
    errors.push(`params.${key} doit être une string`);
  }
}

/**
 * Consigne spécifique du scénario (params.directive), explicitement
 * scopée à un acteur : les threads persistent entre steps, un AUTRE
 * acteur peut recevoir ce cadrage (même règle que la spec negociation).
 */
export function scopedScenarioDirective(
  params: JsonObject,
  actorKey = "actor_id",
): string {
  const directive =
    typeof params.directive === "string" ? params.directive.trim() : "";
  if (directive.length === 0) return "";
  const actorId =
    typeof params[actorKey] === "string" ? (params[actorKey] as string) : "";
  return actorId
    ? `Consigne spécifique pour l'acteur « ${actorId} » (à ignorer si tu joues un autre personnage) : ${directive}`
    : directive;
}
