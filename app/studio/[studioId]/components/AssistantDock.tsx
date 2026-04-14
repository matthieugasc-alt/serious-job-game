'use client';

/**
 * AssistantDock
 *
 * Copilote Scenario Studio intégré en bas de page. Toujours borné au scénario
 * courant. Trois modes :
 *   - discuter : Q&A, brainstorming, zero mutation
 *   - remplir  : remplit des champs ciblés de la section active (preview)
 *   - patcher  : propose une révision structurelle du scénario (preview)
 *
 * Rien n'est écrit sans validation humaine explicite :
 *   - "remplir" → carte par champ, case à cocher, bouton "Appliquer la sélection"
 *   - "patcher" → bouton "Voir et appliquer" → modale preview
 */

import { useCallback, useRef, useState, useEffect } from 'react';

type Mode = 'free' | 'fill' | 'patch';

const MODE_LABELS: Record<Mode, string> = {
  free: 'Discuter',
  fill: 'Remplir',
  patch: 'Patcher',
};

const MODE_HINTS: Record<Mode, string> = {
  free: 'Pose une question, demande un avis, brainstorme.',
  fill: 'Demande de remplir des champs de la section active.',
  patch: 'Demande une modification structurelle (preview avant application).',
};

interface FieldAssignment {
  path: string;
  value: unknown;
  summary: string;
}

interface ChangeItem {
  path: string;
  summary: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: Mode;
  // Payload attaché pour les réponses actionnables
  free?: { answer: string; followUps: string[] };
  fill?: { rationale: string; fields: FieldAssignment[] };
  patch?: { summary: string; changes: ChangeItem[]; proposedScenario: Record<string, unknown> };
  error?: string;
}

export default function AssistantDock({
  studioId,
  activeTab,
  onApplyFill,
  onApplyPatch,
}: {
  studioId: string;
  activeTab: string;
  onApplyFill: (fields: FieldAssignment[]) => void;
  onApplyPatch: (proposed: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('free');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [patchModal, setPatchModal] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.free))
      .map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? m.free?.answer || m.content : m.content,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`/api/studio/${studioId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          message: text,
          history,
          context: { activeTab },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur copilote');

      const aMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: '',
        mode,
      };
      if (mode === 'free') {
        aMsg.free = { answer: data.answer || '', followUps: data.followUps || [] };
        aMsg.content = data.answer || '';
      } else if (mode === 'fill') {
        aMsg.fill = { rationale: data.rationale || '', fields: data.fields || [] };
        aMsg.content = data.rationale || '';
      } else {
        aMsg.patch = {
          summary: data.summary || '',
          changes: data.changes || [],
          proposedScenario: data.proposedScenario || {},
        };
        aMsg.content = data.summary || '';
      }
      setMessages((prev) => [...prev, aMsg]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: '',
          error: e?.message || 'Erreur inattendue',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, mode, studioId, activeTab]);

  const clear = () => setMessages([]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          padding: '10px 16px',
          background: '#5b5fc7',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(91,95,199,0.4)',
          zIndex: 500,
        }}
      >
        ✨ Assistant
      </button>
    );
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          right: 16,
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '70vh',
          background: '#14142b',
          border: '1px solid rgba(255,255,255,0.15)',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 400,
          boxShadow: '0 -8px 30px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>✨ Assistant Studio</span>
            <span
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                padding: '2px 6px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 4,
              }}
            >
              section : {activeTab}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {messages.length > 0 && (
              <button onClick={clear} style={iconBtn()}>
                Effacer
              </button>
            )}
            <button onClick={() => setOpen(false)} style={iconBtn()}>
              ✕
            </button>
          </div>
        </div>

        {/* Mode pills */}
        <div
          style={{
            padding: '8px 14px',
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            alignItems: 'center',
          }}
        >
          {(['free', 'fill', 'patch'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: mode === m ? '#5b5fc7' : 'rgba(255,255,255,0.06)',
                border: 'none',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{MODE_HINTS[mode]}</div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minHeight: 180,
          }}
        >
          {messages.length === 0 && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              Rien pour l'instant. Essaie par exemple :
              <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                <li>« Propose-moi une phase 4 plus tendue » (patcher)</li>
                <li>« Remplis le contexte et la mission » (remplir)</li>
                <li>« Ma difficulté est-elle cohérente ? » (discuter)</li>
              </ul>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onApplyFill={onApplyFill}
              onOpenPatch={() => setPatchModal(m)}
            />
          ))}
          {loading && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
              … l'assistant réfléchit
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            padding: 10,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            gap: 6,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`${MODE_LABELS[mode]} · Entrée pour envoyer · Shift+Entrée pour saut de ligne`}
            rows={2}
            style={{
              flex: 1,
              padding: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              padding: '0 14px',
              background: loading || !input.trim() ? 'rgba(91,95,199,0.5)' : '#5b5fc7',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* Patch preview modal */}
      {patchModal?.patch && (
        <PatchPreviewModal
          summary={patchModal.patch.summary}
          changes={patchModal.patch.changes}
          proposedScenario={patchModal.patch.proposedScenario}
          onApply={() => {
            onApplyPatch(patchModal.patch!.proposedScenario);
            setPatchModal(null);
          }}
          onCancel={() => setPatchModal(null)}
        />
      )}
    </>
  );
}

/* ---------- Message bubble ---------- */

function MessageBubble({
  message,
  onApplyFill,
  onOpenPatch,
}: {
  message: ChatMessage;
  onApplyFill: (fields: FieldAssignment[]) => void;
  onOpenPatch: () => void;
}) {
  if (message.error) {
    return (
      <div
        style={{
          alignSelf: 'flex-start',
          maxWidth: '95%',
          padding: 10,
          background: 'rgba(255,82,82,0.1)',
          border: '1px solid #ff5252',
          borderRadius: 8,
          fontSize: 12,
          color: '#ff8a80',
        }}
      >
        ✗ {message.error}
      </div>
    );
  }

  const isUser = message.role === 'user';
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '95%',
        padding: 10,
        background: isUser ? 'rgba(91,95,199,0.25)' : 'rgba(255,255,255,0.05)',
        border: isUser ? '1px solid rgba(91,95,199,0.5)' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        fontSize: 13,
        color: '#fff',
        whiteSpace: 'pre-wrap',
      }}
    >
      {/* FREE */}
      {message.free && (
        <>
          <div style={{ lineHeight: 1.5 }}>{message.free.answer}</div>
          {message.free.followUps.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {message.free.followUps.map((f, i) => (
                <span
                  key={i}
                  style={{
                    padding: '3px 8px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 999,
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* FILL */}
      {message.fill && (
        <FillProposal
          rationale={message.fill.rationale}
          fields={message.fill.fields}
          onApply={onApplyFill}
        />
      )}

      {/* PATCH */}
      {message.patch && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{message.patch.summary}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {message.patch.changes.length} changement(s) proposé(s)
          </div>
          <button
            onClick={onOpenPatch}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              background: '#5b5fc7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Voir et appliquer →
          </button>
        </div>
      )}

      {/* User text */}
      {!message.free && !message.fill && !message.patch && !message.error && (
        <div>{message.content}</div>
      )}
    </div>
  );
}

/* ---------- Fill proposal (cards with checkboxes) ---------- */

function FillProposal({
  rationale,
  fields,
  onApply,
}: {
  rationale: string;
  fields: FieldAssignment[];
  onApply: (fields: FieldAssignment[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(fields.map((_, i) => i)),
  );

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const apply = () => {
    onApply(fields.filter((_, i) => selected.has(i)));
  };

  return (
    <div>
      {rationale && <div style={{ marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{rationale}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fields.map((f, i) => (
          <label
            key={i}
            style={{
              padding: 8,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => toggle(i)}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a5a8ff' }}>{f.path}</div>
              <div style={{ fontSize: 12, color: '#fff', marginTop: 2 }}>{f.summary}</div>
              <div
                style={{
                  marginTop: 4,
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
                {typeof f.value === 'string' ? f.value : JSON.stringify(f.value, null, 2)}
              </div>
            </div>
          </label>
        ))}
      </div>
      <button
        onClick={apply}
        disabled={selected.size === 0}
        style={{
          marginTop: 8,
          padding: '6px 12px',
          background: selected.size === 0 ? 'rgba(91,95,199,0.4)' : '#51cf66',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        Appliquer la sélection ({selected.size}/{fields.length})
      </button>
    </div>
  );
}

/* ---------- Patch preview modal ---------- */

function PatchPreviewModal({
  summary,
  changes,
  proposedScenario,
  onApply,
  onCancel,
}: {
  summary: string;
  changes: ChangeItem[];
  proposedScenario: Record<string, unknown>;
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
        zIndex: 1100,
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          width: '100%',
          maxWidth: 800,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
            Proposition de patch (copilote)
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{summary}</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
            Changements ({changes.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {changes.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: 8,
                  background: 'rgba(91,95,199,0.1)',
                  border: '1px solid rgba(91,95,199,0.3)',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a5a8ff' }}>{c.path}</div>
                <div style={{ marginTop: 2, color: '#fff' }}>{c.summary}</div>
              </div>
            ))}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              Voir le JSON proposé
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                fontSize: 11,
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(proposedScenario, null, 2)}
            </pre>
          </details>
        </div>
        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
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
            onClick={onApply}
            style={{
              padding: '8px 14px',
              background: '#5b5fc7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Appliquer au scénario
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtn(): React.CSSProperties {
  return {
    padding: '4px 8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.7)',
    borderRadius: 4,
    fontSize: 11,
    cursor: 'pointer',
  };
}
