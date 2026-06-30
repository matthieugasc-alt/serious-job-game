/**
 * Player-wide pure helpers extracted from page.tsx.
 *
 * Zero React, zero side effects beyond playNotificationSound which is
 * client-side audio. Safe to import from any component or hook.
 */

export function cloneSession(prev: any) {
  return {
    ...prev,
    chatMessages: [...prev.chatMessages],
    inboxMails: [...prev.inboxMails],
    sentMails: [...prev.sentMails],
    actionLog: [...prev.actionLog],
    scores: { ...prev.scores },
    flags: { ...prev.flags },
    completedPhases: [...prev.completedPhases],
    unlockedPhases: [...prev.unlockedPhases],
    triggeredInterruptions: [...prev.triggeredInterruptions],
    injectedPhaseEntryEvents: [...prev.injectedPhaseEntryEvents],
    pendingTimedEvents: prev.pendingTimedEvents.map((e: any) => ({ ...e })),
    mailDrafts: JSON.parse(JSON.stringify(prev.mailDrafts || {})),
  };
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {}
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const STATUS_COLORS: Record<string, string> = {
  available: "#44b553",
  busy: "#e94b3c",
  away: "#f5a623",
  offline: "#999",
};
