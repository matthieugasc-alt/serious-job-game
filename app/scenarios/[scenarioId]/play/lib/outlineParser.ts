/**
 * Mind-map / outline parser used by the notes view.
 * Pure, no React. Extracted from page.tsx.
 */

export type OutlineItem = { id: string; text: string; depth: number };

let _outlineIdCounter = 0;
export function mkOutlineId(): string {
  return `ol_${++_outlineIdCounter}_${Date.now()}`;
}

/** Parse raw textarea text into structured outline items.
 *  Recognises indentation via: leading spaces/tabs, bullet chars (•◦▪▸‣·-*), numbered prefixes.
 *  Each 2 spaces or 1 tab = 1 depth level. */
export function parseOutlineText(raw: string): OutlineItem[] {
  if (!raw.trim()) return [];
  const lines = raw.split("\n");
  const items: OutlineItem[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const leadMatch = line.match(/^([\t ]*)/);
    const leadStr = leadMatch ? leadMatch[1] : "";
    const tabCount = (leadStr.match(/\t/g) || []).length;
    const spaceCount = (leadStr.replace(/\t/g, "").length);
    let depth = tabCount + Math.floor(spaceCount / 2);
    let text = line.slice(leadStr.length);
    text = text.replace(/^(?:[•◦▪▫▸‣·\-\*]|\d+[.)]\s?)\s*/, "").trim();
    if (!text) continue;
    depth = Math.min(depth, 5);
    items.push({ id: mkOutlineId(), text, depth });
  }
  return items;
}

export function outlineToText(items: OutlineItem[]): string {
  const bullets = ["•", "  ◦", "    ▪", "      ▸", "        ‣", "          ·"];
  return items
    .filter((i) => i.text.trim())
    .map((i) => {
      const prefix = bullets[Math.min(i.depth, bullets.length - 1)];
      return `${prefix} ${i.text.trim()}`;
    })
    .join("\n");
}
