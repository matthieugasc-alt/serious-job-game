/** Formats d'affichage partagés par les apps (aucune logique métier). */

/** Heure courte si aujourd'hui, sinon date courte. */
export function fmtWhen(at: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
