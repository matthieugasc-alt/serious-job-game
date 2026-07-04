"use client";

/**
 * DocumentsApp — HÔTE du Gestionnaire Documentaire Universel
 * (docs/TOOL_GESTIONNAIRE_DOC.md §1). L'app « Documents » du dock est une
 * simple coquille qui monte BibliothequeApp : le joueur ne voit qu'une
 * seule app, mais bénéficie du dossier documentaire complet (bibliothèque
 * personnelle, lecteur augmenté, dossiers/tags, recherche, comparaison).
 *
 * L'auto-indexation des documents du scénario, le fenêtrage et toutes les
 * ops vivent dans le Tool (via son API publique) — l'hôte n'a AUCUNE
 * logique documentaire.
 */

import { BibliothequeApp } from "@/app/workspace/tools/bibliotheque/BibliothequeApp";
import type { WorkspaceAppProps } from "../types";

export function DocumentsApp(props: WorkspaceAppProps) {
  return <BibliothequeApp {...props} />;
}
