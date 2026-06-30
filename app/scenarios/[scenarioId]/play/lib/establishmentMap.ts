/**
 * Establishment mapping shared across S3 (clinical pilot) and S4 (V1 rollout).
 * Extracted from page.tsx for reuse outside the player.
 */

export const ESTABLISHMENT_MAP: Record<string, { name: string; email: string; label: string }> = {
  chose_chu: { name: "Dr. Pierre Lemaire", email: "p.lemaire@chu-bordeaux.fr", label: "le CHU de Bordeaux" },
  chose_saint_martin: { name: "Laurent Castex", email: "l.castex@hp-saintmartin.fr", label: "l'Hôpital Saint-Martin" },
  chose_clinique: { name: "Dr. Claire Renaud-Picard", email: "c.renaud-picard@clinique-saint-augustin.fr", label: "la Clinique Saint-Augustin" },
};

export function resolveEstablishment(
  flags: Record<string, any>,
): { name: string; email: string; label: string } {
  const key = flags.chose_chu
    ? "chose_chu"
    : flags.chose_saint_martin
      ? "chose_saint_martin"
      : "chose_clinique";
  return ESTABLISHMENT_MAP[key];
}

/** Replace {{establishment_email}} and {{establishment_name}} placeholders in mail_config defaults */
export function resolveMailPlaceholders(mailConfig: any, flags: Record<string, any>): void {
  if (!mailConfig?.defaults) return;
  const est = resolveEstablishment(flags);
  if (mailConfig.defaults.to?.includes("{{establishment_email}}")) {
    mailConfig.defaults.to = est.email;
  }
  if (mailConfig.defaults.subject?.includes("{{establishment_name}}")) {
    mailConfig.defaults.subject = mailConfig.defaults.subject.replace("{{establishment_name}}", est.label);
  }
}
