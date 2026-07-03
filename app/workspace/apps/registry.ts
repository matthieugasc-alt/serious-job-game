/**
 * APP_REGISTRY — registre des apps du poste de travail (contrat §1).
 * Une app = un dossier autonome. Le shell ne monte QUE ce qui est ici.
 * Le garde-fou workspace.gardefou.test.ts vérifie la complétude.
 */

import type { WorkspaceApp } from "./types";
import { MessagesApp } from "./messages/MessagesApp";
import { MailApp } from "./mail/MailApp";
import { DocumentsApp } from "./documents/DocumentsApp";
import { NotesApp } from "./notes/NotesApp";

export const APP_REGISTRY: Record<string, WorkspaceApp> = {
  messages: {
    id: "messages",
    title: "Messages",
    icon: "💬",
    badge: (ws) => Object.values(ws.threads).reduce((n, t) => n + t.unread, 0),
    Component: MessagesApp,
  },
  mail: {
    id: "mail",
    title: "Mail",
    icon: "📧",
    badge: (ws) => ws.mailbox.inbox.filter((m) => !m.read).length,
    Component: MailApp,
  },
  documents: {
    id: "documents",
    title: "Documents",
    icon: "📁",
    badge: (ws) => Object.values(ws.documents).filter((d) => !d.opened).length,
    Component: DocumentsApp,
  },
  notes: {
    id: "notes",
    title: "Notes",
    icon: "📝",
    badge: () => 0,
    Component: NotesApp,
  },
};

/** Ordre d'affichage dans le rail latéral. */
export const APP_ORDER = ["messages", "mail", "documents", "notes"] as const;

// Le shell n'importe QUE ce module (liste blanche du garde-fou) :
// on ré-exporte donc ici les tools et les types dont il a besoin.
export { TOOL_REGISTRY } from "../tools/registry";
export type { WorkspaceTool, ToolComponentProps } from "../tools/types";
export type { WorkspaceApp, WorkspaceAppProps, AppNavContext, WorkspaceDispatch } from "./types";
