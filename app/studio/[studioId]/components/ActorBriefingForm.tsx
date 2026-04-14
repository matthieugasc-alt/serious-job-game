'use client';

/**
 * ActorBriefingForm
 *
 * Formulaire narratif qui remplace l'écriture manuelle du prompt pour un acteur IA.
 * L'utilisateur remplit rôle / traits / histoire / motivations / peurs / biais /
 * relation au joueur / objectifs / niveaux ouverture-tension-rigidité / style de parole.
 *
 * Click "Générer le comportement IA" → appel /actor-generate → affiche le prompt
 * généré + règles + limites + style. Bouton "Injecter dans l'acteur" pousse le
 * prompt dans actor.promptContent via le callback parent.
 */

import { useState, useEffect, useRef } from 'react';

export interface ActorBriefing {
  role: string;
  personalityTraits: string[];
  backstory: string;
  motivations: string[];
  fears: string[];
  biases: string[];
  relationToPlayer: string;
  personalGoals: string[];
  openness: number;
  tension: number;
  rigidity: number;
  speechElements: string;
}

interface GenerationResult {
  prompt: string;
  behaviorRules: string[];
  limits: string[];
  style: string;
}

const EMPTY_BRIEFING: ActorBriefing = {
  role: '',
  personalityTraits: [],
  backstory: '',
  motivations: [],
  fears: [],
  biases: [],
  relationToPlayer: '',
  personalGoals: [],
  openness: 0.5,
  tension: 0.5,
  rigidity: 0.5,
  speechElements: '',
};

export default function ActorBriefingForm({
  studioId,
  actorId,
  actorName,
  initialBriefing,
  onInjectPrompt,
  onBriefingChange,
}: {
  studioId: string;
  actorId: string;
  actorName: string;
  initialBriefing?: Partial<ActorBriefing>;
  onInjectPrompt: (prompt: string) => void;
  onBriefingChange?: (briefing: ActorBriefing) => void;
}) {
  const [briefing, setBriefing] = useState<ActorBriefing>({
    ...EMPTY_BRIEFING,
    ...initialBriefing,
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<ActorBriefing>) => {
    const next = { ...briefing, ...patch };
    setBriefing(next);
    onBriefingChange?.(next);
  };

  const generate = async () => {
    if (!briefing.role.trim()) {
      setError('Le rôle est requis pour générer un comportement.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/${studioId}/actor-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId, actorName, briefing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur génération');
      setResult({
        prompt: data.prompt,
        behaviorRules: data.behaviorRules,
        limits: data.limits,
        style: data.style,
      });
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(91,95,199,0.05)',
        border: '1px solid rgba(91,95,199,0.3)',
        borderRadius: 8,
        padding: 16,
        marginTop: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#a5a8ff' }}>
        Briefing narratif — générez un prompt à partir d'inputs humains
      </div>

      <Field label="Rôle professionnel *">
        <input
          type="text"
          value={briefing.role}
          onChange={(e) => update({ role: e.target.value })}
          placeholder="Ex: Directrice des achats, sceptique, sous pression budgétaire"
          style={input()}
        />
      </Field>

      <Field label="Traits de personnalité (séparés par virgule)">
        <BriefingCommaInput
          value={briefing.personalityTraits}
          onChange={(personalityTraits) => update({ personalityTraits })}
          placeholder="exigeant, méthodique, impatient"
          styleFn={input}
        />
      </Field>

      <Field label="Histoire / contexte">
        <textarea
          value={briefing.backstory}
          onChange={(e) => update({ backstory: e.target.value })}
          placeholder="15 ans dans l'entreprise, promu récemment, a déjà refusé 2 prestataires similaires…"
          style={textarea()}
        />
      </Field>

      <Row>
        <Field label="Motivations (virgules)">
          <BriefingCommaInput
            value={briefing.motivations}
            onChange={(motivations) => update({ motivations })}
            placeholder="sécuriser son poste, tenir son budget"
            styleFn={input}
          />
        </Field>
        <Field label="Peurs (virgules)">
          <BriefingCommaInput
            value={briefing.fears}
            onChange={(fears) => update({ fears })}
            placeholder="prendre une décision risquée, être court-circuité"
            styleFn={input}
          />
        </Field>
      </Row>

      <Row>
        <Field label="Biais (virgules)">
          <BriefingCommaInput
            value={briefing.biases}
            onChange={(biases) => update({ biases })}
            placeholder="se méfie des startups, préfère les solutions éprouvées"
            styleFn={input}
          />
        </Field>
        <Field label="Objectifs personnels (virgules)">
          <BriefingCommaInput
            value={briefing.personalGoals}
            onChange={(personalGoals) => update({ personalGoals })}
            placeholder="impressionner sa hiérarchie, valider son choix"
            styleFn={input}
          />
        </Field>
      </Row>

      <Field label="Relation au joueur">
        <input
          type="text"
          value={briefing.relationToPlayer}
          onChange={(e) => update({ relationToPlayer: e.target.value })}
          placeholder="Première rencontre, position de force, méfiante"
          style={input()}
        />
      </Field>

      <Row>
        <RangeField
          label={`Ouverture (${briefing.openness.toFixed(2)})`}
          value={briefing.openness}
          onChange={(v) => update({ openness: v })}
        />
        <RangeField
          label={`Tension (${briefing.tension.toFixed(2)})`}
          value={briefing.tension}
          onChange={(v) => update({ tension: v })}
        />
        <RangeField
          label={`Rigidité (${briefing.rigidity.toFixed(2)})`}
          value={briefing.rigidity}
          onChange={(v) => update({ rigidity: v })}
        />
      </Row>

      <Field label="Éléments de langage (tics, vocabulaire, ton)">
        <textarea
          value={briefing.speechElements}
          onChange={(e) => update({ speechElements: e.target.value })}
          placeholder="Vouvoie systématiquement, coupe la parole, cite souvent des chiffres"
          style={textarea()}
        />
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={generate} disabled={loading} style={primaryBtn(loading)}>
          {loading ? '🧠 Génération…' : '🧠 Générer le comportement IA'}
        </button>
        {result && (
          <button onClick={generate} disabled={loading} style={ghostBtn()}>
            ↻ Regénérer
          </button>
        )}
      </div>

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
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#b9f5c0' }}>
            Prompt généré
          </div>
          <pre
            style={{
              background: 'rgba(0,0,0,0.35)',
              padding: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              maxHeight: 220,
              overflow: 'auto',
              margin: 0,
            }}
          >
            {result.prompt}
          </pre>

          <Row>
            <ListBlock title="Règles de comportement" items={result.behaviorRules} />
            <ListBlock title="Limites" items={result.limits} />
          </Row>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: '8px 0' }}>
            <strong>Style :</strong> {result.style}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => onInjectPrompt(result.prompt)}
              style={{ ...primaryBtn(false), background: '#51cf66' }}
            >
              ↳ Injecter dans l'acteur
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- helpers ---- */

/**
 * Blur-only comma list input — avoids eating spaces/commas while typing.
 */
function BriefingCommaInput({
  value,
  onChange,
  placeholder,
  styleFn,
}: {
  value: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  styleFn: () => React.CSSProperties;
}) {
  const [raw, setRaw] = useState(() => value.join(', '));
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (value.length !== prev.length || value.some((v, i) => v !== prev[i])) {
      setRaw(value.join(', '));
      prevRef.current = value;
    }
  }, [value]);

  return (
    <input
      type="text"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        const items = raw
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        prevRef.current = items;
        onChange(items);
      }}
      placeholder={placeholder}
      style={styleFn()}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, flex: 1 }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>;
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 10, flex: 1, minWidth: 160 }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        {label}
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ flex: 1, minWidth: 240, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'rgba(255,255,255,0.8)' }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
        {items.map((r, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function input(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4,
    color: '#fff',
    fontSize: 13,
    boxSizing: 'border-box',
  };
}

function textarea(): React.CSSProperties {
  return { ...input(), minHeight: 60, fontFamily: 'inherit', resize: 'vertical' };
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

function ghostBtn(): React.CSSProperties {
  return {
    padding: '8px 14px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.75)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  };
}
