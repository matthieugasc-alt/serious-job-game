/**
 * getActorInfo — resolve an actor id (including the special "chosen_cto"
 * placeholder) to the display tuple (name, color, initials, status).
 *
 * Used by every component that paints an avatar or a name plate.
 * Falls back to gracefully showing the raw actor id when the actor
 * isn't found in the scenario.
 */

import { getInitials } from "./playerUtils";

export type ResolvedActorInfo = {
  name: string;
  color: string;
  initials: string;
  status: string;
};

export function getActorInfo(
  actorId: string,
  actors: any[],
  chosenCtoId: string | null,
): ResolvedActorInfo {
  // Resolve "chosen_cto" to actual CTO actor
  const resolved = actorId === "chosen_cto" && chosenCtoId ? chosenCtoId : actorId;
  const a = actors.find((x: any) => x.actor_id === resolved);
  return {
    name: a?.name || resolved,
    color: a?.avatar?.color || "#666",
    initials: a?.avatar?.initials || getInitials(a?.name || resolved),
    status: (a as any)?.contact_status || "offline",
  };
}
