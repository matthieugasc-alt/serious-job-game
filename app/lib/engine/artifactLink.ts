/**
 * artifactLink.ts — schéma d'URL interne des artefacts joints à un mail.
 *
 * Un artefact attaché s'insère dans le corps du mail comme un lien
 * markdown `[📎 Titre](artifact://<tool>/<id>?kind=<kind>)`. Le rendu du
 * mail intercepte le scheme `artifact:` pour ouvrir l'artefact vivant
 * in-app au lieu de suivre un lien web.
 *
 * Couche moteur (pur, aucun React) : importable à la fois par le reducer
 * (qui insère le lien dans le brouillon) et par l'UI (qui le parse au
 * rendu). Ni l'un ni l'autre n'a besoin de connaître les Tools.
 */

import type { ArtifactKind, ArtifactRef } from "./workspace";

/** URL interne d'un artefact : artifact://<tool>/<id>?kind=<kind> */
export function buildArtifactHref(ref: Pick<ArtifactRef, "tool" | "id" | "kind">): string {
  return `artifact://${encodeURIComponent(ref.tool)}/${encodeURIComponent(ref.id)}?kind=${ref.kind}`;
}

/** Lien markdown prêt à insérer dans le corps du mail. */
export function artifactLinkMarkdown(ref: ArtifactRef): string {
  return `[📎 ${ref.title}](${buildArtifactHref(ref)})`;
}

export interface ParsedArtifactHref {
  tool: string;
  id: string;
  kind: ArtifactKind;
}

const VALID_KINDS: ReadonlySet<string> = new Set([
  "note",
  "mindmap",
  "decision",
  "board",
  "whiteboard",
]);

/** Reconnaît et décompose une URL `artifact://…`, sinon null. */
export function parseArtifactHref(href: string): ParsedArtifactHref | null {
  if (!href.startsWith("artifact://")) return null;
  const rest = href.slice("artifact://".length);
  const [path, query = ""] = rest.split("?");
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  const tool = decodeURIComponent(path.slice(0, slash));
  const id = decodeURIComponent(path.slice(slash + 1));
  if (!tool || !id) return null;
  const kindParam = new URLSearchParams(query).get("kind") ?? "";
  const kind = (VALID_KINDS.has(kindParam) ? kindParam : "note") as ArtifactKind;
  return { tool, id, kind };
}
