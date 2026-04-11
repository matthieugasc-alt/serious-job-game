/**
 * Comprehensive TypeScript type definitions for a generic serious game scenario engine.
 *
 * This module provides complete type safety for:
 * - Scenario configuration (JSON-defined scenarios with multiple phases)
 * - Character and channel management
 * - Dynamic phase completion rules
 * - Generic ending conditions
 * - Per-phase mail configuration
 * - Configurable interruptions and triggers
 * - Session state and runtime tracking
 * - User and game session management
 */

// ===== SCENARIO DEFINITION TYPES =====

/**
 * The complete scenario JSON structure.
 * This is the root type for all scenario configurations.
 * Supports multi-scenario, multi-phase, data-driven gameplay.
 */
export type ScenarioDefinition = {
  /** Unique identifier for this scenario */
  scenario_id: string;

  /** Semantic version of the scenario (e.g., "1.0.0") */
  version: string;

  /** Language/locale code (e.g., "en-US", "fr-FR") */
  locale: string;

  /** Metadata about the scenario (title, difficulty, tags) */
  meta: ScenarioMeta;

  /** Narrative context and setup */
  narrative: ScenarioNarrative;

  /** Timeline configuration and scenario-specific timestamps */
  timeline: ScenarioTimeline;

  /**
   * Content for the introduction page.
   * Rendered dynamically as cards to introduce context, characters, and objectives.
   */
  introduction: IntroductionConfig;

  /** All AI-controlled and system-controlled characters in this scenario */
  actors: ActorDefinition[];

  /** Available communication channels (chat, mail, phone, etc.) */
  channels: ChannelDefinition[];

  /** Documents and resources available to the player */
  resources: { documents: DocumentDefinition[] };

  /** Scenario-specific constraints (custom validation rules, etc.) */
  constraints: Record<string, any>;

  /** Initial game state flags */
  state: {
    flags: Record<string, boolean>;
  };

  /** Events triggered automatically at game start */
  initial_events: InitialEvent[];

  /** Ordered list of phases (phases are unlocked sequentially by default) */
  phases: PhaseDefinition[];

  /** All possible endings, checked in priority order */
  endings: EndingDefinition[];

  /** Fallback ending if none of the conditions match */
  default_ending: {
    ending_id: string;
    label: string;
    content: string;
  };
};

/**
 * Metadata about the scenario.
 * Used for scenario selection, filtering, and classification.
 */
export type ScenarioMeta = {
  /** Human-readable title of the scenario */
  title: string;

  /** Short subtitle for display */
  subtitle: string;

  /** Description shown on the scenario selection card */
  description: string;

  /** Optional URL or path to thumbnail image */
  thumbnail?: string;

  /** Job family this scenario targets (e.g., "HR", "Sales", "Management") */
  job_family: string;

  /** Difficulty level */
  difficulty: "junior" | "intermediate" | "senior";

  /** Estimated time to complete in minutes */
  estimated_duration_min: number;

  /** Learning objectives this scenario teaches */
  pedagogical_goals: string[];

  /** Optional list of competencies developed by this scenario */
  competencies?: Array<{
    competency: string;
    description: string;
  }>;

  /** Optional tags for filtering and discovery */
  tags?: string[];
};

/**
 * Narrative context that frames the scenario.
 * Provides the "why" and "what" of the simulation.
 */
export type ScenarioNarrative = {
  /** Background context (e.g., "You are a new employee at...") */
  context: string;

  /** The main mission or goal (e.g., "Resolve the customer complaint") */
  mission: string;

  /** Detailed initial situation description */
  initial_situation: string;

  /** What triggers the scenario to begin */
  trigger: string;

  /** Optional additional background facts */
  background_fact?: string;
};

/**
 * Timeline configuration for the scenario.
 * Defines when the scenario starts and how time flows.
 */
export type ScenarioTimeline = {
  /** ISO 8601 datetime when the scenario begins */
  scenario_start: string;

  /** Speed multiplier for simulated time (1.0 = real-time, 2.0 = 2x speed) */
  sim_speed_multiplier: number;

  /** Additional scenario-specific timestamps or dates */
  [key: string]: any;
};

/**
 * Configuration for the introduction page.
 * Displays information cards to onboard the player.
 */
export type IntroductionConfig = {
  /** Header section of the introduction */
  header: {
    /** Tag or label (e.g., "Simulation métier") */
    tag: string;

    /** Main title */
    title: string;

    /** Subtitle or tagline */
    subtitle: string;
  };

  /** Cards displayed below the header (typically 2 columns) */
  cards: IntroCard[];
};

/**
 * A single card in the introduction page.
 * Can display text, character information, tips, etc.
 */
export type IntroCard = {
  /** Card title */
  title: string;

  /** Card content (can be HTML for rich formatting) */
  content: string;

  /** Column placement (left or right) */
  column: "left" | "right";

  /** Optional type hint for styling (text, characters, tip, etc.) */
  type?: "text" | "characters" | "tip";
};

/**
 * Definition of a character (actor) in the scenario.
 * Characters can be controlled by the player, AI, or system.
 */
export type ActorDefinition = {
  /** Unique identifier for this actor */
  actor_id: string;

  /** Display name of the character */
  name: string;

  /** Role or title (e.g., "Customer", "Manager", "System") */
  role: string;

  /** Optional personality description for AI context */
  personality?: string;

  /** Avatar display configuration */
  avatar: {
    /** Color hex code or CSS color (e.g., "#FF5733") */
    color: string;

    /** 1-2 character initials for avatar display */
    initials: string;
  };

  /** Which channels this actor can use to communicate (references channel_id) */
  interaction_channels: string[];

  /** Who controls this actor: player (1st person), ai (NPC), or system */
  controlled_by: "player" | "ai" | "system";

  /**
   * Relative path to a markdown file containing the AI prompt.
   * Only used if controlled_by === "ai"
   */
  prompt_file?: string;

  /** Optional availability note (e.g., "Available 9am-5pm") */
  availability?: string;

  /** Whether this actor appears in the contacts/characters list */
  visible_in_contacts: boolean;

  /** Current availability status (affects UI display) */
  contact_status?: "available" | "busy" | "offline";

  /** Preview text shown in the contacts list */
  contact_preview?: string;
};

/**
 * Definition of a communication channel.
 * Multiple channels can be active simultaneously in a phase.
 */
export type ChannelDefinition = {
  /** Unique identifier for this channel */
  channel_id: string;

  /** Type of channel (determines UI and behavior) */
  type: "chat" | "mail" | "phone" | "sms" | "visio";

  /** Label displayed on the channel tab */
  label: string;

  /** Optional icon identifier or CSS class */
  icon?: string;

  /** Whether this channel is available for use */
  enabled: boolean;
};

/**
 * Definition of a document or resource.
 * Documents can be sent as attachments in mail.
 */
export type DocumentDefinition = {
  /** Unique identifier for this document */
  doc_id: string;

  /** Human-readable label/name */
  label: string;

  /** Optional list of tags or keywords (for searchability) */
  contains?: string[];

  /** Whether this document can be attached to mail */
  usable_as_attachment: boolean;

  /** Optional file path or URL */
  file_path?: string;
};

/**
 * An event triggered at game start.
 * Typically used to send initial messages or mails to the player.
 */
export type InitialEvent = {
  /** Unique identifier */
  event_id: string;

  /** Which actor sends this event (actor_id) */
  actor: string;

  /** Message content */
  content: string;

  /** Which channel delivers this event */
  channel: string;

  /** Optional event type (for categorization) */
  type?: string;

  /** Optional language override */
  language?: string;

  /** Subject line (required for mail channel) */
  subject?: string;

  /** Optional attachments */
  attachments?: Array<{ id: string; label: string }>;
};

// ===== PHASE TYPES =====

/**
 * Definition of a scenario phase.
 * Phases are sequential segments with specific objectives and completion rules.
 */
export type PhaseDefinition = {
  /** Unique identifier for this phase (used in transitions and scoring) */
  phase_id: string;

  /** Display title of the phase */
  title: string;

  /** Learning objective for this phase */
  objective: string;

  /** Optional introductory message shown when entering the phase */
  intro_message?: string;

  /** Approximate duration hint in minutes */
  duration_hint_min?: number;

  /** IDs of channels active in this phase (subset of scenario channels) */
  active_channels: string[];

  /** IDs of AI actors that respond/participate in this phase */
  ai_actors: string[];

  /** Optional player input configuration */
  player_input?: {
    type: string;
    prompt: string;
  };

  /** Scoring configuration for this phase */
  scoring: {
    /** Maximum possible score in this phase (optional) */
    max_score?: number;

    /** List of scoring criteria with point values */
    criteria: CriterionDefinition[];
  };

  /** Generic rules that determine phase completion (data-driven, no hardcoded IDs) */
  completion_rules: CompletionRules;

  /** Actions triggered when this phase is completed */
  on_complete?: {
    /** Flags to set when completion occurs */
    set_flags?: Record<string, boolean>;
  };

  /** Next phase_id to transition to, or "finish" to end scenario */
  next_phase?: string;

  /** Mail-specific configuration for this phase */
  mail_config?: PhaseMailConfig;

  /** Events injected when player enters this phase */
  entry_events?: PhaseEvent[];

  /**
   * Timed interruptions during this phase.
   * Can trigger based on time elapsed, message count, or phase entry.
   */
  interruptions?: InterruptionDefinition[];

  /** Number of minutes to fast-forward simulation time when entering this phase */
  time_jump_minutes?: number;

  /** If true, no system message announces the phase transition */
  silent_advance?: boolean;

  /**
   * If true, phase auto-advances once validated.
   * If false, player must explicitly complete an action (e.g., send mail).
   */
  auto_advance: boolean;

  /** Adaptive difficulty modes available in this phase (e.g., autonomy, guided) */
  adaptive_modes?: Record<string, { description: string }>;

  /** Optional subphases for complex multi-step phases */
  subphases?: any[];

  /** Optional agent behavior configuration */
  agent_behavior?: any;

  /** Agent behavior overrides by adaptive mode */
  agent_behavior_by_mode?: any;
};

/**
 * A scoring criterion for a phase.
 * Each criterion contributes points and can set flags.
 */
export type CriterionDefinition = {
  /** Unique identifier */
  criterion_id: string;

  /** Human-readable description of what earns these points */
  description: string;

  /** Points awarded when this criterion is met */
  points: number;

  /** Optional flag to set when criterion is achieved */
  sets_flag?: string;
};

/**
 * Rules that determine when a phase is considered complete.
 * Supports flexible, data-driven completion logic.
 */
export type CompletionRules = {
  /**
   * Minimum score required to validate the phase.
   * Only checked if provided.
   */
  min_score?: number;

  /**
   * Phase completes if ANY of these flags are true.
   * Only checked if provided.
   */
  any_flags?: string[];

  /**
   * Phase completes if ALL of these flags are true.
   * Only checked if provided.
   */
  all_flags?: string[];

  /**
   * Maximum number of player/NPC message exchanges before auto-validation.
   * Prevents scenarios from getting stuck.
   */
  max_exchanges?: number;

  /**
   * Custom expression evaluated against session state.
   * For complex conditions not covered by standard rules.
   */
  custom?: string;
};

/**
 * Mail-specific configuration for a phase.
 * Enables per-phase mail behavior customization.
 */
export type PhaseMailConfig = {
  /** Whether mail functionality is enabled in this phase */
  enabled: boolean;

  /**
   * Identifier for this mail type (e.g., "consulate_initial", "complaint_response").
   * Used to track which mails were sent and apply conditions.
   */
  kind: string;

  /** Default email fields */
  defaults: {
    /** Default recipient email or actor ID */
    to: string;

    /** Default CC field */
    cc: string;

    /** Default subject line (can be overridden by player) */
    subject: string;
  };

  /** Whether attachments are required for this mail */
  require_attachments: boolean;

  /** Flags to set when this mail is successfully sent */
  on_send_flags: Record<string, boolean>;

  /** Button label for sending mail (e.g., "Send to Consulate") */
  send_label: string;

  /** If true, sending this mail automatically advances the phase */
  send_advances_phase: boolean;
};

/**
 * An event injected when a phase is entered.
 * Typically a message or mail from an NPC.
 */
export type PhaseEvent = {
  /** Unique identifier */
  event_id: string;

  /** Actor ID sending this event */
  actor: string;

  /** Message content */
  content: string;

  /** Channel through which event is delivered */
  channel: "chat" | "mail";

  /** Delay in milliseconds before event is delivered (0 = immediate) */
  delay_ms: number;

  /** Subject line (required for mail) */
  subject?: string;

  /** Optional attachments */
  attachments?: Array<{ id: string; label: string }>;
};

/**
 * Configuration for an interruption.
 * Interruptions are unscheduled messages triggered by specific conditions.
 */
export type InterruptionDefinition = {
  /** Unique identifier */
  interrupt_id: string;

  /** Actor ID sending the interruption */
  actor: string;

  /** Interruption message content */
  content: string;

  /** Channel through which interruption arrives */
  channel: "chat" | "mail";

  /** Condition that triggers this interruption */
  trigger: InterruptionTrigger;

  /** Subject line (required for mail) */
  subject?: string;

  /** Optional attachments */
  attachments?: Array<{ id: string; label: string }>;
};

/**
 * Trigger conditions for an interruption.
 * Supports time-based, message-count-based, and phase-based triggers.
 */
export type InterruptionTrigger = {
  /**
   * Type of trigger.
   * - "after_exchanges": triggered after N player or NPC messages
   * - "after_delay": triggered after elapsed time
   * - "on_phase_entry": triggered when phase starts
   */
  type: "after_exchanges" | "after_delay" | "on_phase_entry";

  /** Minimum number of player messages before trigger (for after_exchanges) */
  min_player_messages?: number;

  /** Minimum number of NPC messages before trigger (for after_exchanges) */
  min_npc_messages?: number;

  /** Delay in milliseconds (for after_delay) */
  delay_ms?: number;
};

// ===== ENDING TYPES =====

/**
 * Definition of a possible scenario ending.
 * Endings are evaluated in priority order until one matches.
 */
export type EndingDefinition = {
  /** Unique identifier for this ending */
  ending_id: string;

  /** Display label (e.g., "Mission Accomplished") */
  label: string;

  /** Detailed ending content (HTML allowed) */
  content: string;

  /**
   * Priority for evaluation.
   * Higher priority = checked first.
   * Allows multiple endings with different score thresholds.
   */
  priority: number;

  /** Conditions that must be met for this ending to trigger */
  conditions: EndingConditions;
};

/**
 * Conditions for triggering an ending.
 * Supports score thresholds, flag combinations, and mail-based checks.
 */
export type EndingConditions = {
  /**
   * Minimum total score required.
   * Only checked if provided.
   */
  min_score?: number;

  /**
   * Minimum number of core_flags that must be true.
   * Core flags represent fundamental mission objectives.
   */
  min_core_flags?: number;

  /** List of core flags to check against */
  core_flags?: string[];

  /**
   * Minimum number of execution_flags that must be true.
   * Execution flags represent how well the player performed.
   */
  min_execution_flags?: number;

  /** List of execution flags to check against */
  execution_flags?: string[];

  /** Minimum number of mails that must have been sent */
  min_mails_sent?: number;

  /** Specific checks on mail content or attachments */
  mail_checks?: Array<{
    /** Type of check to perform */
    type: "mail_has_body" | "mail_has_attachments";

    /** Mail kind to check (matches PhaseMailConfig.kind) */
    mail_kind: string;
  }>;
};

// ===== SESSION STATE TYPES (runtime) =====

/**
 * Role of a message sender.
 */
export type MessageRole = "player" | "npc" | "system";

/**
 * Adaptive difficulty mode.
 * Influences agent behavior and phase complexity.
 */
export type AdaptiveMode = "autonomy" | "standard" | "guided" | null;

/**
 * A single message in the chat.
 * Can originate from player, NPC, or system.
 */
export type ChatMessage = {
  /** Unique identifier */
  id: string;

  /** Who sent the message */
  role: MessageRole;

  /** If role==="npc", the actor_id of the NPC */
  actor?: string;

  /** Message text content */
  content: string;

  /** Optional message type (for styling/categorization) */
  type?: string;

  /** Which channel this message belongs to */
  channel?: string;

  /** Phase ID when message was sent (for filtering/analysis) */
  phaseId?: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;
};

/**
 * An attachment reference in a mail.
 */
export type MailAttachment = {
  /** Document ID */
  id: string;

  /** Display label */
  label: string;
};

/**
 * A mail received by the player.
 */
export type InboxMail = {
  /** Unique identifier */
  id: string;

  /** Sender actor ID or email */
  from: string;

  /** Recipient (typically the player) */
  to: string;

  /** CC field */
  cc: string;

  /** Subject line */
  subject: string;

  /** Mail body content (can include HTML) */
  body: string;

  /** Attached documents */
  attachments: MailAttachment[];

  /** Phase ID in which mail was received */
  phaseId: string;

  /** Unix timestamp in milliseconds when received */
  receivedAt: number;
};

/**
 * A mail draft being composed by the player.
 */
export type MailDraft = {
  /** Recipient email or actor ID */
  to: string;

  /** CC field */
  cc: string;

  /** Subject line */
  subject: string;

  /** Draft body content */
  body: string;

  /** Documents being attached */
  attachments: MailAttachment[];
};

/**
 * A mail that has been sent by the player.
 */
export type SentMail = {
  /** Unique identifier */
  id: string;

  /** Phase ID in which mail was sent */
  phaseId: string;

  /** Recipient */
  to: string;

  /** CC field */
  cc: string;

  /** Subject line */
  subject: string;

  /** Sent body content */
  body: string;

  /** Attachments sent with mail */
  attachments: MailAttachment[];

  /** Unix timestamp in milliseconds when sent */
  sentAt: number;

  /** Mail kind (matches PhaseMailConfig.kind) for scoring/condition checks */
  kind: string;
};

/**
 * A discrete action taken during gameplay.
 * Used to build action logs and reconstruct game state.
 */
export type SessionAction =
  | {
      type: "chat_message_sent";
      phaseId: string;
      content: string;
      channel?: string;
      timestamp: number;
    }
  | {
      type: "chat_message_received";
      phaseId: string;
      actor: string;
      content: string;
      channel?: string;
      timestamp: number;
    }
  | {
      type: "mail_received";
      phaseId: string;
      from: string;
      subject: string;
      attachmentIds: string[];
      timestamp: number;
    }
  | {
      type: "mail_sent";
      phaseId: string;
      mailId: string;
      to: string;
      cc: string;
      subject: string;
      attachmentIds: string[];
      timestamp: number;
    }
  | {
      type: "phase_completed";
      phaseId: string;
      timestamp: number;
    }
  | {
      type: "phase_entered";
      phaseId: string;
      timestamp: number;
    }
  | {
      type: "interruption_triggered";
      phaseId: string;
      eventId: string;
      timestamp: number;
    };

/**
 * An event scheduled to occur at a specific time in the future.
 */
export type TimedEvent = {
  /** Unique identifier */
  id: string;

  /** Actor ID sending the event */
  actor: string;

  /** Event content */
  content: string;

  /** Unix timestamp in milliseconds when event should fire */
  dueAt: number;

  /** Phase ID associated with event */
  phaseId: string;

  /** Type of communication */
  type: "chat" | "mail";

  /** Channel for delivery */
  channel?: string;

  /** Subject line (for mail) */
  subject?: string;

  /** Attachments (for mail) */
  attachments?: MailAttachment[];
};

/**
 * The final ending result presented to the player.
 */
export type EndingResult = {
  /** Ending ID */
  id: string;

  /** Ending label/title */
  label: string;

  /** Ending narrative content (HTML allowed) */
  content: string;
};

/**
 * Complete runtime state of an active game session.
 * Persisted to allow session resumption and scoring.
 */
export type SessionState = {
  /** The scenario definition this session is running */
  scenario: ScenarioDefinition;

  /** Current phase index in scenario.phases array */
  currentPhaseIndex: number;

  /** Score breakdown by phase ID */
  scores: Record<string, number>;

  /** Sum of all scores */
  totalScore: number;

  /** All flags set during this session */
  flags: Record<string, boolean>;

  /** Current adaptive difficulty mode */
  adaptiveMode: AdaptiveMode;

  /** All chat messages sent/received in this session */
  chatMessages: ChatMessage[];

  /** All mails received by the player */
  inboxMails: InboxMail[];

  /** All mails sent by the player */
  sentMails: SentMail[];

  /** Timeline of all actions taken */
  actionLog: SessionAction[];

  /** Phase IDs that have been completed */
  completedPhases: string[];

  /** Phase IDs that have been unlocked for access */
  unlockedPhases: string[];

  /** Whether scenario has reached an ending */
  isFinished: boolean;

  /** The ending result (null until scenario finishes) */
  ending: EndingResult | null;

  /** Whether to show the debrief screen */
  showDebrief: boolean;

  /** Interruption IDs that have already triggered (prevents duplicates) */
  triggeredInterruptions: string[];

  /** Phase entry event IDs that have been injected */
  injectedPhaseEntryEvents: string[];

  /** Timed events pending delivery */
  pendingTimedEvents: TimedEvent[];

  /** Mail drafts currently being composed (keyed by mail kind) */
  mailDrafts: Record<string, MailDraft>;
};

// ===== AUTH TYPES =====

/**
 * User role in the platform.
 * Determines permissions and UI visibility.
 */
export type UserRole = "player" | "trainer" | "admin";

/**
 * A user account.
 */
export type User = {
  /** Unique user identifier */
  id: string;

  /** Email address */
  email: string;

  /** Display name */
  name: string;

  /** Platform role */
  role: UserRole;

  /** ISO 8601 timestamp of account creation */
  createdAt: string;

  /** ISO 8601 timestamp of last login (optional) */
  lastLoginAt?: string;
};

/**
 * A completed or in-progress game session.
 * Stores summary information and final results.
 */
export type GameSession = {
  /** Unique session identifier */
  id: string;

  /** Scenario ID being played */
  scenarioId: string;

  /** Player user ID */
  userId: string;

  /** Player's name (may differ from User.name for privacy) */
  playerName: string;

  /** ISO 8601 timestamp when session started */
  startedAt: string;

  /** ISO 8601 timestamp when session finished (null if in progress) */
  finishedAt?: string;

  /** The ending result (null if session not finished) */
  ending?: EndingResult;

  /** Final scores by phase */
  scores: Record<string, number>;

  /** Total score achieved */
  totalScore: number;

  /** Flags set by end of session */
  flags: Record<string, boolean>;
};
