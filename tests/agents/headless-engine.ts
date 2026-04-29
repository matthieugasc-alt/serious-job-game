/**
 * Headless Game Engine
 *
 * Replicates the core session/phase/mail logic from page.tsx
 * without any React dependency. Agents interact via API calls.
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ──

export interface ChatMessage {
  role: "player" | "npc" | "system";
  actor: string;
  content: string;
  type?: string;
  phaseId?: string;
  toActor?: string;
  timestamp?: number;
}

export interface Mail {
  id: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  body: string;
  attachments?: { id: string; label: string }[];
  phaseId?: string;
  sentAt?: number;
  receivedAt?: number;
  kind?: string;
}

export interface SessionState {
  currentPhaseIndex: number;
  chatMessages: ChatMessage[];
  inboxMails: Mail[];
  sentMails: Mail[];
  scores: Record<string, number>;
  flags: Record<string, boolean>;
  injectedPhaseEntryEvents: string[];
  startedAt: number;
}

export interface PhaseConfig {
  phase_id: string;
  title: string;
  objective: string;
  phase_focus?: string;
  ai_actors: string[];
  active_channels: string[];
  mail_config?: {
    enabled: boolean;
    kind?: string;
    defaults?: { to: string; cc: string; subject: string };
    on_send_flags?: Record<string, boolean>;
    send_advances_phase?: boolean;
    send_label?: string;
  };
  completion_rules?: {
    any_flags?: string[];
    min_score?: number;
  };
  auto_advance?: boolean;
  next_phase?: string;
  entry_events?: any[];
  interruptions?: any[];
  competencies?: string[];
  player_input?: { type: string; prompt: string };
  dynamic_entry_mail?: { actor: string; subject: string; source_mail_kind: string };
}

export interface ScenarioDefinition {
  scenario_id: string;
  meta: { title: string; [k: string]: any };
  narrative: { context: string; mission: string; initial_situation: string; [k: string]: any };
  actors: any[];
  phases: PhaseConfig[];
  endings?: any[];
  resources?: { documents?: { doc_id: string; label: string; content?: string; available_from_phase?: string | null; [k: string]: any }[] };
}

export interface ApiConfig {
  baseUrl: string;
  authToken: string;
}

// ── Headless Engine ──

export class HeadlessEngine {
  scenario: ScenarioDefinition;
  session: SessionState;
  api: ApiConfig;
  prompts: Record<string, string> = {};
  playerName: string;
  log: string[] = [];
  errors: string[] = [];
  warnings: string[] = [];

  constructor(scenario: ScenarioDefinition, api: ApiConfig, playerName: string) {
    this.scenario = scenario;
    this.api = api;
    this.playerName = playerName;
    this.session = {
      currentPhaseIndex: 0,
      chatMessages: [],
      inboxMails: [],
      sentMails: [],
      scores: {},
      flags: {},
      injectedPhaseEntryEvents: [],
      startedAt: Date.now(),
    };
  }

  // ── Scenario loading ──

  static loadScenario(scenarioId: string): ScenarioDefinition {
    const scenarioDir = path.join(process.cwd(), "scenarios", scenarioId);
    const jsonPath = path.join(scenarioDir, "scenario.json");
    if (!fs.existsSync(jsonPath)) throw new Error(`Scenario not found: ${jsonPath}`);
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  }

  async loadPrompts(): Promise<void> {
    const scenarioDir = path.join(process.cwd(), "scenarios", this.scenario.scenario_id, "prompts");
    if (!fs.existsSync(scenarioDir)) return;
    const files = fs.readdirSync(scenarioDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const actorId = file.replace(".md", "");
      this.prompts[actorId] = fs.readFileSync(path.join(scenarioDir, file), "utf-8");
    }
  }

  // ── Phase helpers ──

  get currentPhase(): PhaseConfig {
    return this.scenario.phases[this.session.currentPhaseIndex];
  }

  get currentPhaseId(): string {
    return this.currentPhase?.phase_id || "unknown";
  }

  get isFinished(): boolean {
    return this.session.currentPhaseIndex >= this.scenario.phases.length;
  }

  // ── Entry events injection ──

  injectEntryEvents(): void {
    const phase = this.currentPhase;
    if (!phase) return;

    const events = phase.entry_events || [];
    for (const event of events) {
      const eventId = event.event_id || event.id || `${phase.phase_id}::${event.content?.slice(0, 20)}`;
      const key = `${phase.phase_id}::${eventId}`;
      if (this.session.injectedPhaseEntryEvents.includes(key)) continue;
      this.session.injectedPhaseEntryEvents.push(key);

      const actor = event.actor || "system";
      const content = event.content || "";
      const isMail = event.type === "mail" || event.channel === "mail" || !!event.subject;

      if (isMail) {
        this.session.inboxMails.push({
          id: `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          from: actor,
          subject: event.subject || "Message",
          body: content,
          attachments: event.attachments || [],
          phaseId: phase.phase_id,
          receivedAt: Date.now(),
        });
        this.addLog(`📧 Mail reçu de ${actor}: "${event.subject || content.slice(0, 40)}..."`);
      } else if (content.trim()) {
        this.session.chatMessages.push({
          role: "npc",
          actor,
          content,
          type: "entry_event",
          phaseId: phase.phase_id,
          timestamp: Date.now(),
        });
        this.addLog(`💬 Message d'entrée de ${actor}: "${content.slice(0, 60)}..."`);
      }
    }
  }

  // ── Chat with AI actor ──

  async sendChat(actorId: string, message: string): Promise<string> {
    const phase = this.currentPhase;
    if (!phase) {
      this.addError("Impossible d'envoyer un message: aucune phase active");
      return "";
    }

    // Check if actor is in current phase
    if (!phase.ai_actors.includes(actorId)) {
      this.addWarning(`Agent essaie de parler à ${actorId} mais il n'est pas dans la phase ${phase.phase_id} (acteurs: ${phase.ai_actors.join(", ")})`);
    }

    // Check if chat is an active channel
    if (!phase.active_channels.includes("chat")) {
      this.addWarning(`Agent essaie de chatter mais le chat n'est pas actif en phase ${phase.phase_id}`);
    }

    // Add player message to history
    this.session.chatMessages.push({
      role: "player",
      actor: "player",
      content: message,
      toActor: actorId,
      phaseId: phase.phase_id,
      timestamp: Date.now(),
    });

    // Build conversation history for API
    const recentConv = this.session.chatMessages
      .filter(m => m.role !== "system" && (m.actor === actorId || m.toActor === actorId || m.role === "player"))
      .slice(-10)
      .map(m => ({
        role: m.role === "player" ? "user" : "assistant",
        content: m.content,
      }));

    const prompt = this.prompts[actorId] || "";

    try {
      const res = await fetch(`${this.api.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.api.authToken}`,
        },
        body: JSON.stringify({
          playerName: this.playerName,
          message,
          phaseTitle: phase.title,
          phaseObjective: phase.objective,
          phaseFocus: phase.phase_focus || "",
          phasePrompt: phase.player_input?.prompt || "",
          criteria: phase.competencies || [],
          mode: "standard",
          narrative: this.scenario.narrative,
          recentConversation: recentConv.slice(0, -1), // exclude the just-added player msg
          playerMessages: [message],
          roleplayPrompt: prompt,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.addError(`API /chat ${res.status}: ${errText.slice(0, 200)}`);
        return `[ERROR ${res.status}]`;
      }

      const data = await res.json();
      const reply = data.reply || "[pas de réponse]";

      // Add AI reply to history
      this.session.chatMessages.push({
        role: "npc",
        actor: actorId,
        content: reply,
        phaseId: phase.phase_id,
        timestamp: Date.now(),
      });

      // Apply evaluation
      if (data.score_delta && data.score_delta > 0) {
        this.session.scores[phase.phase_id] = (this.session.scores[phase.phase_id] || 0) + data.score_delta;
      }
      if (data.flags_to_set) {
        Object.assign(this.session.flags, data.flags_to_set);
      }

      this.addLog(`💬 → ${actorId}: "${message.slice(0, 50)}..." → "${reply.slice(0, 50)}..."`);
      return reply;
    } catch (err: any) {
      this.addError(`Chat fetch failed: ${err.message}`);
      return `[FETCH ERROR: ${err.message}]`;
    }
  }

  // ── Send mail ──

  async sendMail(to: string, subject: string, body: string, attachments: { id: string; label: string }[] = []): Promise<{ advanced: boolean }> {
    const phase = this.currentPhase;
    if (!phase) {
      this.addError("Impossible d'envoyer un mail: aucune phase active");
      return { advanced: false };
    }

    if (!phase.active_channels.includes("mail")) {
      this.addWarning(`Agent essaie d'envoyer un mail mais le mail n'est pas actif en phase ${phase.phase_id}`);
    }

    const mail: Mail = {
      id: `sent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      from: "player",
      to,
      subject,
      body,
      attachments,
      phaseId: phase.phase_id,
      kind: phase.mail_config?.kind,
      sentAt: Date.now(),
    };

    this.session.sentMails.push(mail);

    // Apply on_send_flags
    if (phase.mail_config?.on_send_flags) {
      Object.assign(this.session.flags, phase.mail_config.on_send_flags);
    }

    this.addLog(`📤 Mail envoyé à ${to}: "${subject}" (${body.length} chars)`);

    // Check if mail advances phase
    let advanced = false;
    if (phase.mail_config?.send_advances_phase) {
      if (body.trim().length < 20) {
        this.addWarning("Mail trop court pour avancer la phase (< 20 chars)");
      } else {
        advanced = this.tryAdvancePhase();
      }
    }

    return { advanced };
  }

  // ── Phase advancement ──

  tryAdvancePhase(): boolean {
    const phase = this.currentPhase;
    if (!phase) return false;

    // Check completion rules
    const rules = phase.completion_rules;
    if (rules) {
      if (rules.any_flags) {
        const hasFlagMet = rules.any_flags.some(f => this.session.flags[f]);
        if (!hasFlagMet) {
          this.addLog(`⏸️ Phase ${phase.phase_id}: flags requis non atteints (${rules.any_flags.join(", ")})`);
          return false;
        }
      }
      if (rules.min_score !== undefined) {
        const score = this.session.scores[phase.phase_id] || 0;
        if (score < rules.min_score) {
          this.addLog(`⏸️ Phase ${phase.phase_id}: score insuffisant (${score} < ${rules.min_score})`);
          return false;
        }
      }
    }

    // Advance
    const prevPhaseId = phase.phase_id;
    this.session.currentPhaseIndex++;

    if (this.isFinished) {
      this.addLog(`🏁 Scénario terminé après phase ${prevPhaseId}`);
      return true;
    }

    const nextPhase = this.currentPhase;
    this.addLog(`➡️ Phase avancée: ${prevPhaseId} → ${nextPhase.phase_id} (${nextPhase.title})`);

    // Inject entry events for new phase
    this.injectEntryEvents();

    return true;
  }

  // ── Debrief ──

  async generateDebrief(): Promise<any> {
    try {
      const res = await fetch(`${this.api.baseUrl}/api/debrief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.api.authToken}`,
        },
        body: JSON.stringify({
          playerName: this.playerName,
          scenarioTitle: this.scenario.meta.title,
          phases: this.scenario.phases,
          conversation: this.session.chatMessages,
          sentMails: this.session.sentMails,
          inboxMails: this.session.inboxMails,
          endings: this.scenario.endings || [],
          defaultEnding: null,
        }),
      });

      if (!res.ok) {
        this.addError(`API /debrief ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return null;
      }

      const data = await res.json();
      this.addLog(`📊 Debrief généré: ${data.ending} — score moyen: ${data.phases?.map((p: any) => p.phase_score).join(", ")}`);
      return data;
    } catch (err: any) {
      this.addError(`Debrief fetch failed: ${err.message}`);
      return null;
    }
  }

  // ── Logging ──

  addLog(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    this.log.push(`[${ts}] ${msg}`);
  }

  addError(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    this.errors.push(`[${ts}] ❌ ${msg}`);
    this.log.push(`[${ts}] ❌ ERROR: ${msg}`);
  }

  addWarning(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    this.warnings.push(`[${ts}] ⚠️ ${msg}`);
    this.log.push(`[${ts}] ⚠️ WARNING: ${msg}`);
  }

  // ── Summary ──

  getSummary(): {
    playerName: string;
    scenarioId: string;
    phasesReached: number;
    totalPhases: number;
    finalPhase: string;
    finished: boolean;
    totalMessages: number;
    totalMailsSent: number;
    totalMailsReceived: number;
    scores: Record<string, number>;
    flags: Record<string, boolean>;
    errors: string[];
    warnings: string[];
    durationMs: number;
  } {
    return {
      playerName: this.playerName,
      scenarioId: this.scenario.scenario_id,
      phasesReached: this.session.currentPhaseIndex + 1,
      totalPhases: this.scenario.phases.length,
      finalPhase: this.currentPhase?.phase_id || "FINISHED",
      finished: this.isFinished,
      totalMessages: this.session.chatMessages.filter(m => m.role === "player").length,
      totalMailsSent: this.session.sentMails.length,
      totalMailsReceived: this.session.inboxMails.length,
      scores: this.session.scores,
      flags: this.session.flags,
      errors: this.errors,
      warnings: this.warnings,
      durationMs: Date.now() - this.session.startedAt,
    };
  }
}
