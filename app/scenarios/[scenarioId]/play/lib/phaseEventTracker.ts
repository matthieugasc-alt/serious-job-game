/**
 * Single source of truth for phase entry-event idempotency keys.
 *
 * Why this exists
 * ───────────────
 * Both runtime.injectPhaseEntryEvents and InterviewHandler.* track which
 * phase entry events have already been injected by pushing keys into
 * session.injectedPhaseEntryEvents. Historically the two modules used
 * DIFFERENT key formats (`phaseId::eventId` vs `phaseId__eventId`),
 * which caused the S0 "Alex parle en double" bug — InterviewHandler
 * pushed `phase_1_marc__hello` then runtime looked for
 * `phase_1_marc::hello`, didn't find it, and re-injected the message.
 *
 * From now on, EVERY producer must derive its key through
 * computeEntryEventKey() and check membership through hasInjectedKey()
 * / mark with markInjectedKey().
 *
 * Key shape
 * ─────────
 *   `${phaseId}::${eventId}`
 *
 * Event-id resolution chain (mirrors runtime.injectPhaseEntryEvents):
 *   event.message_id  ||  event.event_id  ||  event.id
 *   ||  `${phaseId}::${event.content}`         ← stable fallback
 */

export type PhaseEventLike = {
  event_id?: string;
  message_id?: string;
  id?: string;
  content?: string;
};

/** Derive the id of an event, falling back to its content if untyped. */
export function resolveEventId(event: PhaseEventLike, phaseId: string): string {
  return (
    event.message_id
    || event.event_id
    || event.id
    || `${phaseId}::${event.content || ""}`
  );
}

/** Canonical key for the dedup list. */
export function computeEntryEventKey(phaseId: string, event: PhaseEventLike): string {
  const eventId = resolveEventId(event, phaseId);
  return `${phaseId}::${eventId}`;
}

/** Same shape but when the caller already has an eventId in hand. */
export function buildEntryEventKey(phaseId: string, eventId: string): string {
  return `${phaseId}::${eventId}`;
}

/** Idempotency check against session.injectedPhaseEntryEvents. */
export function hasInjectedKey(
  injectedList: readonly string[] | undefined,
  key: string,
): boolean {
  return Array.isArray(injectedList) && injectedList.includes(key);
}

/** Append the key to the dedup list in place if not already there. */
export function markInjectedKey(injectedList: string[], key: string): void {
  if (!injectedList.includes(key)) {
    injectedList.push(key);
  }
}
