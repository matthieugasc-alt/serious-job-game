'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AIReviewPanel from './components/AIReviewPanel';
import ActorBriefingForm from './components/ActorBriefingForm';
import AssistantDock from './components/AssistantDock';
import JobFamiliesSelect from './components/JobFamiliesSelect';
import ImportDropzone from './components/ImportDropzone';
import { applyAssignments } from '@/app/lib/setByPath';

/**
 * CommaListInput — stores raw text in local state, only parses on blur.
 * Prevents the "eaten spaces" bug caused by split+trim+join on every keystroke.
 */
function CommaListInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [raw, setRaw] = useState(() => value.join(', '));
  const prevValueRef = useRef(value);

  // Sync raw when value changes externally (e.g. after AI apply or load)
  useEffect(() => {
    const prev = prevValueRef.current;
    if (
      value.length !== prev.length ||
      value.some((v, i) => v !== prev[i])
    ) {
      setRaw(value.join(', '));
      prevValueRef.current = value;
    }
  }, [value]);

  const handleBlur = () => {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    prevValueRef.current = items;
    onChange(items);
  };

  return (
    <input
      type="text"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      style={style}
    />
  );
}

interface Actor {
  id: string;
  name: string;
  role: string;
  personality: string;
  avatarColor?: string;
  initials?: string;
  channels: string[];
  controlledBy: 'human' | 'ai';
  promptContent?: string;
}

interface Channel {
  id: string;
  name: string;
  type: string;
}

interface Criteria {
  description: string;
  points: number;
}

interface Phase {
  id: string;
  title: string;
  objective: string;
  activeChannels: string[];
  aiActors: string[];
  /** Compétences cibles de la phase — logique pédagogique principale */
  competencies: string[];
  /** Trigger de fin de phase (condition observable qui valide la complétion) */
  completionTrigger: string;
  /** Critères secondaires (scoring optionnel, maintenu pour rétrocompatibilité) */
  criteria: Criteria[];
  completionRules?: {
    minScore?: number;
    maxExchanges?: number;
    flags?: string[];
  };
  autoAdvance: boolean;
  introMessage: string;
  interactionMode: 'chat' | 'presentation' | 'voice_qa';
}

interface Document {
  id: string;
  label: string;
  contains: string[];
  usableAsAttachment: boolean;
  filePath?: string;
  content?: string;
}

interface Ending {
  id: string;
  label: string;
  content: string;
  priority: number;
  conditions?: {
    minScore?: number;
    coreFlags?: string[];
  };
}

interface StudioData {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  jobFamily: string;
  jobFamilies?: string[];
  isTeaserVisible?: boolean;
  teaserBanner?: string;
  difficulty: string;
  duration: number;
  tags: string[];
  locale: string;
  context: string;
  mission: string;
  initialSituation: string;
  trigger: string;
  backgroundFact: string;
  scenarioStartTime: string;
  simSpeed: number;
  actors: Actor[];
  channels: Channel[];
  phases: Phase[];
  documents: Document[];
  endings: Ending[];
}

export default function StudioEditorPage({ params }: { params: Promise<{ studioId: string }> }) {
  const { studioId } = use(params);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('general');
  const [studio, setStudio] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [validationResult, setValidationResult] = useState<any>(null);
  const [compilationResult, setCompilationResult] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  // Load studio data
  useEffect(() => {
    const fetchStudio = async () => {
      try {
        const res = await fetch(`/api/studio/${studioId}`, { cache: 'no-store' });
        if (res.status === 404) {
          setLoadError(`Scénario "${studioId}" introuvable. Vérifiez qu'il a bien été créé.`);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Erreur serveur (${res.status})`);
        }
        const data = await res.json();
        if (!data || !data.id) {
          throw new Error('Données du scénario invalides');
        }
        setStudio(data);
        setLoading(false);
      } catch (err: any) {
        console.error('Load studio error:', err);
        setLoadError(err.message || 'Impossible de charger le scénario');
        setLoading(false);
      }
    };
    fetchStudio();
  }, [studioId]);

  // Auto-save debounce
  const autoSave = useCallback(() => {
    if (!studio || saving) return;

    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/studio/${studioId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(studio),
        });
        if (!res.ok) throw new Error('Save failed');
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save error:', err);
        setSaveStatus('error');
      }
    }, 1500);
  }, [studio, studioId, saving]);

  useEffect(() => {
    autoSave();
  }, [studio, autoSave]);

  const updateStudio = (updates: Partial<StudioData>) => {
    setStudio((prev) => prev ? { ...prev, ...updates } : null);
  };

  const updateActor = (actorId: string, updates: Partial<Actor>) => {
    setStudio((prev) =>
      prev
        ? {
            ...prev,
            actors: prev.actors.map((a) => (a.id === actorId ? { ...a, ...updates } : a)),
          }
        : null
    );
  };

  const addActor = () => {
    if (!studio) return;
    const newActor: Actor = {
      id: `actor-${Date.now()}`,
      name: 'Nouvel Acteur',
      role: '',
      personality: '',
      channels: [],
      controlledBy: 'ai',
    };
    setStudio({ ...studio, actors: [...studio.actors, newActor] });
  };

  const deleteActor = (actorId: string) => {
    setStudio((prev) =>
      prev ? { ...prev, actors: prev.actors.filter((a) => a.id !== actorId) } : null
    );
  };

  const updatePhase = (phaseId: string, updates: Partial<Phase>) => {
    setStudio((prev) =>
      prev
        ? {
            ...prev,
            phases: prev.phases.map((p) => (p.id === phaseId ? { ...p, ...updates } : p)),
          }
        : null
    );
  };

  const addPhase = () => {
    if (!studio) return;
    const newPhase: Phase = {
      id: `phase-${Date.now()}`,
      title: 'Nouvelle Phase',
      objective: '',
      activeChannels: [],
      aiActors: [],
      competencies: [],
      completionTrigger: '',
      criteria: [],
      completionRules: { minScore: 0, maxExchanges: 100, flags: [] },
      autoAdvance: false,
      introMessage: '',
      interactionMode: 'chat',
    };
    setStudio({ ...studio, phases: [...studio.phases, newPhase] });
  };

  const deletePhase = (phaseId: string) => {
    setStudio((prev) =>
      prev ? { ...prev, phases: prev.phases.filter((p) => p.id !== phaseId) } : null
    );
  };

  const movePhaseUp = (index: number) => {
    if (index === 0 || !studio) return;
    const newPhases = [...studio.phases];
    [newPhases[index - 1], newPhases[index]] = [newPhases[index], newPhases[index - 1]];
    setStudio({ ...studio, phases: newPhases });
  };

  const movePhaseDown = (index: number) => {
    if (index === studio!.phases.length - 1 || !studio) return;
    const newPhases = [...studio.phases];
    [newPhases[index], newPhases[index + 1]] = [newPhases[index + 1], newPhases[index]];
    setStudio({ ...studio, phases: newPhases });
  };

  const updateDocument = (docId: string, updates: Partial<Document>) => {
    setStudio((prev) =>
      prev
        ? {
            ...prev,
            documents: prev.documents.map((d) => (d.id === docId ? { ...d, ...updates } : d)),
          }
        : null
    );
  };

  const addDocument = () => {
    if (!studio) return;
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      label: 'Nouveau Document',
      contains: [],
      usableAsAttachment: true,
    };
    setStudio({ ...studio, documents: [...studio.documents, newDoc] });
  };

  const deleteDocument = (docId: string) => {
    setStudio((prev) =>
      prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== docId) } : null
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/studio/${studioId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      updateDocument(docId, { filePath: data.path });
    } catch (err) {
      console.error('Upload error:', err);
    }
  };

  const updateEnding = (endingId: string, updates: Partial<Ending>) => {
    setStudio((prev) =>
      prev
        ? {
            ...prev,
            endings: prev.endings.map((e) => (e.id === endingId ? { ...e, ...updates } : e)),
          }
        : null
    );
  };

  const addEnding = () => {
    if (!studio) return;
    const newEnding: Ending = {
      id: `ending-${Date.now()}`,
      label: 'Nouvelle Fin',
      content: '',
      priority: 0,
      conditions: { minScore: 0, coreFlags: [] },
    };
    setStudio({ ...studio, endings: [...studio.endings, newEnding] });
  };

  const deleteEnding = (endingId: string) => {
    setStudio((prev) =>
      prev ? { ...prev, endings: prev.endings.filter((e) => e.id !== endingId) } : null
    );
  };

  const handleValidate = async () => {
    try {
      const res = await fetch(`/api/studio/${studioId}/validate`, { method: 'POST' });
      const result = await res.json();
      setValidationResult(result);
    } catch (err) {
      console.error('Validation error:', err);
      setValidationResult({ success: false, errors: ['Erreur de validation'] });
    }
  };

  const handleCompile = async () => {
    try {
      const res = await fetch(`/api/studio/${studioId}/compile`, { method: 'POST' });
      const result = await res.json();
      setCompilationResult(result);
      setValidationResult(null);
    } catch (err) {
      console.error('Compilation error:', err);
      setCompilationResult({ success: false, errors: ['Erreur de compilation'] });
    }
  };

  const openTest = () => {
    if (compilationResult?.success) {
      window.open(`/scenarios/${studioId}/play`, '_blank');
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)',
          color: '#fff',
        }}
      >
        <div>Chargement...</div>
      </div>
    );
  }

  if (loadError || !studio) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)',
          color: '#ff6b6b',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700 }}>Scénario introuvable</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 400, textAlign: 'center' }}>
          {loadError || `Le scénario "${studioId}" n'existe pas ou n'a pas pu être chargé.`}
        </div>
        <button
          onClick={() => router.push('/admin')}
          style={{
            marginTop: 8, padding: '10px 24px', background: '#5b5fc7', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ← Retour à l'admin
        </button>
      </div>
    );
  }

  const aiActors = studio.actors.filter((a) => a.controlledBy === 'ai');

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          background: 'rgba(255, 255, 255, 0.03)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '20px 0',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '0 16px 24px', fontSize: '12px', fontWeight: 'bold', opacity: 0.6 }}>
          ONGLETS
        </div>
        {[
          { id: 'general', label: 'Général' },
          { id: 'narrative', label: 'Narratif' },
          { id: 'actors', label: 'Acteurs' },
          { id: 'phases', label: 'Phases' },
          { id: 'documents', label: 'Documents' },
          { id: 'endings', label: 'Fins' },
          { id: 'review', label: '🔍 Revue IA' },
          { id: 'json', label: 'Aperçu JSON' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: activeTab === tab.id ? '#5b5fc7' : 'rgba(255, 255, 255, 0.6)',
              borderLeft: activeTab === tab.id ? '3px solid #5b5fc7' : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <div
          style={{
            padding: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '12px',
          }}
        >
          <div
            style={{
              marginBottom: '8px',
              color:
                saveStatus === 'saved'
                  ? '#51cf66'
                  : saveStatus === 'error'
                  ? '#ff6b6b'
                  : 'rgba(255, 255, 255, 0.6)',
            }}
          >
            {saveStatus === 'saving' && '🔄 Sauvegarde...'}
            {saveStatus === 'saved' && '✓ Sauvegardé'}
            {saveStatus === 'error' && '✗ Erreur de sauvegarde'}
            {saveStatus === 'idle' && '-'}
          </div>
        </div>

        <button
          onClick={() => router.push('/admin')}
          style={{
            margin: '12px 16px',
            padding: '10px 12px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
        >
          ← Retour
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <div style={{ maxWidth: 800 }}>
            <h1 style={{ marginTop: 0, marginBottom: 32 }}>Général</h1>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Titre
              </label>
              <input
                type="text"
                value={studio.title}
                onChange={(e) => updateStudio({ title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Sous-titre
              </label>
              <input
                type="text"
                value={studio.subtitle}
                onChange={(e) => updateStudio({ subtitle: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Description
              </label>
              <textarea
                value={studio.description}
                onChange={(e) => updateStudio({ description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                  minHeight: 100,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  Famille de métier
                </label>
                <input
                  type="text"
                  value={studio.jobFamily}
                  onChange={(e) => updateStudio({ jobFamily: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  Difficulté
                </label>
                <select
                  value={studio.difficulty}
                  onChange={(e) => updateStudio({ difficulty: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: 14,
                  }}
                >
                  <option value="">Sélectionner</option>
                  <option value="débutant">Débutant</option>
                  <option value="intermédiaire">Intermédiaire</option>
                  <option value="avancé">Avancé</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  Durée (minutes)
                </label>
                <input
                  type="number"
                  value={studio.duration}
                  onChange={(e) => updateStudio({ duration: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  Locale
                </label>
                <input
                  type="text"
                  value={studio.locale}
                  onChange={(e) => updateStudio({ locale: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Tags (séparés par des virgules)
              </label>
              <CommaListInput
                value={studio.tags}
                onChange={(tags) => updateStudio({ tags })}
                placeholder="tag1, tag2, tag3"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                }}
              />
            </div>

            {/* Familles de métier (référentiel) */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Familles de métier (référentiel)
              </label>
              <JobFamiliesSelect
                selectedIds={studio.jobFamilies || []}
                onChange={(ids) => updateStudio({ jobFamilies: ids })}
              />
            </div>

            {/* Visibilité teaser côté joueurs */}
            <div
              style={{
                marginBottom: 20,
                padding: 14,
                background: 'rgba(255,171,64,0.06)',
                border: '1px solid rgba(255,171,64,0.3)',
                borderRadius: 8,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={studio.isTeaserVisible === true}
                  onChange={(e) => updateStudio({ isTeaserVisible: e.target.checked })}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#ffd180' }}>
                  Afficher en teaser côté joueurs (non jouable)
                </span>
              </label>
              {studio.isTeaserVisible && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                    Message de bannière (optionnel)
                  </label>
                  <input
                    type="text"
                    value={studio.teaserBanner || ''}
                    onChange={(e) => updateStudio({ teaserBanner: e.target.value })}
                    placeholder="Bientôt disponible · en cours d'implémentation"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    Les joueurs voient la carte avec la bannière mais ne peuvent pas lancer le scénario.
                  </div>
                </div>
              )}
            </div>

            {/* Import intelligent drag-and-drop */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Import intelligent (pré-remplissage depuis un document)
              </label>
              <ImportDropzone
                studioId={studioId}
                onApplyFields={(fields) => {
                  setStudio((prev) => {
                    if (!prev) return prev;
                    const { result, report } = applyAssignments(
                      prev as unknown as Record<string, unknown>,
                      fields.map((f) => ({ path: f.path, value: f.value })),
                    );
                    if (report.skipped.length > 0) {
                      console.warn('[import] skipped:', report.skipped);
                    }
                    return result as unknown as StudioData;
                  });
                }}
              />
            </div>
          </div>
        )}

        {/* NARRATIVE TAB */}
        {activeTab === 'narrative' && (
          <div style={{ maxWidth: 800 }}>
            <h1 style={{ marginTop: 0, marginBottom: 32 }}>Narratif</h1>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Contexte
              </label>
              <textarea
                value={studio.context}
                onChange={(e) => updateStudio({ context: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                  minHeight: 100,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Mission
              </label>
              <textarea
                value={studio.mission}
                onChange={(e) => updateStudio({ mission: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                  minHeight: 100,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Situation initiale
              </label>
              <textarea
                value={studio.initialSituation}
                onChange={(e) => updateStudio({ initialSituation: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                  minHeight: 80,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Déclencheur
              </label>
              <textarea
                value={studio.trigger}
                onChange={(e) => updateStudio({ trigger: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                  minHeight: 80,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Fait de fond
              </label>
              <textarea
                value={studio.backgroundFact}
                onChange={(e) => updateStudio({ backgroundFact: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: 14,
                  minHeight: 80,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  Heure de démarrage
                </label>
                <input
                  type="text"
                  value={studio.scenarioStartTime}
                  onChange={(e) => updateStudio({ scenarioStartTime: e.target.value })}
                  placeholder="HH:MM"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  Vitesse de simulation
                </label>
                <input
                  type="number"
                  value={studio.simSpeed}
                  onChange={(e) => updateStudio({ simSpeed: parseFloat(e.target.value) || 1 })}
                  step="0.1"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ACTORS TAB */}
        {activeTab === 'actors' && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <h1 style={{ marginTop: 0, marginBottom: 0 }}>Acteurs</h1>
              <button
                onClick={addActor}
                style={{
                  padding: '10px 16px',
                  background: '#5b5fc7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                + Ajouter un acteur
              </button>
            </div>

            {studio.actors.map((actor) => (
              <div
                key={actor.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: 16,
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Nom
                  </label>
                  <input
                    type="text"
                    value={actor.name}
                    onChange={(e) => updateActor(actor.id, { name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                      Rôle
                    </label>
                    <input
                      type="text"
                      value={actor.role}
                      onChange={(e) => updateActor(actor.id, { role: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: 14,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                      Contrôlé par
                    </label>
                    <select
                      value={actor.controlledBy}
                      onChange={(e) => updateActor(actor.id, { controlledBy: e.target.value as 'ai' | 'human' })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: 14,
                      }}
                    >
                      <option value="ai">IA</option>
                      <option value="human">Humain</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Personnalité
                  </label>
                  <textarea
                    value={actor.personality}
                    onChange={(e) => updateActor(actor.id, { personality: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                      minHeight: 80,
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                      Couleur avatar
                    </label>
                    <input
                      type="text"
                      value={actor.avatarColor || ''}
                      onChange={(e) => updateActor(actor.id, { avatarColor: e.target.value })}
                      placeholder="#5b5fc7"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: 14,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                      Initiales
                    </label>
                    <input
                      type="text"
                      value={actor.initials || ''}
                      onChange={(e) => updateActor(actor.id, { initials: e.target.value })}
                      maxLength={2}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: 14,
                      }}
                    />
                  </div>
                </div>

                {actor.controlledBy === 'ai' && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Contenu du prompt IA
                      </label>
                      <textarea
                        value={actor.promptContent || ''}
                        onChange={(e) => updateActor(actor.id, { promptContent: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: 14,
                          minHeight: 120,
                          resize: 'vertical',
                        }}
                      />
                    </div>
                    <ActorBriefingForm
                      studioId={studioId}
                      actorId={actor.id}
                      actorName={actor.name}
                      onInjectPrompt={(prompt) => updateActor(actor.id, { promptContent: prompt })}
                    />
                  </>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Canaux
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {studio.channels.map((channel) => (
                      <label
                        key={channel.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          padding: '8px 12px',
                          background: actor.channels.includes(channel.id)
                            ? 'rgba(91, 95, 199, 0.3)'
                            : 'transparent',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={actor.channels.includes(channel.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateActor(actor.id, { channels: [...actor.channels, channel.id] });
                            } else {
                              updateActor(actor.id, { channels: actor.channels.filter((c) => c !== channel.id) });
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>{channel.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => deleteActor(actor.id)}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(255, 107, 107, 0.2)',
                    border: '1px solid rgba(255, 107, 107, 0.5)',
                    color: '#ff6b6b',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)')}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}

        {/* PHASES TAB */}
        {activeTab === 'phases' && (
          <div style={{ maxWidth: 1000 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <h1 style={{ marginTop: 0, marginBottom: 0 }}>Phases</h1>
              <button
                onClick={addPhase}
                style={{
                  padding: '10px 16px',
                  background: '#5b5fc7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                + Ajouter une phase
              </button>
            </div>

            {studio.phases.map((phase, index) => (
              <div
                key={phase.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  marginBottom: 16,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => {
                    if (expandedPhases.has(phase.id)) {
                      setExpandedPhases((prev) => {
                        const next = new Set(prev);
                        next.delete(phase.id);
                        return next;
                      });
                    } else {
                      setExpandedPhases((prev) => new Set(prev).add(phase.id));
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 16,
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: expandedPhases.has(phase.id)
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{phase.title}</span>
                  <span>{expandedPhases.has(phase.id) ? '▼' : '▶'}</span>
                </button>

                {expandedPhases.has(phase.id) && (
                  <div style={{ padding: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Titre
                      </label>
                      <input
                        type="text"
                        value={phase.title}
                        onChange={(e) => updatePhase(phase.id, { title: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: 14,
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Objectif
                      </label>
                      <textarea
                        value={phase.objective}
                        onChange={(e) => updatePhase(phase.id, { objective: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: 14,
                          minHeight: 80,
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Canaux actifs
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {studio.channels.map((channel) => (
                          <label
                            key={channel.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                              padding: '8px 12px',
                              background: phase.activeChannels.includes(channel.id)
                                ? 'rgba(91, 95, 199, 0.3)'
                                : 'transparent',
                              borderRadius: '4px',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              transition: 'all 0.2s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={phase.activeChannels.includes(channel.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updatePhase(phase.id, {
                                    activeChannels: [...phase.activeChannels, channel.id],
                                  });
                                } else {
                                  updatePhase(phase.id, {
                                    activeChannels: phase.activeChannels.filter((c) => c !== channel.id),
                                  });
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <span>{channel.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Acteurs IA
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {aiActors.map((actor) => (
                          <label
                            key={actor.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                              padding: '8px 12px',
                              background: phase.aiActors.includes(actor.id)
                                ? 'rgba(91, 95, 199, 0.3)'
                                : 'transparent',
                              borderRadius: '4px',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              transition: 'all 0.2s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={phase.aiActors.includes(actor.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updatePhase(phase.id, { aiActors: [...phase.aiActors, actor.id] });
                                } else {
                                  updatePhase(phase.id, {
                                    aiActors: phase.aiActors.filter((a) => a !== actor.id),
                                  });
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <span>{actor.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* ── COMPÉTENCES CIBLES (bloc principal) ── */}
                    <div
                      style={{
                        marginBottom: 20,
                        background: 'rgba(91, 95, 199, 0.08)',
                        border: '1px solid rgba(91, 95, 199, 0.25)',
                        padding: 16,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <label style={{ fontSize: 14, fontWeight: 700, color: '#a5a8ff' }}>
                          Compétences cibles
                        </label>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                          Que doit apprendre, démontrer ou valider le joueur ?
                        </span>
                      </div>
                      {(phase.competencies || []).map((comp, ci) => (
                        <div key={ci} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                          <span style={{ color: '#a5a8ff', fontWeight: 700, fontSize: 13, minWidth: 20 }}>{ci + 1}.</span>
                          <input
                            type="text"
                            placeholder="Ex: Capacité à fixer un loyer cohérent en s'appuyant sur la grille"
                            value={comp}
                            onChange={(e) => {
                              const next = [...(phase.competencies || [])];
                              next[ci] = e.target.value;
                              updatePhase(phase.id, { competencies: next });
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#fff',
                              borderRadius: 4,
                              fontSize: 13,
                            }}
                          />
                          <button
                            onClick={() => {
                              const next = (phase.competencies || []).filter((_, i) => i !== ci);
                              updatePhase(phase.id, { competencies: next });
                            }}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(255,107,107,0.15)',
                              border: '1px solid rgba(255,107,107,0.4)',
                              color: '#ff6b6b',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: 11,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          updatePhase(phase.id, { competencies: [...(phase.competencies || []), ''] })
                        }
                        style={{
                          marginTop: 6,
                          padding: '6px 12px',
                          background: 'rgba(91,95,199,0.25)',
                          border: '1px solid rgba(91,95,199,0.4)',
                          color: '#a5a8ff',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        + Ajouter une compétence
                      </button>
                    </div>

                    {/* ── TRIGGER DE FIN DE PHASE ── */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Trigger de fin de phase
                      </label>
                      <span style={{ display: 'block', marginBottom: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                        Condition observable qui valide que les compétences ont été démontrées
                      </span>
                      <textarea
                        value={phase.completionTrigger || ''}
                        onChange={(e) => updatePhase(phase.id, { completionTrigger: e.target.value })}
                        placeholder="Ex: Le joueur a proposé un loyer entre 1700 et 2300 EUR avec justification chiffrée, et le client a accepté."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#fff',
                          borderRadius: 6,
                          fontSize: 14,
                          minHeight: 70,
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    {/* ── SCORING SECONDAIRE (collapsible) ── */}
                    <details style={{ marginBottom: 20 }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.6)',
                          padding: '8px 0',
                          userSelect: 'none',
                        }}
                      >
                        Scoring et critères secondaires (optionnel)
                      </summary>
                      <div style={{ padding: '12px 0 0' }}>
                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 6, marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                              Critères de scoring
                            </label>
                            <button
                              onClick={() => {
                                const newCriteria: Criteria = { description: '', points: 0 };
                                updatePhase(phase.id, { criteria: [...phase.criteria, newCriteria] });
                              }}
                              style={{
                                padding: '3px 6px',
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                color: 'rgba(255,255,255,0.6)',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                              }}
                            >
                              +
                            </button>
                          </div>
                          {phase.criteria.map((criterion, criteriaIndex) => (
                            <div
                              key={criteriaIndex}
                              style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}
                            >
                              <input
                                type="text"
                                placeholder="Description du critère"
                                value={criterion.description}
                                onChange={(e) => {
                                  const newCriteria = [...phase.criteria];
                                  newCriteria[criteriaIndex].description = e.target.value;
                                  updatePhase(phase.id, { criteria: newCriteria });
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 8px',
                                  background: 'rgba(255,255,255,0.08)',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  color: '#fff',
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                              />
                              <input
                                type="number"
                                placeholder="Pts"
                                value={criterion.points}
                                onChange={(e) => {
                                  const newCriteria = [...phase.criteria];
                                  newCriteria[criteriaIndex].points = parseInt(e.target.value) || 0;
                                  updatePhase(phase.id, { criteria: newCriteria });
                                }}
                                style={{
                                  width: 60,
                                  padding: '6px 8px',
                                  background: 'rgba(255,255,255,0.08)',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  color: '#fff',
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                              />
                              <button
                                onClick={() =>
                                  updatePhase(phase.id, { criteria: phase.criteria.filter((_, i) => i !== criteriaIndex) })
                                }
                                style={{
                                  padding: '3px 6px',
                                  background: 'rgba(255,107,107,0.15)',
                                  border: '1px solid rgba(255,107,107,0.3)',
                                  color: '#ff6b6b',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: 11,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                              Score minimum (optionnel)
                            </label>
                            <input
                              type="number"
                              value={phase.completionRules?.minScore || 0}
                              onChange={(e) =>
                                updatePhase(phase.id, {
                                  completionRules: {
                                    ...phase.completionRules,
                                    minScore: parseInt(e.target.value) || 0,
                                  },
                                })
                              }
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: '#fff',
                                borderRadius: 4,
                                fontSize: 13,
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                              Échanges max
                            </label>
                            <input
                              type="number"
                              value={phase.completionRules?.maxExchanges || 100}
                              onChange={(e) =>
                                updatePhase(phase.id, {
                                  completionRules: {
                                    ...phase.completionRules,
                                    maxExchanges: parseInt(e.target.value) || 100,
                                  },
                                })
                              }
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: '#fff',
                                borderRadius: 4,
                                fontSize: 13,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </details>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={phase.autoAdvance}
                          onChange={(e) => updatePhase(phase.id, { autoAdvance: e.target.checked })}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Avance automatique</span>
                      </label>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Mode d'interaction
                      </label>
                      <select
                        value={phase.interactionMode}
                        onChange={(e) =>
                          updatePhase(phase.id, {
                            interactionMode: e.target.value as 'chat' | 'presentation' | 'voice_qa',
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: 14,
                        }}
                      >
                        <option value="chat">Chat</option>
                        <option value="presentation">Présentation</option>
                        <option value="voice_qa">Questions/Réponses Voix</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                        Message d'introduction
                      </label>
                      <textarea
                        value={phase.introMessage}
                        onChange={(e) => updatePhase(phase.id, { introMessage: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: 14,
                          minHeight: 80,
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => movePhaseUp(index)}
                          disabled={index === 0}
                          style={{
                            padding: '8px 12px',
                            background: index === 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: index === 0 ? 'rgba(255, 255, 255, 0.3)' : '#fff',
                            borderRadius: '6px',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                          }}
                        >
                          ↑ Monter
                        </button>
                        <button
                          onClick={() => movePhaseDown(index)}
                          disabled={index === studio.phases.length - 1}
                          style={{
                            padding: '8px 12px',
                            background: index === studio.phases.length - 1 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: index === studio.phases.length - 1 ? 'rgba(255, 255, 255, 0.3)' : '#fff',
                            borderRadius: '6px',
                            cursor: index === studio.phases.length - 1 ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                          }}
                        >
                          ↓ Descendre
                        </button>
                      </div>
                      <button
                        onClick={() => deletePhase(phase.id)}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255, 107, 107, 0.2)',
                          border: '1px solid rgba(255, 107, 107, 0.5)',
                          color: '#ff6b6b',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: 14,
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)')}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <h1 style={{ marginTop: 0, marginBottom: 0 }}>Documents</h1>
              <button
                onClick={addDocument}
                style={{
                  padding: '10px 16px',
                  background: '#5b5fc7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                + Ajouter un document
              </button>
            </div>

            {studio.documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: 16,
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Libellé
                  </label>
                  <input
                    type="text"
                    value={doc.label}
                    onChange={(e) => updateDocument(doc.id, { label: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Fichier (ou contenu texte)
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      marginBottom: 12,
                      padding: '12px',
                      background: 'rgba(91, 95, 199, 0.1)',
                      borderRadius: '6px',
                      border: '2px dashed rgba(91, 95, 199, 0.3)',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="file"
                      onChange={(e) => handleFileUpload(e, doc.id)}
                      style={{
                        flex: 1,
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  {doc.filePath && (
                    <div style={{ marginBottom: 12, fontSize: 12, color: '#51cf66' }}>
                      Fichier: {doc.filePath}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Contenu textuel
                  </label>
                  <textarea
                    value={doc.content || ''}
                    onChange={(e) => updateDocument(doc.id, { content: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                      minHeight: 120,
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Tags
                  </label>
                  <CommaListInput
                    value={doc.contains}
                    onChange={(contains) => updateDocument(doc.id, { contains })}
                    placeholder="tag1, tag2"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                    }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
                  <input
                    type="checkbox"
                    checked={doc.usableAsAttachment}
                    onChange={(e) => updateDocument(doc.id, { usableAsAttachment: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Utilisable comme pièce jointe</span>
                </label>

                <button
                  onClick={() => deleteDocument(doc.id)}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(255, 107, 107, 0.2)',
                    border: '1px solid rgba(255, 107, 107, 0.5)',
                    color: '#ff6b6b',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)')}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ENDINGS TAB */}
        {activeTab === 'endings' && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <h1 style={{ marginTop: 0, marginBottom: 0 }}>Fins</h1>
              <button
                onClick={addEnding}
                style={{
                  padding: '10px 16px',
                  background: '#5b5fc7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                + Ajouter une fin
              </button>
            </div>

            {studio.endings.map((ending) => (
              <div
                key={ending.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: 16,
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Libellé
                  </label>
                  <input
                    type="text"
                    value={ending.label}
                    onChange={(e) => updateEnding(ending.id, { label: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Contenu
                  </label>
                  <textarea
                    value={ending.content}
                    onChange={(e) => updateEnding(ending.id, { content: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                      minHeight: 120,
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                      Priorité
                    </label>
                    <input
                      type="number"
                      value={ending.priority}
                      onChange={(e) => updateEnding(ending.id, { priority: parseInt(e.target.value) || 0 })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: 14,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                      Score minimum
                    </label>
                    <input
                      type="number"
                      value={ending.conditions?.minScore || 0}
                      onChange={(e) =>
                        updateEnding(ending.id, {
                          conditions: {
                            ...ending.conditions,
                            minScore: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: 14,
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                    Flags (séparés par des virgules)
                  </label>
                  <CommaListInput
                    value={ending.conditions?.coreFlags || []}
                    onChange={(coreFlags) =>
                      updateEnding(ending.id, {
                        conditions: {
                          ...ending.conditions,
                          coreFlags,
                        },
                      })
                    }
                    placeholder="flag1, flag2"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: 14,
                    }}
                  />
                </div>

                <button
                  onClick={() => deleteEnding(ending.id)}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(255, 107, 107, 0.2)',
                    border: '1px solid rgba(255, 107, 107, 0.5)',
                    color: '#ff6b6b',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)')}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}

        {/* REVIEW TAB — AI audit + 5 patch actions */}
        {activeTab === 'review' && (
          <AIReviewPanel
            studioId={studioId}
            onApplyPatch={(proposed) => {
              // Merge preserving local shape; runtime compat already checked server-side.
              setStudio((prev) => (prev ? ({ ...prev, ...(proposed as any) } as StudioData) : prev));
            }}
          />
        )}

        {/* JSON PREVIEW TAB */}
        {activeTab === 'json' && (
          <div style={{ maxWidth: 1000 }}>
            <h1 style={{ marginTop: 0, marginBottom: 24 }}>Aperçu JSON</h1>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <button
                onClick={handleCompile}
                style={{
                  padding: '10px 16px',
                  background: '#5b5fc7',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Compiler
              </button>
              <button
                onClick={handleValidate}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              >
                Valider
              </button>
              <button
                onClick={openTest}
                disabled={!compilationResult?.success}
                style={{
                  padding: '10px 16px',
                  background: compilationResult?.success ? '#51cf66' : 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: compilationResult?.success ? '#000' : 'rgba(255, 255, 255, 0.3)',
                  borderRadius: '6px',
                  cursor: compilationResult?.success ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                Tester le scénario
              </button>
            </div>

            {validationResult && (
              <div
                style={{
                  background:
                    validationResult.success === false
                      ? 'rgba(255, 107, 107, 0.1)'
                      : 'rgba(81, 207, 102, 0.1)',
                  border:
                    validationResult.success === false
                      ? '1px solid rgba(255, 107, 107, 0.3)'
                      : '1px solid rgba(81, 207, 102, 0.3)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    color:
                      validationResult.success === false ? '#ff6b6b' : '#51cf66',
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  {validationResult.success === false
                    ? '✗ Validation échouée'
                    : '✓ Validation réussie'}
                </div>
                {validationResult.errors && (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validationResult.errors.map((err: string, i: number) => (
                      <li key={i} style={{ fontSize: 12, opacity: 0.8 }}>
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
                {validationResult.warnings && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, color: '#ffd43b' }}>
                    {validationResult.warnings.map((warn: string, i: number) => (
                      <li key={i} style={{ fontSize: 12, opacity: 0.8 }}>
                        {warn}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {compilationResult && (
              <div
                style={{
                  background:
                    compilationResult.success === false
                      ? 'rgba(255, 107, 107, 0.1)'
                      : 'rgba(81, 207, 102, 0.1)',
                  border:
                    compilationResult.success === false
                      ? '1px solid rgba(255, 107, 107, 0.3)'
                      : '1px solid rgba(81, 207, 102, 0.3)',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    color:
                      compilationResult.success === false ? '#ff6b6b' : '#51cf66',
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  {compilationResult.success === false
                    ? '✗ Compilation échouée'
                    : '✓ Compilation réussie'}
                </div>
                {compilationResult.errors && (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {compilationResult.errors.map((err: string, i: number) => (
                      <li key={i} style={{ fontSize: 12, opacity: 0.8 }}>
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                overflow: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'Courier New, monospace',
                  fontSize: 12,
                  color: '#a8aaca',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(studio, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Copilote intégré — borné au scénario courant, lie à l'onglet actif */}
      <AssistantDock
        studioId={studioId}
        activeTab={activeTab}
        onApplyFill={(fields) => {
          setStudio((prev) => {
            if (!prev) return prev;
            const { result, report } = applyAssignments(
              prev as unknown as Record<string, unknown>,
              fields.map((f) => ({ path: f.path, value: f.value })),
            );
            if (report.skipped.length > 0) {
              console.warn('[assistant fill] skipped:', report.skipped);
            }
            return result as unknown as StudioData;
          });
        }}
        onApplyPatch={(proposed) => {
          setStudio((prev) =>
            prev ? ({ ...prev, ...(proposed as any) } as StudioData) : prev,
          );
        }}
      />
    </div>
  );
}
