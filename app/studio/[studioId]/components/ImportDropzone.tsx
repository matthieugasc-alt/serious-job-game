'use client';

/**
 * ImportDropzone — drag-and-drop intelligent import.
 *
 * Supporte :
 *  - drop/upload de .txt / .md (lus puis envoyés en JSON)
 *  - drop/upload d'image (png/jpg/webp) → OCR + extraction via OpenAI vision
 *  - collage direct de texte dans un textarea (fallback PDF/DOCX)
 *
 * Après extraction, ouvre une modale de revue :
 *  - champs confiants (verts)
 *  - champs incertains (orange) — case décochée par défaut
 *  - champs manquants (liste)
 *  - conflits (rouge) — case décochée par défaut, affiche l'existant et la proposition
 *
 * Bouton "Appliquer la sélection" → callback parent → patch local via setByPath.
 */

import { useRef, useState } from 'react';

type Confidence = 'high' | 'medium' | 'low';

interface ExtractedField {
  path: string;
  value: unknown;
  summary: string;
  confidence: Confidence;
}

interface Conflict {
  path: string;
  existingValue: unknown;
  proposedValue: unknown;
  note: string;
}

interface ExtractionResult {
  confident: ExtractedField[];
  uncertain: ExtractedField[];
  missing: string[];
  conflicts: Conflict[];
  summary: string;
}

export default function ImportDropzone({
  studioId,
  onApplyFields,
}: {
  studioId: string;
  onApplyFields: (fields: { path: string; value: unknown }[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendText = async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/${studioId}/import-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur extraction');
      setResult(data as ExtractionResult);
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const sendFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      // .txt / .md lus côté client pour gagner du temps
      if (/\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith('text/')) {
        const text = await file.text();
        await sendText(text);
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/studio/${studioId}/import-extract`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur extraction');
      setResult(data as ExtractionResult);
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) sendFile(file);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: 24,
          border: dragging
            ? '2px dashed #5b5fc7'
            : '2px dashed rgba(255,255,255,0.2)',
          borderRadius: 8,
          background: dragging ? 'rgba(91,95,199,0.08)' : 'rgba(255,255,255,0.03)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
          Déposez un fichier ou cliquez pour parcourir
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          .txt · .md · .png · .jpg · .webp — PDF/DOCX : collez le texte ci-dessous
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.markdown,.png,.jpg,.jpeg,.webp,text/*,image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
          Ou coller directement le texte (PDF, DOCX, note copiée…)
        </summary>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Collez le contenu textuel ici…"
          style={{
            marginTop: 8,
            width: '100%',
            minHeight: 100,
            padding: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => pasteText.trim() && sendText(pasteText.trim())}
          disabled={loading || pasteText.trim().length < 20}
          style={{
            marginTop: 8,
            padding: '8px 14px',
            background:
              loading || pasteText.trim().length < 20
                ? 'rgba(91,95,199,0.5)'
                : '#5b5fc7',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading || pasteText.trim().length < 20 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Extraction…' : 'Analyser ce texte'}
        </button>
      </details>

      {loading && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          🧠 Extraction IA en cours…
        </div>
      )}
      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid #ff5252',
            borderRadius: 6,
            color: '#ff8a80',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <ReviewModal
          result={result}
          onApply={(fields) => {
            onApplyFields(fields);
            setResult(null);
            setPasteText('');
          }}
          onCancel={() => setResult(null)}
        />
      )}
    </div>
  );
}

/* ---------- Review modal ---------- */

function ReviewModal({
  result,
  onApply,
  onCancel,
}: {
  result: ExtractionResult;
  onApply: (fields: { path: string; value: unknown }[]) => void;
  onCancel: () => void;
}) {
  // Selected = all confident by default, nothing else.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    result.confident.forEach((f) => s.add(`c:${f.path}`));
    return s;
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const apply = () => {
    const chosen: { path: string; value: unknown }[] = [];
    for (const f of result.confident) {
      if (selected.has(`c:${f.path}`)) chosen.push({ path: f.path, value: f.value });
    }
    for (const f of result.uncertain) {
      if (selected.has(`u:${f.path}`)) chosen.push({ path: f.path, value: f.value });
    }
    for (const c of result.conflicts) {
      if (selected.has(`x:${c.path}`))
        chosen.push({ path: c.path, value: c.proposedValue });
    }
    onApply(chosen);
  };

  const count = selected.size;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1100,
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
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
            Import intelligent — revue avant application
          </div>
          <div style={{ fontSize: 15, color: '#fff' }}>{result.summary}</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
          {/* Confident */}
          <SectionHeader
            title="Détections confiantes"
            color="#51cf66"
            count={result.confident.length}
          />
          <FieldList
            fields={result.confident}
            prefix="c"
            selected={selected}
            onToggle={toggle}
            accent="#51cf66"
          />

          {/* Uncertain */}
          <SectionHeader
            title="Détections incertaines (à vérifier)"
            color="#ffab40"
            count={result.uncertain.length}
          />
          <FieldList
            fields={result.uncertain}
            prefix="u"
            selected={selected}
            onToggle={toggle}
            accent="#ffab40"
          />

          {/* Conflicts */}
          <SectionHeader
            title="Conflits avec l'existant"
            color="#ff5252"
            count={result.conflicts.length}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {result.conflicts.map((c) => {
              const key = `x:${c.path}`;
              const on = selected.has(key);
              return (
                <label
                  key={key}
                  style={{
                    padding: 10,
                    background: on ? 'rgba(255,82,82,0.12)' : 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,82,82,0.35)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(key)}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#ff8a80' }}>
                      {c.path}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, color: '#fff' }}>{c.note}</div>
                    <div
                      style={{
                        marginTop: 6,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                        fontSize: 11,
                      }}
                    >
                      <ValuePreview label="Existant" value={c.existingValue} />
                      <ValuePreview label="Proposé" value={c.proposedValue} />
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Missing */}
          {result.missing.length > 0 && (
            <>
              <SectionHeader
                title="Champs absents du document"
                color="#90caf9"
                count={result.missing.length}
              />
              <div
                style={{
                  padding: 10,
                  background: 'rgba(100,181,246,0.06)',
                  border: '1px solid rgba(100,181,246,0.3)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.75)',
                  marginBottom: 16,
                }}
              >
                {result.missing.map((m, i) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    · {m}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {count} champ(s) sélectionné(s) pour application
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              onClick={apply}
              disabled={count === 0}
              style={{
                padding: '8px 14px',
                background: count === 0 ? 'rgba(81,207,102,0.4)' : '#51cf66',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: count === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Appliquer la sélection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, color, count }: { title: string; color: string; count: number }) {
  return (
    <div style={{ margin: '8px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color, fontWeight: 700, fontSize: 13 }}>{title}</span>
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: `${color}22`,
          color,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function FieldList({
  fields,
  prefix,
  selected,
  onToggle,
  accent,
}: {
  fields: ExtractedField[];
  prefix: 'c' | 'u';
  selected: Set<string>;
  onToggle: (key: string) => void;
  accent: string;
}) {
  if (fields.length === 0) {
    return (
      <div style={{ marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
        (vide)
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {fields.map((f) => {
        const key = `${prefix}:${f.path}`;
        const on = selected.has(key);
        return (
          <label
            key={key}
            style={{
              padding: 10,
              background: on ? `${accent}18` : 'rgba(0,0,0,0.25)',
              border: `1px solid ${accent}44`,
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              gap: 10,
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(key)}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: accent,
                }}
              >
                {f.path} · {f.confidence}
              </div>
              <div style={{ fontSize: 12, marginTop: 2, color: '#fff' }}>{f.summary}</div>
              <ValuePreview value={f.value} />
            </div>
          </label>
        );
      })}
    </div>
  );
}

function ValuePreview({ label, value }: { label?: string; value: unknown }) {
  const rendered =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div
      style={{
        marginTop: 6,
        padding: 6,
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 3,
        fontSize: 11,
        color: 'rgba(255,255,255,0.8)',
        maxHeight: 100,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {label && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
          {label}
        </div>
      )}
      {rendered}
    </div>
  );
}
