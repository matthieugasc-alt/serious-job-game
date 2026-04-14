'use client';

/**
 * AIReviewPanel
 *
 * Panneau affichant :
 *  - un bouton "Lancer une revue IA"
 *  - les 3 catégories (erreurs bloquantes, warnings, suggestions)
 *  - les 5 actions de patch (corriger / améliorer / durcir / fluidifier / + réalisme)
 *  - une modale de preview du patch proposé avec validation humaine
 *
 * Le parent (studio editor) passe :
 *  - studioId
 *  - onApplyPatch(proposedScenario) : appelé quand l'utilisateur valide. Le
 *    parent est responsable de mettre à jour son state et de sauvegarder (via
 *    l'autosave existante ou un PUT immédiat).
 */

import { useCallback, useState } from 'react';

type Severity = 'blocker' | 'warning' | 'suggestion';

interface ReviewItem {
  id: string;
  path: string;
  title: string;
  description: string;
  severity: Severity;
  rationale?: string;
}

interface ReviewPayload {
  id: string;
  scenarioId: string;
  versionHash: string;
  createdAt: string;
  blockingErrors: ReviewItem[];
  warnings: ReviewItem[];
  suggestions: ReviewItem[];
}

interface ChangeItem {
  path: string;
  summary: string;
}

interface PatchPreview {
  action: string;
  targetPath: string | null;
  summary: string;
  changes: ChangeItem[];
  proposedScenario: Record<string, unknown>;
}

type PatchAction =
  | 'fix-inconsistency'
  | 'improve'
  | 'harden'
  | 'smooth'
  | 'realism';

const ACTION_LABELS: Record<PatchAction, string> = {
  'fix-inconsistency': 'Corriger incohérences',
  improve: 'Améliorer',
  harden: 'Durcir',
  smooth: 'Fluidifier',
  realism: '+ Réalisme',
};

const SEVERITY_COLORS: Record<Severity, { bg: string; border: string; text: string }> = {
  blocker: { bg: 'rgba(255,82,82,0.1)', border: '#ff5252', text: '#ff8a80' },
  warning: { bg: 'rgba(255,171,64,0.08)', border: '#ffab40', text: '#ffd180' },
  suggestion: { bg: 'rgba(100,181,246,0.08)', border: '#64b5f6', text: '#90caf9' },
};

export default function AIReviewPanel({
  studioId,
  onApplyPatch,
}: {
  studioId: string;
  onApplyPatch: (proposed: Record<string, unknown>) => void;
}) {
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [patchLoading, setPatchLoading] = useState<PatchAction | null>(null);
  const [patchPreview, setPatchPreview] = useState<PatchPreview | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const runReview = useCallback(async () => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/studio/${studioId}/ai-review`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur revue IA');
      setReview(data.review);
    } catch (e: any) {
      setReviewError(e?.message || 'Erreur inattendue');
    } finally {
      setReviewLoading(false);
    }
  }, [studioId]);

  const runPatch = useCallback(
    async (action: PatchAction, targetPath?: string) => {
      setPatchLoading(action);
      setPatchError(null);
      setPatchPreview(null);
      try {
        const res = await fetch(`/api/studio/${studioId}/ai-patch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, targetPath }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Erreur génération patch');
        setPatchPreview(data);
      } catch (e: any) {
        setPatchError(e?.message || 'Erreur inattendue');
      } finally {
        setPatchLoading(null);
      }
    },
    [studioId],
  );

  const applyPatch = useCallback(() => {
    if (!patchPreview) return;
    setApplying(true);
    try {
      onApplyPatch(patchPreview.proposedScenario);
      setPatchPreview(null);
    } finally {
      setApplying(false);
    }
  }, [patchPreview, onApplyPatch]);

  const totalItems = review
    ? review.blockingErrors.length + review.warnings.length + review.suggestions.length
    : 0;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0, marginBottom: 12 }}>Revue IA</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 0, maxWidth: 720 }}>
        L'IA audite votre scénario et propose des actions. Rien n'est appliqué
        sans votre validation explicite.
      </p>

      {/* Barre d'actions globale */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginTop: 16,
          marginBottom: 24,
        }}
      >
        <button
          onClick={runReview}
          disabled={reviewLoading}
          style={primaryBtn(reviewLoading)}
        >
          {reviewLoading ? '🔍 Analyse en cours…' : '🔍 Lancer une revue IA'}
        </button>
        {(Object.keys(ACTION_LABELS) as PatchAction[]).map((a) => (
          <button
            key={a}
            onClick={() => runPatch(a)}
            disabled={patchLoading !== null}
            style={secondaryBtn(patchLoading === a)}
          >
            {patchLoading === a ? '… génération' : ACTION_LABELS[a]}
          </button>
        ))}
      </div>

      {reviewError && <ErrorBox>{reviewError}</ErrorBox>}
      {patchError && <ErrorBox>{patchError}</ErrorBox>}

      {/* Compteurs */}
      {review && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Badge color="#ff5252" count={review.blockingErrors.length} label="Erreurs bloquantes" />
          <Badge color="#ffab40" count={review.warnings.length} label="Avertissements" />
          <Badge color="#64b5f6" count={review.suggestions.length} label="Suggestions" />
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, alignSelf: 'center' }}>
            Générée le {new Date(review.createdAt).toLocaleString('fr-FR')}
          </div>
        </div>
      )}

      {/* Liste des items */}
      {review && totalItems === 0 && (
        <div
          style={{
            padding: 20,
            background: 'rgba(81,207,102,0.08)',
            border: '1px solid #51cf66',
            borderRadius: 8,
            color: '#b9f5c0',
          }}
        >
          ✓ Aucun problème détecté par l'IA. Le scénario paraît solide.
        </div>
      )}

      {review && review.blockingErrors.length > 0 && (
        <Section title="Erreurs bloquantes" severity="blocker" items={review.blockingErrors} />
      )}
      {review && review.warnings.length > 0 && (
        <Section title="Avertissements" severity="warning" items={review.warnings} />
      )}
      {review && review.suggestions.length > 0 && (
        <Section title="Suggestions" severity="suggestion" items={review.suggestions} />
      )}

      {!review && !reviewLoading && (
        <div
          style={{
            padding: 20,
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.5)',
            fontSize: 14,
          }}
        >
          Cliquez sur <strong>Lancer une revue IA</strong> pour analyser le scénario.
        </div>
      )}

      {/* Modale de preview du patch */}
      {patchPreview && (
        <PatchPreviewModal
          preview={patchPreview}
          applying={applying}
          onApply={applyPatch}
          onCancel={() => setPatchPreview(null)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  severity,
  items,
}: {
  title: string;
  severity: Severity;
  items: ReviewItem[];
}) {
  const colors = SEVERITY_COLORS[severity];
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, color: colors.text, marginBottom: 8 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: 12,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#fff' }}>
              {item.title}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', marginBottom: 6 }}>
              {item.path}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
              {item.description}
            </div>
            {item.rationale && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, fontStyle: 'italic' }}>
                {item.rationale}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PatchPreviewModal({
  preview,
  applying,
  onApply,
  onCancel,
}: {
  preview: PatchPreview;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          width: '100%',
          maxWidth: 820,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            Proposition IA — {preview.action}
          </h2>
          <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
            {preview.summary}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          <h3 style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 0 }}>
            Changements proposés ({preview.changes.length})
          </h3>
          {preview.changes.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
              Aucun changement détaillé — voir le JSON ci-dessous.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {preview.changes.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: 10,
                  background: 'rgba(91,95,199,0.1)',
                  border: '1px solid rgba(91,95,199,0.3)',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a5a8ff', marginBottom: 4 }}>
                  {c.path}
                </div>
                <div>{c.summary}</div>
              </div>
            ))}
          </div>

          <details>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
              Voir le JSON complet proposé
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                fontSize: 11,
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(preview.proposedScenario, null, 2)}
            </pre>
          </details>
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button onClick={onCancel} style={ghostBtn()}>
            Annuler
          </button>
          <button onClick={onApply} disabled={applying} style={primaryBtn(applying)}>
            {applying ? 'Application…' : 'Appliquer au scénario'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- small pieces --- */

function Badge({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div
      style={{
        padding: '6px 12px',
        background: `${color}20`,
        border: `1px solid ${color}`,
        borderRadius: 4,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 700, color }}>{count}</span>
      <span style={{ color: 'rgba(255,255,255,0.8)' }}>{label}</span>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        background: 'rgba(255,82,82,0.1)',
        border: '1px solid #ff5252',
        borderRadius: 6,
        color: '#ff8a80',
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 16px',
    background: disabled ? 'rgba(91,95,199,0.5)' : '#5b5fc7',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function secondaryBtn(loading: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    background: loading ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: loading ? 'wait' : 'pointer',
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: '10px 16px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.75)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };
}
