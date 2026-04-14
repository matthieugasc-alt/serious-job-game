/**
 * setByPath — apply a list of dot/bracket path assignments to a deeply-cloned
 * copy of an object. Used by the Assistant Dock "fill" mode to persist the
 * user's cherry-picked field proposals without touching unrelated parts of
 * the scenario.
 *
 * Supported paths:
 *   "context"
 *   "phases[0].objective"
 *   "phases[2].criteria[0].description"
 *   "actors[3].personality"
 *
 * If a segment doesn't exist, the function creates the intermediate container
 * (object or array as appropriate). Array out-of-bounds indices are refused
 * by default to avoid silently growing arrays — set allowGrow=true to permit.
 *
 * Returns a NEW object (structured clone). Never mutates the input.
 */

export interface Assignment {
  path: string;
  value: unknown;
}

interface Segment {
  key: string | number;
  isIndex: boolean;
}

function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  // Split on "." but also on "[n]" bracket accessors
  // Pattern: either a.b.c or a[0] or a[0].b
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) {
      segments.push({ key: m[1], isIndex: false });
    } else if (m[2] !== undefined) {
      segments.push({ key: Number(m[2]), isIndex: true });
    }
  }
  return segments;
}

function deepClone<T>(x: T): T {
  // structuredClone is available in Node 18+ and modern browsers.
  if (typeof structuredClone === 'function') return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

export interface SetByPathOptions {
  allowGrow?: boolean;
}

export interface SetByPathReport {
  applied: string[];
  skipped: { path: string; reason: string }[];
}

export function applyAssignments<T extends object>(
  root: T,
  assignments: Assignment[],
  opts: SetByPathOptions = {},
): { result: T; report: SetByPathReport } {
  const clone = deepClone(root);
  const report: SetByPathReport = { applied: [], skipped: [] };

  for (const { path, value } of assignments) {
    const segments = parsePath(path);
    if (segments.length === 0) {
      report.skipped.push({ path, reason: 'path vide' });
      continue;
    }

    try {
      let cursor: any = clone;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        const next = segments[i + 1];
        const existing = cursor[seg.key as any];
        if (existing === undefined || existing === null) {
          cursor[seg.key as any] = next.isIndex ? [] : {};
        }
        if (Array.isArray(cursor)) {
          const idx = seg.key as number;
          if (idx >= cursor.length && !opts.allowGrow) {
            throw new Error(`index ${idx} hors bornes (${cursor.length})`);
          }
        }
        cursor = cursor[seg.key as any];
      }
      const last = segments[segments.length - 1];
      if (Array.isArray(cursor)) {
        const idx = last.key as number;
        if (idx >= cursor.length && !opts.allowGrow) {
          throw new Error(`index ${idx} hors bornes (${cursor.length})`);
        }
      }
      cursor[last.key as any] = value;
      report.applied.push(path);
    } catch (e: any) {
      report.skipped.push({ path, reason: e?.message || 'échec' });
    }
  }

  return { result: clone, report };
}
