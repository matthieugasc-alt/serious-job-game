/**
 * contractNegotiationSenders — shared async senders for the 3 "standard"
 * contract negotiation overlays (S0 pacte, S2 NovaDev, S5 exceptions).
 *
 * All three follow the exact same flow:
 *   - read the input (or use a programmatic override)
 *   - push the player line to the thread
 *   - fetch the counterpart reply via `sendNegotiationMessage` (contracts module)
 *   - apply article modifications + push the counterpart reply
 *
 * The S0 pacte adds an "exclusivity" detection that flips a flag, and S5
 * exceptions logs the exchange in the session message history. Those are
 * handled by opt-in `pacteFlagsHook` / `sessionLogActor` options here.
 *
 * Devis (S4) and clinical (S3) negotiations use bespoke prompts and
 * stay in page.tsx for now.
 */

import {
  type ContractClause,
  type ContractThreadMessage,
  applyModifications,
  detectsExclusivity,
  detectsAcceptance,
  sendNegotiationMessage,
} from "../contracts";
import { ContractHandler } from "./index";

export type RunContractNegotiationOpts = {
  /** Contract type key used by ContractHandler.getNegotiationConfig. */
  contractType: "s0_pacte" | "s2_novadev" | "s5_exceptions";
  /** Raw text. Either a programmatic override or the input field value. */
  text: string;
  /** Whether the loading flag is already set (early-return guard). */
  isAlreadyLoading: boolean;
  /** Current articles list (state read). */
  articles: ContractClause[];
  /** Current thread list (state read). */
  thread: ContractThreadMessage[];

  // ── State setters from the corresponding useXxxContract hook ──
  setArticles: React.Dispatch<React.SetStateAction<ContractClause[]>>;
  setThread: React.Dispatch<React.SetStateAction<ContractThreadMessage[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Optional: clears the input. Skipped when caller passed an override. */
  clearInput?: () => void;

  // ── Per-call extras ──
  /** Active prompt string to use as roleplay (already resolved by caller). */
  roleplayPrompt: string;
  /** Narrative bag passed to the API. */
  narrative: any;
  /** Player display name. */
  playerName: string;
  /** Build auth headers for the API call. */
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;

  // ── Opt-in hooks for scenario-specific side effects ──
  /** S0 pacte: detect/apply exclusivity flag changes. */
  pacteFlagsHook?: {
    mentionsExclusivity: boolean;
    applyFlagsBeforeCall: (flagUpdates: Record<string, any>) => void;
    onAcceptanceAfterExcl: () => void;
  };
  /** S5 exceptions: log "[Négo contrat] …" + reply in the session messages. */
  sessionLog?: {
    actorId: string;
    log: (playerLine: string, counterpartReply: string) => void;
  };
};

/** Common runner — early-returns if input empty or loading. */
export async function runContractNegotiation(opts: RunContractNegotiationOpts): Promise<void> {
  const {
    contractType,
    text,
    isAlreadyLoading,
    articles,
    thread,
    setArticles,
    setThread,
    setLoading,
    clearInput,
    roleplayPrompt,
    narrative,
    playerName,
    apiHeaders,
    pacteFlagsHook,
    sessionLog,
  } = opts;

  if (!text || isAlreadyLoading) return;

  if (clearInput) clearInput();
  setThread((prev) => [...prev, { role: "player", content: text }]);

  // S0 pacte: stash exclusivity intent before the API call.
  if (pacteFlagsHook) {
    const flagUpdates: Record<string, any> = { asked_modification: true };
    if (pacteFlagsHook.mentionsExclusivity) flagUpdates.pacte_signed_clean = true;
    pacteFlagsHook.applyFlagsBeforeCall(flagUpdates);
  }

  setLoading(true);
  const negConfig = ContractHandler.getNegotiationConfig(contractType);

  try {
    const result = await sendNegotiationMessage(text, articles, thread, {
      roleplayPrompt,
      phaseTitle: negConfig.phaseTitle,
      phaseFocus: negConfig.phaseFocus,
      narrative,
      playerName,
      apiHeaders,
    });

    if (result.modifications.length > 0) {
      setArticles((prev) => applyModifications(prev, result.modifications));
    }
    setThread((prev) => [...prev, { role: "counterpart", content: result.displayReply }]);

    // S0 pacte: if the counterpart accepts an exclusivity amendment, lock the
    // clean-signed flag (in case the pre-call write was overwritten).
    if (pacteFlagsHook && pacteFlagsHook.mentionsExclusivity && detectsAcceptance(result.displayReply)) {
      pacteFlagsHook.onAcceptanceAfterExcl();
    }

    // S5 exceptions: write the exchange into session.messages for the debrief.
    if (sessionLog) {
      sessionLog.log(text, result.displayReply);
    }
  } catch {
    setThread((prev) => [...prev, { role: "counterpart", content: negConfig.fallbackError }]);
  }

  setLoading(false);
}

// Re-export the helpers callers need to construct the opts without
// adding another import line in page.tsx.
export { detectsExclusivity };
