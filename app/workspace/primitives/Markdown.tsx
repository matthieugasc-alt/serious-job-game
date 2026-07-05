"use client";

/**
 * Markdown — rendu markdown typographié pour les documents de scénario.
 * react-markdown + remark-gfm (tableaux, listes de tâches), styles
 * Tailwind mappés composant par composant (pas de plugin typography).
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseArtifactHref, type ParsedArtifactHref } from "@/app/lib/engine/artifactLink";

export function Markdown({
  children,
  onArtifactClick,
}: {
  children: string;
  /** Intercepte les liens `artifact://…` (artefacts joints à un mail). */
  onArtifactClick?: (ref: ParsedArtifactHref) => void;
}) {
  return (
    <div className="text-sm leading-relaxed text-gray-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              className="mb-3 mt-5 border-b border-gray-200 pb-2 text-lg font-bold text-gray-900 first:mt-0"
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              className="mb-2 mt-5 text-base font-bold text-gray-900 first:mt-0"
              {...props}
            />
          ),
          h3: (props) => (
            <h3
              className="mb-1.5 mt-4 text-sm font-semibold text-gray-900 first:mt-0"
              {...props}
            />
          ),
          h4: (props) => (
            <h4
              className="mb-1 mt-3 text-sm font-semibold text-gray-800 first:mt-0"
              {...props}
            />
          ),
          p: (props) => <p className="my-2" {...props} />,
          ul: (props) => (
            <ul className="my-2 list-disc space-y-1 pl-5" {...props} />
          ),
          ol: (props) => (
            <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />
          ),
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => (
            <strong className="font-semibold text-gray-900" {...props} />
          ),
          em: (props) => <em className="italic" {...props} />,
          a: ({ href, children, ...props }) => {
            const artifact = href ? parseArtifactHref(href) : null;
            if (artifact) {
              return (
                <button
                  type="button"
                  onClick={() => onArtifactClick?.(artifact)}
                  className="inline items-center rounded font-medium text-amber-700 underline decoration-dotted underline-offset-2 transition hover:text-amber-900"
                  title="Ouvrir l'artefact joint"
                >
                  {children}
                </button>
              );
            }
            return (
              <a
                href={href}
                className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
                target="_blank"
                rel="noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },
          blockquote: (props) => (
            <blockquote
              className="my-2 border-l-4 border-indigo-200 pl-3 italic text-gray-600"
              {...props}
            />
          ),
          code: (props) => (
            <code
              className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-gray-800"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="my-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-gray-100"
              {...props}
            />
          ),
          hr: () => <hr className="my-4 border-gray-200" />,
          table: (props) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          thead: (props) => <thead className="bg-gray-100" {...props} />,
          th: (props) => (
            <th
              className="border-b border-gray-300 px-2.5 py-1.5 text-left font-semibold text-gray-900"
              {...props}
            />
          ),
          td: (props) => (
            <td
              className="border-b border-gray-100 px-2.5 py-1.5 align-top"
              {...props}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
