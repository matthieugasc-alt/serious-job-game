"use client";

/**
 * DependencyPanel — panneau « Dépendances » d'un objet (décision OU
 * tableau). Affiche mères / filles / sœurs, une zone de dépôt (glisser un
 * objet depuis la palette = en faire une FILLE), et une palette des autres
 * objets. Clic droit sur un objet de la palette → menu (fille ou sœur).
 * Tout passe par l'API publique (addDependency/removeDependency).
 */

import { useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import type { DepNodeRef } from "../spec";
import { addDependency, labelOfNode, listBoards, listDecisions, removeDependency, selectDependenciesFor } from "../api";

const MIME = "application/dep-node";
type Dispatch = (a: WorkspaceAction) => void;
const iconFor = (t: DepNodeRef["type"]) => (t === "decision" ? "🧭" : "📊");

function Chip({ icon, label, tone, onRemove }: { icon: string; label: string; tone: string; onRemove: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      <span aria-hidden>{icon}</span>
      <span className="max-w-[140px] truncate">{label}</span>
      <button type="button" aria-label="Retirer le lien" className="opacity-50 transition hover:opacity-100" onClick={onRemove}>✕</button>
    </span>
  );
}

export function DependencyPanel({
  state,
  node,
  dispatch,
  restrictTo,
  title = "Dépendances",
}: {
  state: Json;
  node: DepNodeRef;
  dispatch: Dispatch;
  /** Ne lier qu'à ce type d'objet (ex. décision↔décision). */
  restrictTo?: "decision" | "board";
  title?: string;
}) {
  const raw = selectDependenciesFor(state, node);
  const keep = (x: { ref: DepNodeRef }) => !restrictTo || x.ref.type === restrictTo;
  const parents = raw.parents.filter(keep);
  const children = raw.children.filter(keep);
  const siblings = raw.siblings.filter(keep);
  const others: DepNodeRef[] = [
    ...(restrictTo === "board" ? [] : listDecisions(state).map((d) => ({ type: "decision" as const, id: d.id }))),
    ...(restrictTo === "decision" ? [] : listBoards(state).map((b) => ({ type: "board" as const, id: b.id }))),
  ].filter((o) => !(o.type === node.type && o.id === node.id));

  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<DepNodeRef | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q ? others.filter((o) => labelOfNode(state, o).toLowerCase().includes(q)) : others;

  const linkChild = (ref: DepNodeRef) => { dispatch(addDependency(node, ref, "parent-child")); setMenu(null); };
  const linkSibling = (ref: DepNodeRef) => { dispatch(addDependency(node, ref, "sibling")); setMenu(null); };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const raw = e.dataTransfer.getData(MIME);
    if (!raw) return;
    try {
      const ref = JSON.parse(raw) as DepNodeRef;
      if (ref?.type && ref?.id) linkChild(ref);
    } catch {
      /* payload invalide — ignoré */
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span aria-hidden>🔗</span>
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
      </div>

      {menu && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1.5">
          <span className="text-[11px] text-indigo-800">Lier « {labelOfNode(state, menu)} » :</span>
          <button type="button" className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm hover:text-indigo-700" onClick={() => linkChild(menu)}>↳ En faire une fille</button>
          <button type="button" className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm hover:text-indigo-700" onClick={() => linkSibling(menu)}>↔ Lier comme sœur</button>
          <button type="button" className="ml-auto text-[11px] text-indigo-400 hover:text-indigo-700" onClick={() => setMenu(null)}>Annuler</button>
        </div>
      )}

      <div className="space-y-1.5">
        {parents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Mères</span>
            {parents.map((p) => (
              <Chip key={p.dep.id} icon={iconFor(p.ref.type)} label={labelOfNode(state, p.ref)} tone="bg-violet-50 text-violet-700" onRemove={() => dispatch(removeDependency(p.dep.id))} />
            ))}
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex flex-wrap items-center gap-1 rounded-lg border border-dashed p-1.5 transition ${over ? "border-indigo-400 bg-indigo-50/60" : "border-gray-200"}`}
        >
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Filles</span>
          {children.map((c) => (
            <Chip key={c.dep.id} icon={iconFor(c.ref.type)} label={labelOfNode(state, c.ref)} tone="bg-emerald-50 text-emerald-700" onRemove={() => dispatch(removeDependency(c.dep.id))} />
          ))}
          {children.length === 0 && <span className="text-[10px] text-gray-400">déposez un objet ici pour en faire une fille</span>}
        </div>

        {siblings.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Sœurs</span>
            {siblings.map((sib) => (
              <Chip key={sib.dep.id} icon={iconFor(sib.ref.type)} label={labelOfNode(state, sib.ref)} tone="bg-sky-50 text-sky-700" onRemove={() => dispatch(removeDependency(sib.dep.id))} />
            ))}
          </div>
        )}
      </div>

      {/* Palette : objets à glisser (→ fille) ou clic droit (→ menu). */}
      {others.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-[10px] text-gray-400">Glissez un objet dans « Filles », ou clic droit pour choisir le lien.</p>
            {others.length > 6 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer…"
                className="ml-auto w-28 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {filtered.length === 0 && <span className="text-[10px] text-gray-400">Aucun objet ne correspond.</span>}
            {filtered.map((o) => (
              <span
                key={`${o.type}:${o.id}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify(o)); e.dataTransfer.effectAllowed = "link"; }}
                onContextMenu={(e) => { e.preventDefault(); setMenu(o); }}
                title="Glisser vers « Filles » — ou clic droit"
                className="inline-flex cursor-grab items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 transition hover:border-indigo-300 active:cursor-grabbing"
              >
                <span aria-hidden>{iconFor(o.type)}</span>
                <span className="max-w-[140px] truncate">{labelOfNode(state, o)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
