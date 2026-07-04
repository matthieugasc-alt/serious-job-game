"use client";

/**
 * RegistryBoard — moteur Registry : schéma de champs configurables +
 * entrées structurées (registre des décisions/risques/hypothèses…).
 * Table éditable inline, champs typés (texte/nombre/date/utilisateur/
 * select coloré). Jamais un tableur générique : schéma piloté par le preset.
 */

import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { addItem, boardItemsOf, removeItem, updateItem } from "../api";
import type { Board } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

type Field =
  | { id: string; label: string; type: "text" | "number" | "date" | "user" }
  | { id: string; label: string; type: "select"; options: { value: string; label: string; color?: string }[] };

function fieldsOf(board: Board): Field[] {
  const f = (board.config as JsonObject).fields;
  if (!Array.isArray(f)) return [];
  return f
    .filter((x): x is JsonObject => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    .map((x): Field => {
      const id = String(x.id ?? "");
      const label = String(x.label ?? "");
      const type = String(x.type ?? "text");
      if (type === "select") {
        const options = Array.isArray(x.options)
          ? x.options
              .filter((o): o is JsonObject => Boolean(o) && typeof o === "object" && !Array.isArray(o))
              .map((o) => ({ value: String(o.value ?? ""), label: String(o.label ?? ""), color: typeof o.color === "string" ? o.color : undefined }))
          : [];
        return { id, label, type: "select", options };
      }
      return { id, label, type: (["number", "date", "user"].includes(type) ? type : "text") as "text" | "number" | "date" | "user" };
    })
    .filter((f) => f.id.length > 0);
}

export function RegistryBoard({ board, dispatch }: { board: Board; dispatch: Dispatch }) {
  const fields = fieldsOf(board);
  const items = boardItemsOf(board);

  const setField = (itemId: string, fieldId: string, value: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    dispatch(updateItem(board.id, itemId, { fields: { ...item.fields, [fieldId]: value } }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700">{board.title || "Registre"} · {items.length} entrée(s)</h3>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700"
          onClick={() => dispatch(addItem(board.id, { label: "", fields: {} }))}
        >
          + Entrée
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {fields.map((f) => (
                <th key={f.id} className="border-b border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600">{f.label}</th>
              ))}
              <th className="w-8 border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={fields.length + 1} className="px-2 py-4 text-center text-gray-400">Aucune entrée. Ajoutez-en une.</td></tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="group border-b border-gray-100 last:border-0">
                  {fields.map((f) => {
                    const raw = it.fields[f.id];
                    const value = raw === null || raw === undefined ? "" : String(raw);
                    if (f.type === "select") {
                      const opt = f.options.find((o) => o.value === value);
                      return (
                        <td key={f.id} className="px-1 py-1" style={{ backgroundColor: opt?.color ? `${opt.color}44` : undefined }}>
                          <select value={value} onChange={(e) => setField(it.id, f.id, e.target.value)} className="w-full bg-transparent text-xs text-gray-800 focus:outline-none">
                            <option value="">—</option>
                            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                      );
                    }
                    return (
                      <td key={f.id} className="px-1 py-1">
                        <input
                          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          value={value}
                          onChange={(e) => setField(it.id, f.id, e.target.value)}
                          className="w-full min-w-[80px] bg-transparent text-xs text-gray-800 focus:outline-none"
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 text-center">
                    <button type="button" title="Retirer" className="text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100" onClick={() => dispatch(removeItem(board.id, it.id))}>✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
