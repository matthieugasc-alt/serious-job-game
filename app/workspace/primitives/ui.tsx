"use client";

/**
 * ui — primitives visuelles partagées du player v2.
 * Uniquement du rendu : aucun état métier, aucune I/O.
 * Palette : indigo (actions), gris très pâle (fonds), cartes blanches —
 * cohérente avec la home et l'admin.
 */

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ActorDef, JsonObject } from "@/app/lib/engine/mechanics";

// ─── Boutons ──────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryButton({ className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 ${className}`}
    />
  );
}

export function SecondaryButton({ className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 ${className}`}
    />
  );
}

export function DangerButton({ className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 ${className}`}
    />
  );
}

// ─── Bandeau consigne / objectif ──────────────────────────────────

/** Carte consigne stylisée (fond indigo pâle, 🎯), repliable si longue. */
export function InstructionBanner({
  text,
  label = "Consigne",
  icon = "🎯",
}: {
  text: string;
  label?: string;
  icon?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  const isLong = trimmed.length > 260 || trimmed.split("\n").length > 3;
  if (!trimmed) return null;

  return (
    <div className="shrink-0 border-b border-indigo-100 bg-indigo-50/70 px-4 py-3 sm:px-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-base leading-none">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
            {label}
          </p>
          <p
            className={`mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-indigo-950 ${
              isLong && !expanded ? "line-clamp-3" : ""
            }`}
          >
            {trimmed}
          </p>
          {isLong && (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-indigo-600 hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Voir moins" : "Voir plus"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Éléments des étapes précédentes ──────────────────────────────

export function PreviousInputs({
  inputs,
  defaultOpen = false,
}: {
  inputs: JsonObject;
  defaultOpen?: boolean;
}) {
  const entries = Object.entries(inputs);
  if (entries.length === 0) return null;
  return (
    <details
      className="rounded-xl border border-gray-200 bg-gray-50 text-sm"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none px-4 py-2.5 font-medium text-gray-700">
        📎 Éléments des étapes précédentes
      </summary>
      <div className="space-y-3 border-t border-gray-200 px-4 py-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {k}
            </p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">
              {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

// ─── Avatars acteurs ──────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
];

/** Couleur stable dérivée de l'actor_id (jamais de contenu métier ici). */
export function actorColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ActorAvatar({
  actorId,
  name,
  size = "md",
}: {
  actorId: string;
  name: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${dim} ${actorColor(actorId)}`}
    >
      {initialsOf(name)}
    </div>
  );
}

/** En-tête interlocuteur (avatar + nom + rôle) pour les toolbars. */
export function ActorIdentity({ actor }: { actor: ActorDef }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ActorAvatar actorId={actor.actor_id} name={actor.name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{actor.name}</p>
        <p className="truncate text-xs text-gray-500">{actor.role}</p>
      </div>
    </div>
  );
}

// ─── Petits éléments ──────────────────────────────────────────────

/** Compteur / jauge (« 2/3 messages min. ») en pastille. */
export function CounterChip({
  done,
  children,
}: {
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        done ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {done ? "✓" : null}
      {children}
    </span>
  );
}

/** Message d'erreur inline standardisé. */
export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
      {children}
    </p>
  );
}
