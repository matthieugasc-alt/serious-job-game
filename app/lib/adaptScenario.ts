type RawScenario = any;

export type UiPhase = {
  id: string;
  title: string;
  objective: string;
  introMessage: string;
  playerPrompt: string;
  documents: string[];
  sourceMessages: string[];
};

export function adaptPhaseForUI(
  scenario: RawScenario,
  phaseIndex: number
): UiPhase {
  const phase = scenario.phases[phaseIndex];

  const documents = phase.documents ?? [];

  let sourceMessages: string[] = [];

  if (phase.phase_id === "phase_1_comprehension") {
    sourceMessages = [
      "Romain, tenemos un problema. En el mostrador de facturación en Madrid, la aerolínea nos informó que la visa Schengen de nuestro colega Jorge Huamán Quispe vence hoy a medianoche. La aerolínea aceptó embarcarlo, pero nos advirtió que la policía de fronteras en Burdeos podría rechazarlo porque la fecha de salida del territorio supera la validez de su visa. Los otros dos pasaportes están en regla. ¿Qué hacemos? Aterrizamos en 1h40."
    ];
  }

  if (phase.system_messages?.length) {
    sourceMessages = [
      ...sourceMessages,
      ...phase.system_messages.map((msg: any) => msg.content),
    ];
  }

  if (phase.subphases?.length) {
    const subphasePrompts = phase.subphases
      .map((sub: any) => sub.prompt)
      .filter(Boolean);

    sourceMessages = [...sourceMessages, ...subphasePrompts];
  }

  return {
    id: phase.phase_id ?? "",
    title: phase.title ?? "",
    objective: phase.objective ?? "",
    introMessage: phase.intro_message ?? "",
    playerPrompt:
      phase.player_prompt ??
      phase.player_inputs?.[0]?.label ??
      "Réponds à cette situation.",
    documents,
    sourceMessages,
  };
}