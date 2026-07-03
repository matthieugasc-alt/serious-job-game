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

// ─── Mails ────────────────────────────────────────────────────────

export interface SentMail {
  to: string[];
  subject: string;
  body: string;
}

/** Mails envoyés par le joueur pendant ce step (journal, pas la boîte). */
export function sentMails(
  log: readonly LoggedAction[],
  step: StepInvocationV3,
): SentMail[] {
  const out: SentMail[] = [];
  for (const e of stepLog(log, step)) {
    if (e.action.type !== "mail_sent") continue;
    out.push({ to: [...e.action.to], subject: e.action.subject, body: e.action.body });
  }
  return out;
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
  return `À : ${mail.to.join(", ")}\nObjet : ${mail.subject}\n\n${mail.body}`;
}

// ─── Validation de params (mêmes messages que les Runtime v2) ─────

export function requireInstructions(params: JsonObject, errors: string[]): void {
  if (typeof params.instructions !== "string" || params.instructions.trim().length === 0) {
    errors.push("params.instructions doit être une string non vide");
  }
}
