"use client";

/**
 * WorkspaceShell — layout du poste de travail v3 (contrat §1).
 * Rail d'apps (badges non-lus), zone principale = app active, panneau
 * latéral droit pour un Tool épinglé, ChatDock (bulles de chat
 * flottantes, masquées quand Messages est ouvert), Toasts (haut-droite).
 * AUCUNE logique métier : il reçoit l'état, monte les apps du registre
 * et transmet chaque action au moteur via `dispatch`.
 * Garde-fous : ≤ 250 lignes, imports sur liste blanche
 * (workspace.gardefou.test.ts).
 */

import { useEffect, useState } from "react";
import type { ActorDef, DocumentDef } from "@/app/lib/engine/mechanics";
import type {
  StepToolConfig,
  WorkspaceAction,
  WorkspaceState,
} from "@/app/lib/engine/workspace";
import { APP_ORDER, APP_REGISTRY, TOOL_REGISTRY, type AppNavContext } from "./apps/registry";
import { ChatDock } from "./ChatDock";
import { QuickPanel } from "./tools/bloc-notes/QuickPanel";
import { Toasts } from "./Toasts";
import { useAppShortcuts } from "./useAppShortcuts";

interface Props {
  workspace: WorkspaceState;
  actors: ActorDef[];
  documents: DocumentDef[];
  /** Tools activés par le step courant (ouvrables dans le panneau droit). */
  activeTools: StepToolConfig[];
  missionTitle: string;
  /** Objectif du jour — bandeau discret, vocabulaire métier uniquement. */
  objective?: string;
  /** Échéance (ms epoch) du timer_elapsed du step courant, dérivée de
   *  stepStartedAt par le player — le shell ne fait qu'afficher. */
  timerDeadline?: number;
  /** Fils où un interlocuteur est en train d'écrire (indicateur de frappe). */
  busyThreads?: string[];
  /** Sortie EXPLICITE de la mission (le retour arrière ne quitte jamais). */
  onQuit?: () => void;
  dispatch: (action: WorkspaceAction) => void;
}

export function WorkspaceShell({
  workspace,
  actors,
  documents,
  activeTools,
  missionTitle,
  objective,
  timerDeadline,
  busyThreads,
  onQuit,
  dispatch,
}: Props) {
  const [activeApp, setActiveApp] = useState<string>(APP_ORDER[0]);
  const [appContext, setAppContext] = useState<AppNavContext | undefined>(undefined);
  const [pinnedTool, setPinnedTool] = useState<string | null>(null);
  /** Fils ouverts en mini-fenêtre ChatDock — état ici pour que Toasts
   *  puisse supprimer les notifications du fil déjà sous les yeux. */
  const [openChatThreads, setOpenChatThreads] = useState<string[]>([]);
  /** Chrono discret (chantier D) : simple tick d'affichage — le moteur
   *  reste seul maître du temps (clock_tick du player). */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (timerDeadline === undefined) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timerDeadline]);
  const timerLeft =
    timerDeadline === undefined
      ? null
      : Math.max(0, Math.ceil((timerDeadline - nowMs) / 1000));

  const openApp = (appId: string, context?: AppNavContext) => {
    if (!APP_REGISTRY[appId]) return;
    setActiveApp(appId);
    setAppContext(context);
  };
  useAppShortcuts(APP_ORDER, openApp);

  const app = APP_REGISTRY[activeApp] ?? APP_REGISTRY[APP_ORDER[0]];
  const tools = activeTools
    .map((t) => ({ config: t.config ?? {}, def: TOOL_REGISTRY[t.tool] }))
    .filter((t) => Boolean(t.def));
  const pinned = tools.find((t) => t.def.id === pinnedTool) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-100 text-gray-900">
      {/* Bandeau très discret : mission + objectif du jour. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <p className="shrink-0 truncate text-sm font-semibold text-gray-900">{missionTitle}</p>
        {objective && (
          <>
            <span aria-hidden className="text-gray-300">·</span>
            <p className="min-w-0 truncate text-xs text-gray-500" title={objective}>
              <span aria-hidden>🎯 </span>
              {objective}
            </p>
          </>
        )}
        {timerLeft !== null && (
          <span
            title="Temps restant"
            className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-xs font-medium tabular-nums ${
              timerLeft <= 30 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            <span aria-hidden>⏱</span>
            {Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, "0")}
          </span>
        )}
        {onQuit && (
          <button
            type="button"
            title="Quitter la mission"
            className={`${timerLeft !== null ? "ml-1" : "ml-auto"} shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition hover:border-red-300 hover:text-red-600`}
            onClick={onQuit}
          >
            Quitter
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Rail latéral : apps puis tools du moment. */}
        <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-3">
          {APP_ORDER.map((id, i) => {
            const a = APP_REGISTRY[id];
            if (!a) return null;
            const badge = a.badge(workspace);
            const active = id === activeApp;
            return (
              <button
                key={id}
                type="button"
                title={`${a.title} (⌘⌥${i + 1})`}
                aria-pressed={active}
                className={`relative flex w-16 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
                onClick={() => openApp(id)}
              >
                <span aria-hidden className="text-xl leading-none">{a.icon}</span>
                <span className="text-[10px] font-medium">{a.title}</span>
                <span aria-hidden className="text-[8px] leading-none text-gray-400">⌘⌥{i + 1}</span>
                {badge > 0 && (
                  <span key={badge} className="rail-badge-pop absolute right-1.5 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            );
          })}
          {tools.length > 0 && <div aria-hidden className="my-2 h-px w-9 bg-gray-200" />}
          {tools.map(({ def }) => {
            const active = pinnedTool === def.id;
            return (
              <button
                key={def.id}
                type="button"
                title={def.title}
                aria-pressed={active}
                className={`flex w-16 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
                onClick={() => setPinnedTool(active ? null : def.id)}
              >
                <span aria-hidden className="text-xl leading-none">{def.icon}</span>
                <span className="text-[10px] font-medium">{def.title}</span>
              </button>
            );
          })}
        </nav>

        {/* App active. */}
        <main className="min-w-0 flex-1 bg-white">
          <app.Component
            workspace={workspace}
            actors={actors}
            documents={documents}
            dispatch={dispatch}
            busyThreads={busyThreads}
            openApp={openApp}
            context={activeApp === app.id ? appContext : undefined}
          />
        </main>

        {/* Panneau latéral droit : Tool épinglé (jamais plein écran). */}
        {pinned && (
          <aside className="flex w-[380px] shrink-0 flex-col border-l border-gray-200 bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span aria-hidden>{pinned.def.icon}</span>
                {pinned.def.title}
              </p>
              <button
                type="button"
                aria-label={`Fermer ${pinned.def.title}`}
                className="rounded-md px-1.5 py-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                onClick={() => setPinnedTool(null)}
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <pinned.def.Component
                state={workspace.toolStates[pinned.def.id] ?? pinned.def.initialState(pinned.config)}
                config={pinned.config}
                dispatch={dispatch}
              />
            </div>
          </aside>
        )}
      </div>

      {/* ChatDock : bulles de chat flottantes — masqué quand Messages est ouvert. */}
      {activeApp !== "messages" && (
        <ChatDock
          workspace={workspace}
          actors={actors}
          busyThreads={busyThreads}
          openIds={openChatThreads}
          onOpenIdsChange={setOpenChatThreads}
          dispatch={dispatch}
        />
      )}

      {/* QuickPanel bloc-notes : icône flottante + panneau latéral par-dessus
          l'app active (jamais démontée) — pattern ChatDock. */}
      <QuickPanel workspace={workspace} activeApp={activeApp} openApp={openApp} dispatch={dispatch} />

      {/* Toasts — haut-droite sous le bandeau, jamais pour le contenu déjà visible. */}
      <Toasts
        notifications={workspace.notifications}
        activeApp={activeApp}
        openChatThreads={activeApp === "messages" ? [] : openChatThreads}
        openApp={openApp}
        dispatch={dispatch}
      />
    </div>
  );
}
