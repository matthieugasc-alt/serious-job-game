"use client";

/**
 * /admin/competencies — Z2 CRUD référentiel compétences.
 * super_admin only.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Competency {
  id: string;
  label: string;
  description: string;
  archived?: boolean;
}

export default function CompetenciesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Competency | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (!token || role !== "super_admin") { router.push("/"); return; }
    reload(token);
  }, [router]);

  function reload(token: string | null = localStorage.getItem("auth_token")) {
    setLoading(true);
    fetch("/api/admin/competencies", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setItems(d.competencies ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  async function upsert(c: Competency) {
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/admin/competencies", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "upsert", competency: c }),
    });
    if (!r.ok) { setError((await r.json()).error); return; }
    setEditing(null); setCreating(false);
    reload();
  }

  async function toggleArchive(id: string, archive: boolean) {
    const token = localStorage.getItem("auth_token");
    await fetch("/api/admin/competencies", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: archive ? "archive" : "unarchive", id }),
    });
    reload();
  }

  if (loading) return <div style={pageStyle}>Chargement…</div>;

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Référentiel de compétences</h1>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>{items.filter((c) => !c.archived).length} actives · {items.filter((c) => c.archived).length} archivées</div>
        </div>
        <button onClick={() => setCreating(true)} style={ctaStyle}>+ Nouvelle compétence</button>
      </header>

      {error ? <div style={{ ...cardStyle, borderColor: "#c62828", marginBottom: 12 }}>{error}</div> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((c) => (
          <div key={c.id} style={{ ...cardStyle, opacity: c.archived ? 0.5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{c.id}</div>
                <div style={{ fontSize: 12, color: "#374151", marginTop: 6 }}>{c.description}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditing(c)} style={smallBtn}>éditer</button>
                <button onClick={() => toggleArchive(c.id, !c.archived)} style={smallBtn}>
                  {c.archived ? "restaurer" : "archiver"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) ? (
        <EditModal
          competency={editing ?? { id: "", label: "", description: "" }}
          onSave={upsert}
          onCancel={() => { setEditing(null); setCreating(false); }}
          isNew={creating}
        />
      ) : null}
    </div>
  );
}

function EditModal({ competency, onSave, onCancel, isNew }: {
  competency: Competency;
  onSave: (c: Competency) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [id, setId] = useState(competency.id);
  const [label, setLabel] = useState(competency.label);
  const [description, setDescription] = useState(competency.description);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#fff", padding: 24, borderRadius: 8, width: 500 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>{isNew ? "Nouvelle compétence" : `Éditer "${competency.label}"`}</h2>
        <label style={labelStyle}>id (snake_case, immuable)</label>
        <input value={id} onChange={(e) => setId(e.target.value)} disabled={!isNew} style={inputStyle} />
        <label style={labelStyle}>Label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
        <label style={labelStyle}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={inputStyle} />
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={smallBtn}>Annuler</button>
          <button onClick={() => onSave({ id, label, description })} style={ctaStyle}>Sauvegarder</button>
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: 32, background: "#f8f9fc", fontFamily: "Segoe UI, sans-serif" };
const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, marginTop: 12, marginBottom: 4, color: "#374151", fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "inherit", boxSizing: "border-box" };
const ctaStyle: React.CSSProperties = { padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" };
const smallBtn: React.CSSProperties = { padding: "4px 10px", fontSize: 11, background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", color: "#374151" };
