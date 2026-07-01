/**
 * PlayerContext — bag partagé des états, refs et helpers du player.
 *
 * Deux usages complémentaires:
 *   1. Enable l'extraction de sendMessage / handleSendMail / endPresentation
 *      en hooks qui reçoivent `PlayerContextValue` en argument (deps-bag).
 *   2. Fournir un React Context autour du JSX pour que les composants enfants
 *      puissent consommer les mêmes valeurs sans props drilling (usage futur).
 *
 * Contract:
 *   - Le composant Play crée une PlayerContextValue via useMemo et:
 *     (a) la passe explicitement aux hooks useSendChatMessage / useSendMail
 *         / useEndPresentation appelés dans le corps du composant
 *     (b) l'expose via <PlayerContext.Provider value={ctx}> autour du JSX
 *   - Les enfants JSX peuvent lire via usePlayerContext() (bonus).
 *   - Le type est intentionnellement large: c'est le baromètre de la
 *     complexité restante du composant Play — chaque nouveau champ ajouté
 *     ici est un signal de plus qui devrait vivre ailleurs à terme.
 */

import { createContext, useContext } from "react";
import type { ScenarioDefinition } from "@/app/lib/types";
import type { ModuleAction } from "../handlers";

// ── Ref shapes (mutable refs from React) ────────────────────────────

type MutableRef<T> = { current: T };

// ── The bag ─────────────────────────────────────────────────────────

export type PlayerContextValue = {
  // Scenario metadata
  scenarioId: string;
  isFounderScenario: boolean;
  displayPlayerName: string;

  // Live state
  session: any;
  scenario: ScenarioDefinition | null;
  view: any;
  currentPhaseConfig: any;
  actors: any[];
  currentPhaseAiActors: string[];
  chosenCtoId: string | null;
  chosenKolId: string | null;
  playerInput: string;
  selectedContact: string | null;
  isSending: boolean;
  conversation: any[];
  currentMailDraft: any;
  canActuallySendMail: boolean;

  // Refs (survive across renders, closure-safe)
  sessionRef: MutableRef<any>;
  scenarioRef: MutableRef<any>;
  viewRef: MutableRef<any>;
  authTokenRef: MutableRef<string | null>;
  gameSessionIdRef: MutableRef<string>;
  aiPromptRef: MutableRef<string>;
  aiPromptsMapRef: MutableRef<Record<string, string>>;
  phaseMaxDurationTriggeredRef: MutableRef<string | null>;
  phaseStartRealTimeRef: MutableRef<number>;
  presentationAutoStoppedRef: MutableRef<boolean>;
  inputRef: MutableRef<HTMLInputElement | null>;

  // Setters
  setSession: (s: any) => void;
  setPlayerInput: (s: string) => void;
  setIsSending: (b: boolean) => void;
  setSelectedContact: (s: string | null) => void;
  setShowCompose: (b: boolean) => void;
  setPresentationDone: (b: boolean) => void;
  setPresentationError: (e: any) => void;
  setVoiceTranscript: (s: string) => void;

  // Server / auth helpers
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;

  // Session mutators (imported from @/app/lib/runtime, wrapped here)
  cloneSession: (s: any) => any;
  addPlayerMessage: (s: any, text: string, to: string) => void;
  addAIMessage: (s: any, text: string, from: string) => void;
  applyEvaluation: (
    s: any,
    matchedCriteria: string[],
    scoreDelta: number,
    flagsToSet: Record<string, any>,
  ) => void;
  updateMailDraft: (s: any, phaseId: string, draft: any) => void;

  // Flow control
  resolveActor: (id: string) => string;
  resolveDynamicActors: (sess: any) => void;
  resolveEstablishmentPlaceholders: (sess: any) => void;
  injectPhaseEntryEvents: (s: any) => void;
  completeCurrentPhaseAndAdvance: (s: any) => void;
  dispatchEnterPhase: (next: any) => boolean;
  applyModuleActions: (actions: ModuleAction[], next: any) => void;
  updateAdaptiveMode: (s: any) => void;
  scheduleInterruption: (s: any) => void;
  handlePhaseFailure: (s: any) => { applied: boolean };
  checkNpcSuccessKeywords: (s: any, reply: string) => Record<string, any> | null;
  checkNpcFailureKeywords: (s: any, reply: string) => boolean;
  sendCurrentPhaseMail: (s: any, kind: string) => void;
  buildChatContext: (opts: {
    scenario: any;
    currentPhase: any;
    session: any;
    contactId: string;
  }) => any;

  // Voice / audio
  stopRecognition: () => Promise<any>;

  // Founder checkpoint notifiers (server sync)
  notifyCheckpointAdvance: (phaseId: string, index: number) => void;
  notifyCheckpointClear: () => void;
  notifyCheckpointRollback: (phaseId: string, index: number) => void;

  // UX
  addToast: (text: string, icon: string, type: "chat" | "mail") => void;
  playNotificationSound: () => void;
};

// ── Context + Provider ──────────────────────────────────────────────

export const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Hook consumer. Throws if called outside <PlayerContext.Provider>.
 * Reserved for JSX child components (bonus usage — not needed by the
 * sender hooks which receive the bag as an argument).
 */
export function usePlayerContext(): PlayerContextValue {
  const v = useContext(PlayerContext);
  if (!v) {
    throw new Error(
      "usePlayerContext must be called inside <PlayerContext.Provider>",
    );
  }
  return v;
}
