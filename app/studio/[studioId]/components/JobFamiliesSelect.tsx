'use client';

/**
 * JobFamiliesSelect — multi-select chip UI bound to the global referential.
 * Fetches /api/job-families and lets the user toggle families on/off for
 * the current studio scenario.
 */

import { useEffect, useState } from 'react';

interface JobFamily {
  id: string;
  label: string;
  active: boolean;
}

export default function JobFamiliesSelect({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [families, setFamilies] = useState<JobFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/job-families', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Erreur');
        setFamilies((data.families || []).filter((f: JobFamily) => f.active));
      } catch (e: any) {
        setError(e?.message || 'Erreur chargement familles');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: string) => {
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  };

  if (loading)
    return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Chargement…</div>;
  if (error)
    return (
      <div style={{ fontSize: 12, color: '#ff8a80' }}>{error}</div>
    );
  if (families.length === 0)
    return (
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
        Aucune famille active. Créez-en depuis la console admin.
      </div>
    );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {families.map((f) => {
        const on = selectedIds.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: on ? '1px solid #5b5fc7' : '1px solid rgba(255,255,255,0.2)',
              background: on ? 'rgba(91,95,199,0.25)' : 'rgba(255,255,255,0.04)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {on ? '✓ ' : ''}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
