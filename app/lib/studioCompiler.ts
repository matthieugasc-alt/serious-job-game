/**
 * Studio Compiler & Validator
 *
 * Transforms editorial data (StudioScenario, StudioPhase, etc.) into the runtime
 * JSON format (ScenarioDefinition) used by the simulation engine.
 *
 * The editorial model is UI-friendly and simplified; the compiler produces
 * the full, validated runtime format.
 */

// ============================================================================
// EDITORIAL DATA MODEL (UI-friendly, simplified)
// ============================================================================

export interface StudioCompetency {
  name: string;
  description: string;
}

export interface StudioIntroCard {
  title: string;
  content: string;
  column: number;
}

export interface StudioActor {
  id: string;
  name: string;
  role: string;
  personality?: string;
  avatarColor: string;
  avatarInitials: string;
  channels: string[]; // channel IDs
  controlledBy: "player" | "ai" | "system";
  promptContent?: string; // actual prompt text (not file path)
  visibleInContacts: boolean;
  contactStatus?: string;
  contactPreview?: string;
}

export interface StudioCriterion {
  id: string;
  description: string;
  points: number;
  setsFlag?: string;
}

export interface StudioCompletionRules {
  minScore?: number;
  anyFlags?: string[];
  allFlags?: string[];
  maxExchanges?: number;
  custom?: Record<string, any>;
}

export interface StudioMailConfig {
  enabled: boolean;
  [key: string]: any;
}

export interface StudioEntryEvent {
  type: string;
  actor: string;
  channel: string;
  content: string;
  delay_ms?: number;
  subject?: string;
  to?: string;
}

export interface StudioInterruption {
  trigger?: string;
  message: string;
  [key: string]: any;
}

export interface StudioPhase {
  id: string;
  title: string;
  objective: string;
  activeChannels: string[]; // channel IDs
  aiActors: string[]; // actor IDs
  criteria: StudioCriterion[];
  completionRules: StudioCompletionRules;
  autoAdvance: boolean;
  nextPhase?: string;
  introMessage?: string;
  durationHintMin?: number;
  interactionMode?: string;
  mailConfig?: StudioMailConfig;
  entryEvents?: StudioEntryEvent[];
  interruptions?: StudioInterruption[];
}

export interface StudioDocument {
  id: string;
  label: string;
  contains?: string[]; // list of what document contains
  usableAsAttachment: boolean;
  filePath?: string;
  imagePath?: string;
  content?: string;
}

export interface StudioEndingConditions {
  min_score?: number;
  min_core_flags?: number;
  core_flags?: string[];
  min_execution_flags?: number;
  execution_flags?: string[];
  min_mails_sent?: number;
  mail_checks?: Record<string, any>;
}

export interface StudioEnding {
  id: string;
  label: string;
  content: string;
  priority: number;
  conditions: StudioEndingConditions;
}

export interface StudioScenario {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  jobFamily: string;
  difficulty: "easy" | "medium" | "hard";
  durationMin: number;
  tags?: string[];
  locale: string;
  context: string;
  mission: string;
  initialSituation: string;
  trigger: string;
  backgroundFact?: string;
  scenarioStart: string; // ISO date
  simSpeedMultiplier: number;
  pedagogicalGoals: string[];
  competencies?: StudioCompetency[];
  introCards?: StudioIntroCard[];
  actors: StudioActor[];
  channels?: { channel_id: string; type: string; label: string; enabled: boolean }[];
  documents?: StudioDocument[];
  phases: StudioPhase[];
  endings: StudioEnding[];
  defaultEndingId: string;
  thumbnail?: string;
}

// ============================================================================
// RUNTIME DATA MODEL (matches ScenarioDefinition from runtime)
// ============================================================================

export interface RuntimeMeta {
  title: string;
  subtitle: string;
  description: string;
  job_family: string;
  difficulty: string;
  estimated_duration_min: number;
  pedagogical_goals: string[];
  tags?: string[];
  competencies?: StudioCompetency[];
  thumbnail?: string;
}

export interface RuntimeNarrative {
  context: string;
  mission: string;
  initial_situation: string;
  trigger: string;
  background_fact?: string;
}

export interface RuntimeTimeline {
  scenario_start: string;
  sim_speed_multiplier: number;
  [key: string]: any;
}

export interface RuntimeIntroCard {
  title: string;
  content: string;
  column: number;
}

export interface RuntimeIntroduction {
  header: {
    tag: string;
    title: string;
    subtitle: string;
  };
  cards: RuntimeIntroCard[];
}

export interface RuntimeActorAvatar {
  color: string;
  initials: string;
}

export interface RuntimeActor {
  actor_id: string;
  name: string;
  role: string;
  personality?: string;
  avatar: RuntimeActorAvatar;
  interaction_channels: string[];
  controlled_by: "player" | "ai" | "system";
  prompt_file?: string;
  visible_in_contacts: boolean;
  contact_status?: string;
  contact_preview?: string;
}

export interface RuntimeChannel {
  channel_id: string;
  type: "chat" | "mail" | "phone" | "sms" | "visio";
  label: string;
  enabled: boolean;
}

export interface RuntimeDocument {
  doc_id: string;
  label: string;
  contains?: string[];
  usable_as_attachment: boolean;
  file_path?: string;
  image_path?: string;
  content?: string;
}

export interface RuntimeResources {
  documents: RuntimeDocument[];
}

export interface RuntimeScoringCriterion {
  criterion_id: string;
  description: string;
  points: number;
  sets_flag?: string;
}

export interface RuntimeScoring {
  max_score?: number;
  criteria: RuntimeScoringCriterion[];
}

export interface RuntimeCompletionRules {
  min_score?: number;
  any_flags?: string[];
  all_flags?: string[];
  max_exchanges?: number;
  custom?: Record<string, any>;
}

export interface RuntimePhase {
  phase_id: string;
  title: string;
  objective: string;
  active_channels: string[];
  ai_actors: string[];
  scoring: RuntimeScoring;
  completion_rules: RuntimeCompletionRules;
  auto_advance: boolean;
  next_phase?: string;
  intro_message?: string;
  duration_hint_min?: number;
  player_input?: { type: string; prompt: string };
  on_complete?: { set_flags: Record<string, any> };
  mail_config?: Record<string, any>;
  entry_events?: RuntimeEntryEvent[];
  interruptions?: RuntimeInterruption[];
  time_jump_minutes?: number;
  silent_advance?: boolean;
  auto_advance_at?: string;
  interaction_mode?: string;
}

export interface RuntimeEntryEvent {
  type: string;
  actor: string;
  channel: string;
  content: string;
  delay_ms?: number;
  subject?: string;
  to?: string;
}

export interface RuntimeInterruption {
  trigger?: string;
  message: string;
  [key: string]: any;
}

export interface RuntimeEndingConditions {
  min_score?: number;
  min_core_flags?: number;
  core_flags?: string[];
  min_execution_flags?: number;
  execution_flags?: string[];
  min_mails_sent?: number;
  mail_checks?: Record<string, any>;
}

export interface RuntimeEnding {
  ending_id: string;
  label: string;
  content: string;
  priority: number;
  conditions: RuntimeEndingConditions;
}

export interface RuntimeState {
  flags: Record<string, any>;
}

export interface RuntimeScenarioDefinition {
  scenario_id: string;
  version: string;
  locale: string;
  meta: RuntimeMeta;
  narrative: RuntimeNarrative;
  timeline: RuntimeTimeline;
  introduction: RuntimeIntroduction;
  actors: RuntimeActor[];
  channels: RuntimeChannel[];
  resources: RuntimeResources;
  constraints: Record<string, any>;
  state: RuntimeState;
  initial_events: RuntimeEntryEvent[];
  phases: RuntimePhase[];
  endings: RuntimeEnding[];
  default_ending: {
    ending_id: string;
    label: string;
    content: string;
  };
}

// ============================================================================
// COMPILATION & VALIDATION RESULTS
// ============================================================================

export interface CompiledResult {
  success: boolean;
  data?: RuntimeScenarioDefinition;
  errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert a title to kebab-case scenario ID
 */
function generateScenarioId(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Collect all flag references from phases and endings
 */
function collectAllFlags(
  phases: StudioPhase[],
  endings: StudioEnding[]
): Set<string> {
  const flags = new Set<string>();

  // From phases
  for (const phase of phases) {
    for (const criterion of phase.criteria) {
      if (criterion.setsFlag) {
        flags.add(criterion.setsFlag);
      }
    }
    if (phase.completionRules.anyFlags) {
      phase.completionRules.anyFlags.forEach((f) => flags.add(f));
    }
    if (phase.completionRules.allFlags) {
      phase.completionRules.allFlags.forEach((f) => flags.add(f));
    }
  }

  // From endings
  for (const ending of endings) {
    if (ending.conditions.core_flags) {
      ending.conditions.core_flags.forEach((f) => flags.add(f));
    }
    if (ending.conditions.execution_flags) {
      ending.conditions.execution_flags.forEach((f) => flags.add(f));
    }
  }

  return flags;
}

/**
 * Ensure player and chat channel exist
 */
function ensureDefaultActorAndChannel(
  actors: StudioActor[],
  channels: { channel_id: string; type: string; label: string; enabled: boolean }[]
): {
  actors: StudioActor[];
  channels: { channel_id: string; type: string; label: string; enabled: boolean }[];
} {
  // Check for player actor
  let hasPlayer = actors.some((a) => a.id === "player");
  if (!hasPlayer) {
    actors.push({
      id: "player",
      name: "Player",
      role: "Player",
      avatarColor: "#000000",
      avatarInitials: "P",
      channels: ["chat"],
      controlledBy: "player",
      visibleInContacts: false,
    });
  }

  // Check for chat channel
  let hasChat = channels.some((c) => c.channel_id === "chat");
  if (!hasChat) {
    channels.push({
      channel_id: "chat",
      type: "chat",
      label: "Chat",
      enabled: true,
    });
  }

  return { actors, channels };
}

// ============================================================================
// MAIN COMPILER FUNCTION
// ============================================================================

export function compileScenario(studio: StudioScenario): CompiledResult {
  try {
    const scenarioId = studio.id || generateScenarioId(studio.title);
    const version = "1.0.0";
    const locale = studio.locale || "en";

    // Ensure defaults exist
    let actors = [...studio.actors];
    let channels = studio.channels ? [...studio.channels] : [];
    const { actors: actorsWithDefaults, channels: channelsWithDefaults } =
      ensureDefaultActorAndChannel(actors, channels);

    const documents = studio.documents || [];
    const phases = studio.phases || [];
    const endings = studio.endings || [];

    // Build meta
    const meta: RuntimeMeta = {
      title: studio.title,
      subtitle: studio.subtitle,
      description: studio.description,
      job_family: studio.jobFamily,
      difficulty: studio.difficulty,
      estimated_duration_min: studio.durationMin,
      pedagogical_goals: studio.pedagogicalGoals,
    };

    if (studio.tags && studio.tags.length > 0) {
      meta.tags = studio.tags;
    }

    if (studio.competencies && studio.competencies.length > 0) {
      meta.competencies = studio.competencies;
    }

    if (studio.thumbnail) {
      meta.thumbnail = studio.thumbnail;
    }

    // Build narrative
    const narrative: RuntimeNarrative = {
      context: studio.context,
      mission: studio.mission,
      initial_situation: studio.initialSituation,
      trigger: studio.trigger,
    };

    if (studio.backgroundFact) {
      narrative.background_fact = studio.backgroundFact;
    }

    // Build timeline
    const timeline: RuntimeTimeline = {
      scenario_start: studio.scenarioStart,
      sim_speed_multiplier: studio.simSpeedMultiplier,
    };

    // Build introduction
    const introductionCards = studio.introCards || [
      {
        title: "Context",
        content: studio.context,
        column: 1,
      },
      {
        title: "Your Mission",
        content: studio.mission,
        column: 2,
      },
    ];

    const introduction: RuntimeIntroduction = {
      header: {
        tag: studio.jobFamily,
        title: studio.title,
        subtitle: studio.subtitle,
      },
      cards: introductionCards,
    };

    // Build actors with avatar structure
    const runtimeActors: RuntimeActor[] = actorsWithDefaults.map((actor) => ({
      actor_id: actor.id,
      name: actor.name,
      role: actor.role,
      ...(actor.personality && { personality: actor.personality }),
      avatar: {
        color: actor.avatarColor,
        initials: actor.avatarInitials,
      },
      interaction_channels: actor.channels,
      controlled_by: actor.controlledBy,
      ...(actor.promptContent && { prompt_file: `${actor.id}.md` }),
      visible_in_contacts: actor.visibleInContacts,
      ...(actor.contactStatus && { contact_status: actor.contactStatus }),
      ...(actor.contactPreview && { contact_preview: actor.contactPreview }),
    }));

    // Build channels
    const runtimeChannels: RuntimeChannel[] = channelsWithDefaults.map(
      (channel) => ({
        channel_id: channel.channel_id,
        type: channel.type as "chat" | "mail" | "phone" | "sms" | "visio",
        label: channel.label,
        enabled: channel.enabled,
      })
    );

    // Build resources
    const runtimeDocuments: RuntimeDocument[] = documents.map((doc) => ({
      doc_id: doc.id,
      label: doc.label,
      ...(doc.contains && { contains: doc.contains }),
      usable_as_attachment: doc.usableAsAttachment,
      ...(doc.filePath && { file_path: doc.filePath }),
      ...(doc.imagePath && { image_path: doc.imagePath }),
      ...(doc.content && { content: doc.content }),
    }));

    const resources: RuntimeResources = {
      documents: runtimeDocuments,
    };

    // Build constraints (empty by default)
    const constraints: Record<string, any> = {};

    // Collect all flags for state
    const allFlags = collectAllFlags(phases, endings);
    const state: RuntimeState = {
      flags: Array.from(allFlags).reduce(
        (acc, flag) => {
          acc[flag] = false;
          return acc;
        },
        {} as Record<string, any>
      ),
    };

    // Build initial_events (from first phase or empty)
    const initialEvents: RuntimeEntryEvent[] = [];
    if (phases.length > 0 && phases[0].entryEvents) {
      initialEvents.push(...phases[0].entryEvents);
    }

    // Build phases with automatic chaining
    const runtimePhases: RuntimePhase[] = phases.map((phase, index) => {
      const nextPhase = phase.nextPhase || (index === phases.length - 1 ? "finish" : phases[index + 1]?.id);

      const phaseScoring: RuntimeScoring = {
        criteria: phase.criteria.map((c) => ({
          criterion_id: c.id,
          description: c.description,
          points: c.points,
          ...(c.setsFlag && { sets_flag: c.setsFlag }),
        })),
      };

      // Calculate max_score if not set
      const maxScore = phase.criteria.reduce((sum, c) => sum + c.points, 0);
      if (maxScore > 0) {
        phaseScoring.max_score = maxScore;
      }

      const runtimePhase: RuntimePhase = {
        phase_id: phase.id,
        title: phase.title,
        objective: phase.objective,
        active_channels: phase.activeChannels,
        ai_actors: phase.aiActors,
        scoring: phaseScoring,
        completion_rules: phase.completionRules,
        auto_advance: phase.autoAdvance,
        ...(nextPhase && { next_phase: nextPhase }),
        ...(phase.introMessage && { intro_message: phase.introMessage }),
        ...(phase.durationHintMin && { duration_hint_min: phase.durationHintMin }),
        ...(phase.interactionMode && { interaction_mode: phase.interactionMode }),
        ...(phase.mailConfig && { mail_config: phase.mailConfig }),
        ...(phase.entryEvents && { entry_events: phase.entryEvents }),
        ...(phase.interruptions && { interruptions: phase.interruptions }),
      };

      return runtimePhase;
    });

    // Build endings
    const runtimeEndings: RuntimeEnding[] = endings.map((ending) => ({
      ending_id: ending.id,
      label: ending.label,
      content: ending.content,
      priority: ending.priority,
      conditions: ending.conditions,
    }));

    // Get default ending
    const defaultEnding = endings.find((e) => e.id === studio.defaultEndingId);
    if (!defaultEnding) {
      return {
        success: false,
        errors: [`Default ending with ID "${studio.defaultEndingId}" not found`],
      };
    }

    const runtimeDefaultEnding = {
      ending_id: defaultEnding.id,
      label: defaultEnding.label,
      content: defaultEnding.content,
    };

    // Assemble final compiled definition
    const compiled: RuntimeScenarioDefinition = {
      scenario_id: scenarioId,
      version,
      locale,
      meta,
      narrative,
      timeline,
      introduction,
      actors: runtimeActors,
      channels: runtimeChannels,
      resources,
      constraints,
      state,
      initial_events: initialEvents,
      phases: runtimePhases,
      endings: runtimeEndings,
      default_ending: runtimeDefaultEnding,
    };

    return {
      success: true,
      data: compiled,
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        error instanceof Error ? error.message : "Unknown compilation error",
      ],
    };
  }
}

// ============================================================================
// VALIDATOR FUNCTION
// ============================================================================

export function validateScenario(compiled: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type guard
  if (!compiled || typeof compiled !== "object") {
    return {
      valid: false,
      errors: ["Compiled scenario must be a non-null object"],
      warnings: [],
    };
  }

  // Required root fields
  const requiredRootFields = [
    "scenario_id",
    "version",
    "locale",
    "meta",
    "narrative",
    "timeline",
    "introduction",
    "actors",
    "channels",
    "resources",
    "constraints",
    "state",
    "initial_events",
    "phases",
    "endings",
    "default_ending",
  ];

  for (const field of requiredRootFields) {
    if (!(field in compiled)) {
      errors.push(`Missing required root field: ${field}`);
    }
  }

  // Validate meta
  if (compiled.meta) {
    const metaFields = [
      "title",
      "subtitle",
      "description",
      "job_family",
      "difficulty",
      "estimated_duration_min",
      "pedagogical_goals",
    ];
    for (const field of metaFields) {
      if (!(field in compiled.meta)) {
        errors.push(`Missing required meta field: ${field}`);
      } else if (field === "pedagogical_goals" && !Array.isArray(compiled.meta[field])) {
        errors.push(`meta.${field} must be an array`);
      } else if (field !== "pedagogical_goals" && field !== "estimated_duration_min" && !compiled.meta[field]) {
        errors.push(`meta.${field} cannot be empty`);
      }
    }
  }

  // Validate narrative
  if (compiled.narrative) {
    const narrativeFields = ["context", "mission", "initial_situation", "trigger"];
    for (const field of narrativeFields) {
      if (!(field in compiled.narrative)) {
        errors.push(`Missing required narrative field: ${field}`);
      } else if (!compiled.narrative[field]) {
        errors.push(`narrative.${field} cannot be empty`);
      }
    }
  }

  // Validate timeline
  if (compiled.timeline) {
    if (!("scenario_start" in compiled.timeline)) {
      errors.push("Missing required timeline field: scenario_start");
    } else if (!compiled.timeline.scenario_start) {
      errors.push("timeline.scenario_start cannot be empty");
    }
    if (!("sim_speed_multiplier" in compiled.timeline)) {
      errors.push("Missing required timeline field: sim_speed_multiplier");
    } else if (typeof compiled.timeline.sim_speed_multiplier !== "number") {
      errors.push("timeline.sim_speed_multiplier must be a number");
    }
  }

  // Validate introduction
  if (compiled.introduction) {
    if (!compiled.introduction.header) {
      errors.push("Missing introduction.header");
    } else {
      const headerFields = ["tag", "title", "subtitle"];
      for (const field of headerFields) {
        if (!(field in compiled.introduction.header)) {
          errors.push(`Missing introduction.header.${field}`);
        } else if (!compiled.introduction.header[field]) {
          errors.push(`introduction.header.${field} cannot be empty`);
        }
      }
    }
    if (!Array.isArray(compiled.introduction.cards)) {
      errors.push("introduction.cards must be an array");
    }
  }

  // Collect actor IDs and channel IDs
  const actorIds = new Set<string>();
  const actorIdArray: string[] = [];
  if (Array.isArray(compiled.actors)) {
    for (const actor of compiled.actors) {
      if (!actor.actor_id) {
        errors.push("Actor missing actor_id");
      } else {
        if (actorIds.has(actor.actor_id)) {
          errors.push(`Duplicate actor_id: ${actor.actor_id}`);
        }
        actorIds.add(actor.actor_id);
        actorIdArray.push(actor.actor_id);
      }

      const actorFields = [
        "name",
        "role",
        "avatar",
        "interaction_channels",
        "controlled_by",
        "visible_in_contacts",
      ];
      for (const field of actorFields) {
        if (!(field in actor)) {
          errors.push(`Actor ${actor.actor_id} missing field: ${field}`);
        }
      }

      if (actor.avatar) {
        if (!("color" in actor.avatar) || !("initials" in actor.avatar)) {
          errors.push(`Actor ${actor.actor_id} avatar missing color or initials`);
        }
      }

      if (!Array.isArray(actor.interaction_channels)) {
        errors.push(`Actor ${actor.actor_id} interaction_channels must be an array`);
      }
    }
  } else {
    errors.push("actors must be an array");
  }

  const channelIds = new Set<string>();
  const channelIdArray: string[] = [];
  if (Array.isArray(compiled.channels)) {
    for (const channel of compiled.channels) {
      if (!channel.channel_id) {
        errors.push("Channel missing channel_id");
      } else {
        if (channelIds.has(channel.channel_id)) {
          errors.push(`Duplicate channel_id: ${channel.channel_id}`);
        }
        channelIds.add(channel.channel_id);
        channelIdArray.push(channel.channel_id);
      }

      const channelFields = ["type", "label", "enabled"];
      for (const field of channelFields) {
        if (!(field in channel)) {
          errors.push(`Channel ${channel.channel_id} missing field: ${field}`);
        }
      }

      if (
        channel.type &&
        !["chat", "mail", "phone", "sms", "visio"].includes(channel.type)
      ) {
        errors.push(
          `Channel ${channel.channel_id} type must be one of: chat, mail, phone, sms, visio`
        );
      }
    }
  } else {
    errors.push("channels must be an array");
  }

  // Validate resources
  if (compiled.resources) {
    if (!Array.isArray(compiled.resources.documents)) {
      errors.push("resources.documents must be an array");
    }
  }

  // Validate phases
  const phaseIds = new Set<string>();
  if (!Array.isArray(compiled.phases)) {
    errors.push("phases must be an array");
  } else {
    if (compiled.phases.length === 0) {
      errors.push("At least one phase is required");
    }

    for (const phase of compiled.phases) {
      if (!phase.phase_id) {
        errors.push("Phase missing phase_id");
      } else {
        if (phaseIds.has(phase.phase_id)) {
          errors.push(`Duplicate phase_id: ${phase.phase_id}`);
        }
        phaseIds.add(phase.phase_id);
      }

      const phaseFields = [
        "title",
        "objective",
        "active_channels",
        "ai_actors",
        "scoring",
        "completion_rules",
        "auto_advance",
      ];
      for (const field of phaseFields) {
        if (!(field in phase)) {
          errors.push(`Phase ${phase.phase_id} missing field: ${field}`);
        }
      }

      // Validate active_channels references
      if (Array.isArray(phase.active_channels)) {
        for (const channelId of phase.active_channels) {
          if (!channelIds.has(channelId)) {
            errors.push(
              `Phase ${phase.phase_id} references unknown channel_id: ${channelId}`
            );
          }
        }
      }

      // Validate ai_actors references
      if (Array.isArray(phase.ai_actors)) {
        for (const actorId of phase.ai_actors) {
          if (!actorIds.has(actorId)) {
            errors.push(
              `Phase ${phase.phase_id} references unknown actor_id: ${actorId}`
            );
          }
        }
      }

      // Validate next_phase reference
      if (phase.next_phase && phase.next_phase !== "finish") {
        if (!phaseIds.has(phase.next_phase)) {
          warnings.push(
            `Phase ${phase.phase_id} references unknown next_phase: ${phase.next_phase}`
          );
        }
      }

      // Validate scoring
      if (phase.scoring && Array.isArray(phase.scoring.criteria)) {
        const criteriaIds = new Set<string>();
        for (const criterion of phase.scoring.criteria) {
          if (!criterion.criterion_id) {
            errors.push(
              `Phase ${phase.phase_id} criterion missing criterion_id`
            );
          } else if (criteriaIds.has(criterion.criterion_id)) {
            errors.push(
              `Phase ${phase.phase_id} duplicate criterion_id: ${criterion.criterion_id}`
            );
          } else {
            criteriaIds.add(criterion.criterion_id);
          }

          if (!criterion.description || !("points" in criterion)) {
            errors.push(
              `Phase ${phase.phase_id} criterion ${criterion.criterion_id} missing description or points`
            );
          }
        }
      }
    }
  }

  // Validate endings
  if (!Array.isArray(compiled.endings)) {
    errors.push("endings must be an array");
  } else {
    if (compiled.endings.length === 0) {
      errors.push("At least one ending is required");
    }

    const endingIds = new Set<string>();
    for (const ending of compiled.endings) {
      if (!ending.ending_id) {
        errors.push("Ending missing ending_id");
      } else if (endingIds.has(ending.ending_id)) {
        errors.push(`Duplicate ending_id: ${ending.ending_id}`);
      } else {
        endingIds.add(ending.ending_id);
      }

      const endingFields = ["label", "content", "priority", "conditions"];
      for (const field of endingFields) {
        if (!(field in ending)) {
          errors.push(`Ending ${ending.ending_id} missing field: ${field}`);
        }
      }
    }
  }

  // Validate default_ending
  if (!compiled.default_ending) {
    errors.push("Missing default_ending");
  } else {
    if (!compiled.default_ending.ending_id) {
      errors.push("default_ending missing ending_id");
    } else if (!phaseIds.has(compiled.default_ending.ending_id)) {
      // Note: Check against endings, not phases
      const endingExists = compiled.endings?.some(
        (e: any) => e.ending_id === compiled.default_ending.ending_id
      );
      if (!endingExists) {
        errors.push(
          `default_ending references unknown ending_id: ${compiled.default_ending.ending_id}`
        );
      }
    }

    if (!("label" in compiled.default_ending)) {
      errors.push("default_ending missing label");
    }
    if (!("content" in compiled.default_ending)) {
      errors.push("default_ending missing content");
    }
  }

  // Validate state
  if (!compiled.state || typeof compiled.state !== "object") {
    errors.push("state must be an object");
  } else if (!("flags" in compiled.state)) {
    errors.push("state missing flags");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// All types and functions are exported at their declaration sites above.
