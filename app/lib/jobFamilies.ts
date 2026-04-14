/**
 * JobFamily referential.
 *
 * Persistence: single JSON file at data/job-families.json.
 * Shape: { families: JobFamily[] }
 *
 * Kept deliberately simple (file-based) to match existing storage pattern
 * (data/sessions.json, data/scenario_config.json, etc.).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export interface JobFamily {
  id: string;
  label: string;
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

const FILE_PATH = join(process.cwd(), "data", "job-families.json");

function ensureFile(): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(FILE_PATH)) {
    writeFileSync(FILE_PATH, JSON.stringify({ families: [] }, null, 2), "utf-8");
  }
}

function readAll(): JobFamily[] {
  ensureFile();
  try {
    const raw = readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.families) ? parsed.families : [];
  } catch {
    return [];
  }
}

function writeAll(families: JobFamily[]): void {
  ensureFile();
  writeFileSync(
    FILE_PATH,
    JSON.stringify({ families }, null, 2),
    "utf-8",
  );
}

export function listJobFamilies(): JobFamily[] {
  return readAll().sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function getJobFamily(id: string): JobFamily | null {
  return readAll().find((f) => f.id === id) ?? null;
}

export function createJobFamily(input: { label: string; active?: boolean; order?: number }): JobFamily {
  const label = (input.label || "").trim();
  if (!label) throw new Error("Le libellé est requis");
  const families = readAll();
  if (families.some((f) => f.label.toLowerCase() === label.toLowerCase())) {
    throw new Error(`La famille "${label}" existe déjà`);
  }
  const now = new Date().toISOString();
  const family: JobFamily = {
    id: randomUUID(),
    label,
    active: input.active !== false,
    order: typeof input.order === "number" ? input.order : families.length,
    createdAt: now,
    updatedAt: now,
  };
  families.push(family);
  writeAll(families);
  return family;
}

export function updateJobFamily(
  id: string,
  updates: Partial<Pick<JobFamily, "label" | "active" | "order">>,
): JobFamily {
  const families = readAll();
  const idx = families.findIndex((f) => f.id === id);
  if (idx < 0) throw new Error("Famille introuvable");
  const next: JobFamily = { ...families[idx] };
  if (typeof updates.label === "string") {
    const label = updates.label.trim();
    if (!label) throw new Error("Le libellé ne peut être vide");
    if (
      families.some(
        (f) => f.id !== id && f.label.toLowerCase() === label.toLowerCase(),
      )
    ) {
      throw new Error(`La famille "${label}" existe déjà`);
    }
    next.label = label;
  }
  if (typeof updates.active === "boolean") next.active = updates.active;
  if (typeof updates.order === "number") next.order = updates.order;
  next.updatedAt = new Date().toISOString();
  families[idx] = next;
  writeAll(families);
  return next;
}

export function deleteJobFamily(id: string): void {
  const families = readAll();
  const next = families.filter((f) => f.id !== id);
  if (next.length === families.length) throw new Error("Famille introuvable");
  writeAll(next);
}
