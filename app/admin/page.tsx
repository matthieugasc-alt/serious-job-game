"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════
// ADMIN PAGE — Scenario creation & management
// ═══════════════════════════════════════════════════════════════════

type Step = "idle" | "uploading" | "extracting" | "converting" | "done" | "error";

interface ScenarioConfig {
  id: string;
  scenario_id: string;
  adminLocked?: boolean;
  lockMessage?: string;
  prerequisites?: string[];
  categoryOverride?: string;
  sortOrder?: number;
  featured?: boolean;
}

interface Scenario {
  id: string;
  scenario_id: string;
  title: string;
  subtitle: string;
  difficulty: string;
  job_family?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"conversion" | "management" | "editor" | "studio" | "organizations">("conversion");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversion state
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [scenarioJson, setScenarioJson] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Scenario management state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [configs, setConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [editingConfigs, setEditingConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [savingConfigs, setSavingConfigs] = useState<Record<string, boolean>>({});

  // AI Editor state
  const [editorScenarioId, setEditorScenarioId] = useState<string | null>(null);
  const [editorInput, setEditorInput] = useState("");
  const [editorMessages, setEditorMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [editorPendingChanges, setEditorPendingChanges] = useState<any[] | null>(null);
  const [editorSending, setEditorSending] = useState(false);
  const [editorApplying, setEditorApplying] = useState(false);
  const editorChatEndRef = useRef<HTMLDivElement>(null);

  // Studio state
  interface StudioScenario {
    id: string;
    title: string;
    status: string;
    updatedAt?: string;
    jobFamilies?: string[];
    isTeaserVisible?: boolean;
  }
  interface JobFamilyRow {
    id: string;
    label: string;
    active: boolean;
    order?: number;
  }
  const [studioScenarios, setStudioScenarios] = useState<StudioScenario[]>([]);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState("");
  const [studioShowModal, setStudioShowModal] = useState(false);
  const [studioModalTitle, setStudioModalTitle] = useState("");
  const [studioModalTags, setStudioModalTags] = useState("");
  const [studioCreating, setStudioCreating] = useState(false);
  const [studioDeleting, setStudioDeleting] = useState<string | null>(null);
  const [studioDeleteConfirm, setStudioDeleteConfirm] = useState<string | null>(null);
  // Job families referential
  const [jobFamilies, setJobFamilies] = useState<JobFamilyRow[]>([]);
  const [jobFamiliesLoading, setJobFamiliesLoading] = useState(false);
  const [jobFamiliesError, setJobFamiliesError] = useState("");
  const [newFamilyLabel, setNewFamilyLabel] = useState("");
  const [newFamilyId, setNewFamilyId] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>("all"); // "all" | familyId

  useEffect(() => {
    const role = localStorage.getItem("user_role");
    const name = localStorage.getItem("user_name");
    const token = localStorage.getItem("auth_token");
    if (!name || !role) {
      router.push("/login");
      return;
    }
    // Allow super_admin access (legacy 'admin' role also accepted during migration)
    if (role !== "super_admin" && role !== "admin") {
      router.push("/");
      return;
    }
    setUserRole(role);
    setUserToken(token);
    setLoading(false);
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      setScenariosLoading(true);
      const [scenariosRes, configsRes] = await Promise.all([
        fetch("/api/scenarios"),
        fetch("/api/admin/scenario-config"),
      ]);

      if (scenariosRes.ok) {
        const data = await scenariosRes.json();
        setScenarios(data.scenarios || []);
      }

      if (configsRes.ok) {
        const data = await configsRes.json();
        const configMap: Record<string, ScenarioConfig> = {};
        (data.configs || []).forEach((cfg: any) => {
          const mapped: ScenarioConfig = {
            id: cfg.scenarioId || cfg.scenario_id,
            scenario_id: cfg.scenarioId || cfg.scenario_id,
            adminLocked: cfg.adminLocked,
            lockMessage: cfg.lockMessage,
            prerequisites: cfg.prerequisites,
            categoryOverride: cfg.category,
            sortOrder: cfg.order,
            featured: cfg.featured,
          };
          configMap[mapped.scenario_id] = mapped;
        });
        setConfigs(configMap);
      }
    } catch (err: any) {
      console.error("Failed to load scenarios:", err);
    } finally {
      setScenariosLoading(false);
    }
  };

  // ── Studio helpers ──────────────────────────────────────────────
  const loadStudioScenarios = async () => {
    try {
      setStudioLoading(true);
      setStudioError("");
      const res = await fetch("/api/studio", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load studio scenarios");
      const data = await res.json();
      setStudioScenarios(data.scenarios || []);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setStudioLoading(false);
    }
  };

  const handleStudioCreate = async () => {
    if (!studioModalTitle.trim()) {
      setStudioError("Le titre est requis");
      return;
    }
    try {
      setStudioCreating(true);
      setStudioError("");
      const tags = studioModalTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: studioModalTitle.trim(), tags }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Échec de la création");
      const createdId = data.scenario?.id;
      if (!createdId) throw new Error("ID manquant dans la réponse");
      setStudioShowModal(false);
      setStudioModalTitle("");
      setStudioModalTags("");
      router.push(`/studio/${createdId}`);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setStudioCreating(false);
    }
  };

  const handleStudioDelete = async (id: string) => {
    try {
      setStudioDeleting(id);
      setStudioError("");
      const res = await fetch(`/api/studio/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      setStudioScenarios((prev) => prev.filter((s) => s.id !== id));
      setStudioDeleteConfirm(null);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setStudioDeleting(null);
    }
  };

  const formatStudioDate = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  };

  const getStudioStatusBadge = (status: string) => {
    const colors: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: "rgba(234,179,8,0.2)", color: "#eab308", label: "Brouillon" },
      compiled: { bg: "rgba(59,130,246,0.2)", color: "#3b82f6", label: "Compilé" },
      published: { bg: "rgba(34,197,94,0.2)", color: "#22c55e", label: "Publié" },
      error: { bg: "rgba(239,68,68,0.2)", color: "#ef4444", label: "Erreur" },
    };
    const c = colors[status] || colors.draft;
    return c;
  };

  // ── Job families CRUD ───────────────────────────────────────────
  const loadJobFamilies = async () => {
    try {
      setJobFamiliesLoading(true);
      setJobFamiliesError("");
      const res = await fetch("/api/job-families", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setJobFamilies(data.families || []);
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setJobFamiliesLoading(false);
    }
  };

  const handleCreateJobFamily = async () => {
    const label = newFamilyLabel.trim();
    if (!label) {
      setJobFamiliesError("Label requis");
      return;
    }
    const id =
      newFamilyId.trim() ||
      label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    try {
      setJobFamiliesError("");
      const res = await fetch("/api/job-families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, label, active: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setNewFamilyLabel("");
      setNewFamilyId("");
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleToggleJobFamily = async (id: string, active: boolean) => {
    try {
      setJobFamiliesError("");
      const res = await fetch(`/api/job-families/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Erreur");
      }
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleRenameJobFamily = async (id: string, label: string) => {
    if (!label.trim()) return;
    try {
      setJobFamiliesError("");
      const res = await fetch(`/api/job-families/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Erreur");
      }
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleDeleteJobFamily = async (id: string) => {
    if (!confirm(`Supprimer la famille "${id}" ? Les scénarios qui l'utilisent ne seront pas modifiés automatiquement.`))
      return;
    try {
      setJobFamiliesError("");
      const res = await fetch(`/api/job-families/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Erreur");
      }
      await loadJobFamilies();
    } catch (err) {
      setJobFamiliesError(err instanceof Error ? err.message : "Erreur");
    }
  };

  // Load studio scenarios + families when switching to studio tab
  useEffect(() => {
    if (activeSection === "studio") {
      loadStudioScenarios();
      loadJobFamilies();
    }
  }, [activeSection]);

  // ── File upload handler ────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Seuls les fichiers PDF sont acceptes.");
      setStep("error");
      return;
    }

    setStep("uploading");
    setErrorMsg("");
    setScenarioJson(null);
    setSaveSuccess(false);

    try {
      setStep("extracting");

      const formData = new FormData();
      formData.append("file", file);

      setStep("converting");

      const res = await fetch("/api/admin/convert", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur de conversion");
      }

      setScenarioJson(data.scenario);
      setStep("done");
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur inconnue");
      setStep("error");
    }
  }, []);

  // ── Drag & Drop handlers ───────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  // ── Save scenario ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!scenarioJson) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/save-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioJson }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur de sauvegarde");
      }
      setSaveSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Download JSON ──────────────────────────────────────────────
  const handleDownloadJson = () => {
    if (!scenarioJson) return;
    const blob = new Blob([JSON.stringify(scenarioJson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenarioJson.scenario_id || "scenario"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Scenario config management ──────────────────────────────────
  // Priority chain: in-progress edits → persisted server state → blank defaults.
  // BUG FIX: previously this jumped straight from `editingConfigs` to blank
  // defaults (always adminLocked=false), which meant:
  //   (1) the UI always rendered unchecked after a save, even when the server
  //       had adminLocked=true, and
  //   (2) any subsequent field toggle started from blank defaults, silently
  //       wiping featured/lockMessage/prerequisites/sortOrder/categoryOverride.
  // As a result, "décocher" would first have to re-check (because the UI was
  // out of sync), and the persisted locked state was never cleared on reload.
  const getEditingConfig = (scenarioId: string): ScenarioConfig => {
    if (editingConfigs[scenarioId]) return editingConfigs[scenarioId];
    if (configs[scenarioId]) return configs[scenarioId];
    return {
      id: scenarioId,
      scenario_id: scenarioId,
      adminLocked: false,
      lockMessage: "",
      prerequisites: [],
      categoryOverride: "",
      sortOrder: 0,
      featured: false,
    };
  };

  const handleConfigChange = (
    scenarioId: string,
    field: keyof ScenarioConfig,
    value: any
  ) => {
    const current = getEditingConfig(scenarioId);
    setEditingConfigs((prev) => ({
      ...prev,
      [scenarioId]: { ...current, [field]: value },
    }));
  };

  const handleSaveConfig = async (scenarioId: string) => {
    if (!userToken) return;

    setSavingConfigs((prev) => ({ ...prev, [scenarioId]: true }));
    try {
      const config = getEditingConfig(scenarioId);

      // Explicit boolean coercion — NEVER send undefined for these fields.
      // This guarantees both `true` and `false` are transmitted as-is.
      const payload = {
        scenarioId: config.scenario_id,
        adminLocked: config.adminLocked === true, // strict boolean, not ?? false
        lockMessage: config.lockMessage ?? "",
        prerequisites: Array.isArray(config.prerequisites) ? config.prerequisites : [],
        category: config.categoryOverride ?? "",
        order: typeof config.sortOrder === "number" ? config.sortOrder : 0,
        featured: config.featured === true,
      };

      const res = await fetch("/api/admin/scenario-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Erreur lors de la sauvegarde (${res.status}): ${errText}`);
      }

      // Clear the editing buffer for this scenario, then re-fetch from the
      // server so the UI reflects exactly what was persisted (no guessing).
      setEditingConfigs((prev) => {
        const next = { ...prev };
        delete next[scenarioId];
        return next;
      });
      await loadScenarios();
    } catch (err: any) {
      console.error("Save config error:", err);
      alert(err?.message || "Erreur lors de la sauvegarde de la configuration");
    } finally {
      setSavingConfigs((prev) => ({ ...prev, [scenarioId]: false }));
    }
  };

  // ── Loading / Auth guard ───────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        Chargement...
      </div>
    );
  }

  if (userRole !== "admin") return null;

  // ── Step indicator ─────────────────────────────────────────────
  const stepLabel: Record<Step, string> = {
    idle: "",
    uploading: "Envoi du fichier...",
    extracting: "Extraction du texte...",
    converting: "Conversion IA en cours... (cela peut prendre 30-60 secondes)",
    done: "Conversion terminee !",
    error: "Erreur",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        padding: "28px 20px 40px",
        fontFamily: "Segoe UI, sans-serif",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(91, 95, 199, 0.3)",
                  color: "#a5a8ff",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Admin
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Espace Administrateur</h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              Créez et gérez vos scénarios de jeu sérieux
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            Retour à l'accueil
          </button>
        </div>

        {/* Navigation tabs */}
        <div
          style={{
            display: "flex",
            gap: 24,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            marginBottom: 32,
          }}
        >
          <button
            onClick={() => setActiveSection("conversion")}
            style={{
              padding: "12px 0",
              fontSize: 16,
              fontWeight: activeSection === "conversion" ? 700 : 500,
              color: activeSection === "conversion" ? "#a5a8ff" : "rgba(255,255,255,0.6)",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeSection === "conversion" ? "2px solid #5b5fc7" : "none",
              transition: "all 0.2s",
            }}
          >
            📄 Conversion PDF
          </button>
          <button
            onClick={() => setActiveSection("management")}
            style={{
              padding: "12px 0",
              fontSize: 16,
              fontWeight: activeSection === "management" ? 700 : 500,
              color: activeSection === "management" ? "#a5a8ff" : "rgba(255,255,255,0.6)",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeSection === "management" ? "2px solid #5b5fc7" : "none",
              transition: "all 0.2s",
            }}
          >
            ⚙️ Gestion des scénarios
          </button>
          <button
            onClick={() => setActiveSection("editor")}
            style={{
              padding: "12px 0",
              fontSize: 16,
              fontWeight: activeSection === "editor" ? 700 : 500,
              color: activeSection === "editor" ? "#a5a8ff" : "rgba(255,255,255,0.6)",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeSection === "editor" ? "2px solid #5b5fc7" : "none",
              transition: "all 0.2s",
            }}
          >
            🤖 Éditeur IA
          </button>
          <button
            onClick={() => setActiveSection("studio")}
            style={{
              padding: "12px 0",
              fontSize: 16,
              fontWeight: activeSection === "studio" ? 700 : 500,
              color: activeSection === "studio" ? "#a5a8ff" : "rgba(255,255,255,0.6)",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeSection === "studio" ? "2px solid #5b5fc7" : "none",
              transition: "all 0.2s",
            }}
          >
            🎬 Scenario Studio
          </button>
          {(userRole as string) === "super_admin" && (
            <button
              onClick={() => setActiveSection("organizations")}
              style={{
                padding: "12px 0",
                fontSize: 16,
                fontWeight: activeSection === "organizations" ? 700 : 500,
                color: activeSection === "organizations" ? "#a5a8ff" : "rgba(255,255,255,0.6)",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderBottom: activeSection === "organizations" ? "2px solid #5b5fc7" : "none",
                transition: "all 0.2s",
              }}
            >
              🏢 Organisations
            </button>
          )}
        </div>

        {/* Conversion Section */}
        {activeSection === "conversion" && (
          <>
            {/* Two column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
          {/* ── Guide Card ── */}
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: 28,
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📖</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Guide de creation</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, flex: 1 }}>
              Telechargez le guide complet qui explique comment structurer votre scenario au format PDF.
              Il contient la checklist de tous les elements necessaires : acteurs, phases, competences,
              interruptions, configuration mail, etc.
            </p>
            <a
              href="/guide_creation_scenario.pdf"
              download
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 24px",
                background: "#5b5fc7",
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                transition: "background 0.2s",
                alignSelf: "flex-start",
              }}
            >
              Telecharger le guide PDF
            </a>
          </div>

          {/* ── Process Card ── */}
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: 28,
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Comment ca marche ?</h2>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, flex: 1 }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong style={{ color: "rgba(255,255,255,0.9)" }}>1.</strong> Telechargez et lisez le guide
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <strong style={{ color: "rgba(255,255,255,0.9)" }}>2.</strong> Redigez votre scenario dans un PDF en suivant la structure
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <strong style={{ color: "rgba(255,255,255,0.9)" }}>3.</strong> Glissez-deposez votre PDF ci-dessous
              </p>
              <p style={{ margin: 0 }}>
                <strong style={{ color: "rgba(255,255,255,0.9)" }}>4.</strong> L'IA convertit automatiquement en JSON jouable
              </p>
            </div>
          </div>
        </div>

        {/* ── Drop Zone ── */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => step === "idle" || step === "error" || step === "done" ? fileInputRef.current?.click() : null}
          style={{
            background: dragOver
              ? "rgba(91, 95, 199, 0.2)"
              : step === "done"
                ? "rgba(22, 163, 74, 0.1)"
                : step === "error"
                  ? "rgba(220, 38, 38, 0.1)"
                  : "rgba(255,255,255,0.04)",
            borderRadius: 16,
            padding: "48px 24px",
            border: `2px dashed ${
              dragOver
                ? "#5b5fc7"
                : step === "done"
                  ? "#16a34a"
                  : step === "error"
                    ? "#dc2626"
                    : "rgba(255,255,255,0.15)"
            }`,
            textAlign: "center",
            cursor:
              step === "idle" || step === "error" || step === "done"
                ? "pointer"
                : "default",
            transition: "all 0.3s",
            marginBottom: 24,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          {step === "idle" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.6 }}>📄</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>
                Glissez-deposez votre scenario PDF ici
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                ou cliquez pour selectionner un fichier
              </p>
            </>
          )}

          {(step === "uploading" || step === "extracting" || step === "converting") && (
            <>
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: "3px solid rgba(255,255,255,0.15)",
                  borderTopColor: "#5b5fc7",
                  borderRadius: "50%",
                  animation: "spin .8s linear infinite",
                  margin: "0 auto 16px",
                }}
              />
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>
                {stepLabel[step]}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                Claude analyse votre document et genere le JSON...
              </p>
            </>
          )}

          {step === "done" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#4ade80" }}>
                Scenario converti avec succes !
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                Cliquez pour convertir un autre fichier
              </p>
            </>
          )}

          {step === "error" && (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#f87171" }}>
                Erreur de conversion
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                {errorMsg}
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Cliquez pour reessayer
              </p>
            </>
          )}
        </div>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* ── Result Panel ── */}
        {scenarioJson && step === "done" && (
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: 24,
              border: "1px solid rgba(255,255,255,0.1)",
              marginBottom: 24,
            }}
          >
            {/* Title & meta */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>
                  {scenarioJson.meta?.title || scenarioJson.scenario_id}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  {scenarioJson.phases?.length || 0} phases &middot;{" "}
                  {scenarioJson.actors?.length || 0} acteurs &middot;{" "}
                  {scenarioJson.meta?.estimated_duration_min || "?"} min &middot;{" "}
                  {scenarioJson.meta?.difficulty || "?"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleDownloadJson}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(255,255,255,0.1)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Telecharger JSON
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || saveSuccess}
                  style={{
                    padding: "8px 16px",
                    background: saveSuccess ? "#16a34a" : "#5b5fc7",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving || saveSuccess ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saveSuccess
                    ? "Sauvegarde !"
                    : saving
                      ? "Sauvegarde..."
                      : "Deployer le scenario"}
                </button>
              </div>
            </div>

            {/* JSON preview */}
            <div
              style={{
                background: "rgba(0,0,0,0.3)",
                borderRadius: 8,
                padding: 16,
                maxHeight: 400,
                overflowY: "auto",
                fontSize: 11,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(scenarioJson, null, 2)}
            </div>
          </div>
        )}
          </>
        )}

        {/* Management Section */}
        {activeSection === "management" && (
          <div>
            {scenariosLoading ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.6)" }}>
                Chargement des scénarios...
              </div>
            ) : scenarios.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.6)" }}>
                Aucun scénario disponible
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
                  gap: 24,
                }}
              >
                {scenarios.map((scenario) => {
                  const config = getEditingConfig(scenario.scenario_id);
                  const isSaving = savingConfigs[scenario.scenario_id];

                  return (
                    <div
                      key={scenario.scenario_id}
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 16,
                        padding: 24,
                        border: "1px solid rgba(255,255,255,0.1)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                      }}
                    >
                      {/* Header */}
                      <div>
                        <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>
                          {scenario.title}
                        </h3>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            color: "rgba(255,255,255,0.6)",
                          }}
                        >
                          {scenario.subtitle}
                        </p>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 12,
                              padding: "3px 8px",
                              background: "rgba(91,95,199,0.2)",
                              color: "#a5a8ff",
                              borderRadius: 4,
                            }}
                          >
                            {scenario.job_family || "Autre"}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              padding: "3px 8px",
                              background: "rgba(255,255,255,0.1)",
                              color: "rgba(255,255,255,0.7)",
                              borderRadius: 4,
                            }}
                          >
                            {scenario.difficulty}
                          </span>
                        </div>
                      </div>

                      {/* Status */}
                      <div
                        style={{
                          padding: 12,
                          background: "rgba(0,0,0,0.2)",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "rgba(255,255,255,0.7)",
                        }}
                      >
                        {config.adminLocked ? (
                          <div>
                            🔧 <strong>Verrouillé</strong> - En cours de développement
                          </div>
                        ) : config.prerequisites && config.prerequisites.length > 0 ? (
                          <div>
                            🔒 {config.prerequisites.length} prérequis
                          </div>
                        ) : (
                          <div>✅ Accessible</div>
                        )}
                      </div>

                      {/* Lock toggle */}
                      <div>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={config.adminLocked || false}
                            onChange={(e) =>
                              handleConfigChange(
                                scenario.scenario_id,
                                "adminLocked",
                                e.target.checked
                              )
                            }
                            style={{
                              width: 18,
                              height: 18,
                              cursor: "pointer",
                              accentColor: "#5b5fc7",
                            }}
                          />
                          Verrouiller ce scénario
                        </label>
                        {config.adminLocked && (
                          <input
                            type="text"
                            placeholder="Message de verrouillage (optionnel)"
                            value={config.lockMessage || ""}
                            onChange={(e) =>
                              handleConfigChange(
                                scenario.scenario_id,
                                "lockMessage",
                                e.target.value
                              )
                            }
                            style={{
                              width: "100%",
                              marginTop: 8,
                              padding: "8px 12px",
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,0.2)",
                              background: "rgba(255,255,255,0.05)",
                              color: "#fff",
                              fontSize: 12,
                            }}
                          />
                        )}
                      </div>

                      {/* Featured toggle */}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={config.featured || false}
                          onChange={(e) =>
                            handleConfigChange(
                              scenario.scenario_id,
                              "featured",
                              e.target.checked
                            )
                          }
                          style={{
                            width: 18,
                            height: 18,
                            cursor: "pointer",
                            accentColor: "#5b5fc7",
                          }}
                        />
                        Scénario en vedette
                      </label>

                      {/* Sort order */}
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "rgba(255,255,255,0.6)",
                            marginBottom: 4,
                          }}
                        >
                          Ordre de tri
                        </label>
                        <input
                          type="number"
                          value={config.sortOrder || 0}
                          onChange={(e) =>
                            handleConfigChange(
                              scenario.scenario_id,
                              "sortOrder",
                              parseInt(e.target.value, 10)
                            )
                          }
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.05)",
                            color: "#fff",
                            fontSize: 12,
                          }}
                        />
                      </div>

                      {/* Category override */}
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "rgba(255,255,255,0.6)",
                            marginBottom: 4,
                          }}
                        >
                          Catégorie (remplace la par défaut)
                        </label>
                        <input
                          type="text"
                          placeholder={scenario.job_family || "Catégorie personnalisée"}
                          value={config.categoryOverride || ""}
                          onChange={(e) =>
                            handleConfigChange(
                              scenario.scenario_id,
                              "categoryOverride",
                              e.target.value
                            )
                          }
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.05)",
                            color: "#fff",
                            fontSize: 12,
                          }}
                        />
                      </div>

                      {/* Prerequisites */}
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "rgba(255,255,255,0.6)",
                            marginBottom: 4,
                          }}
                        >
                          Prérequis (IDs séparés par des virgules)
                        </label>
                        <input
                          type="text"
                          placeholder="ID1, ID2, ID3"
                          value={(config.prerequisites || []).join(", ")}
                          onChange={(e) =>
                            handleConfigChange(
                              scenario.scenario_id,
                              "prerequisites",
                              e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                            )
                          }
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.05)",
                            color: "#fff",
                            fontSize: 12,
                          }}
                        />
                      </div>

                      {/* Save button */}
                      <button
                        onClick={() => handleSaveConfig(scenario.scenario_id)}
                        disabled={isSaving}
                        style={{
                          padding: "10px 16px",
                          background: isSaving ? "rgba(255,255,255,0.1)" : "#5b5fc7",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          cursor: isSaving ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: 13,
                          transition: "all 0.2s",
                          opacity: isSaving ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSaving) {
                            e.currentTarget.style.background = "#4a4aaa";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSaving) {
                            e.currentTarget.style.background = "#5b5fc7";
                          }
                        }}
                      >
                        {isSaving ? "Sauvegarde..." : "Enregistrer"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ AI EDITOR SECTION ═══ */}
        {activeSection === "editor" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#fff" }}>
                Éditeur IA de scénarios
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                Sélectionnez un scénario verrouillé, puis discutez avec l'IA pour modifier les textes, objectifs, critères, prompts et dialogues. Les modifications structurelles ne sont pas autorisées.
              </p>

              {/* Scenario selector */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#a5a8ff", marginBottom: 6 }}>
                  Scénario à modifier
                </label>
                <select
                  value={editorScenarioId || ""}
                  onChange={(e) => {
                    setEditorScenarioId(e.target.value || null);
                    setEditorMessages([]);
                    setEditorPendingChanges(null);
                    setEditorInput("");
                  }}
                  style={{
                    width: "100%", maxWidth: 400, padding: "10px 14px", borderRadius: 8,
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff", fontSize: 14, outline: "none",
                  }}
                >
                  <option value="" style={{ background: "#1a1a2e", color: "#fff" }}>-- Choisir un scénario --</option>
                  {scenarios.map((s) => {
                    const cfg = configs[s.scenario_id];
                    const locked = cfg?.adminLocked;
                    return (
                      <option key={s.id} value={s.id} style={{ background: "#1a1a2e", color: "#fff" }}>
                        {locked ? "🔒 " : ""}{s.title} ({s.id})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Chat area */}
            {editorScenarioId && (
              <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", minHeight: 500 }}>

                {/* Messages */}
                <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", maxHeight: 500, display: "flex", flexDirection: "column", gap: 14 }}>
                  {editorMessages.length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                      <p style={{ fontSize: 14 }}>
                        Commencez à décrire les modifications souhaitées.
                        Par exemple : "Change le titre de la phase 2 en ..." ou "Ajoute un critère de scoring sur la diplomatie"
                      </p>
                    </div>
                  )}

                  {editorMessages.map((msg, idx) => (
                    <div key={idx} style={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    }}>
                      <div style={{
                        maxWidth: "80%",
                        padding: "12px 16px",
                        borderRadius: 14,
                        borderTopRightRadius: msg.role === "user" ? 4 : 14,
                        borderTopLeftRadius: msg.role === "user" ? 14 : 4,
                        background: msg.role === "user" ? "#5b5fc7" : "rgba(255,255,255,0.1)",
                        color: "#fff",
                        fontSize: 14,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {editorSending && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.1)", borderRadius: 14, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
                        Réflexion en cours...
                      </div>
                    </div>
                  )}

                  <div ref={editorChatEndRef} />
                </div>

                {/* Pending changes approval */}
                {editorPendingChanges && editorPendingChanges.length > 0 && (
                  <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(91,95,199,0.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#a5a8ff" }}>
                        {editorPendingChanges.length} modification{editorPendingChanges.length > 1 ? "s" : ""} proposée{editorPendingChanges.length > 1 ? "s" : ""}
                      </h4>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setEditorPendingChanges(null)}
                          style={{
                            padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.1)",
                            border: "none", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                          }}
                        >
                          Annuler
                        </button>
                        <button
                          onClick={async () => {
                            if (!userToken || !editorScenarioId || !editorPendingChanges) return;
                            setEditorApplying(true);
                            try {
                              const res = await fetch("/api/admin/scenario-editor", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
                                body: JSON.stringify({ scenarioId: editorScenarioId, changes: editorPendingChanges }),
                              });
                              const data = await res.json();
                              const msg = `✅ Modifications appliquées : ${(data.applied || []).length} réussie(s)${(data.failed || []).length > 0 ? `, ${data.failed.length} échouée(s)` : ""}`;
                              setEditorMessages((prev) => [...prev, { role: "assistant", content: msg }]);
                              setEditorPendingChanges(null);
                            } catch (err) {
                              setEditorMessages((prev) => [...prev, { role: "assistant", content: "❌ Erreur lors de l'application des modifications." }]);
                            } finally {
                              setEditorApplying(false);
                            }
                          }}
                          disabled={editorApplying}
                          style={{
                            padding: "8px 20px", borderRadius: 8, background: "#16a34a",
                            border: "none", color: "#fff", cursor: editorApplying ? "not-allowed" : "pointer",
                            fontSize: 13, fontWeight: 700,
                          }}
                        >
                          {editorApplying ? "Application..." : "Appliquer les modifications"}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                      {editorPendingChanges.map((c: any, idx: number) => (
                        <div key={idx} style={{ fontSize: 12, padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 6, color: "#ccc" }}>
                          <strong style={{ color: "#a5a8ff" }}>{c.path}</strong>: {typeof c.new_value === "string" ? c.new_value.slice(0, 100) : JSON.stringify(c.new_value).slice(0, 100)}{(typeof c.new_value === "string" ? c.new_value.length : JSON.stringify(c.new_value).length) > 100 ? "..." : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input */}
                <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 12 }}>
                  <input
                    value={editorInput}
                    onChange={(e) => setEditorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditorSend();
                      }
                    }}
                    placeholder="Décrivez la modification souhaitée..."
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: 10,
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff", fontSize: 14, outline: "none",
                    }}
                    disabled={editorSending}
                  />
                  <button
                    onClick={handleEditorSend}
                    disabled={editorSending || !editorInput.trim()}
                    style={{
                      padding: "12px 24px", borderRadius: 10, background: "#5b5fc7",
                      border: "none", color: "#fff", cursor: editorSending ? "not-allowed" : "pointer",
                      fontSize: 14, fontWeight: 700, opacity: editorSending || !editorInput.trim() ? 0.5 : 1,
                    }}
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Studio Section */}
        {activeSection === "studio" && (
          <div>
            {/* Studio header + action */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#fff" }}>
                  Scenario Studio
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  Créez et éditez vos scénarios sans toucher au moteur global
                </p>
              </div>
              <button
                onClick={() => setStudioShowModal(true)}
                style={{
                  background: "#5b5fc7",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#4949a8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#5b5fc7"; }}
              >
                + Nouveau scénario
              </button>
            </div>

            {/* JobFamily referential panel */}
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#fff" }}>
                  Familles métier
                </h3>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  {jobFamilies.filter((f) => f.active).length} active{jobFamilies.filter((f) => f.active).length > 1 ? "s" : ""} / {jobFamilies.length} total
                </span>
              </div>

              {jobFamiliesError && (
                <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{jobFamiliesError}</div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {jobFamilies.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: f.active ? "rgba(91,95,199,0.25)" : "rgba(255,255,255,0.05)",
                      border: f.active ? "1px solid #5b5fc7" : "1px solid rgba(255,255,255,0.15)",
                      fontSize: 12,
                      color: f.active ? "#fff" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    <span
                      onClick={() => {
                        const label = prompt("Nouveau label", f.label);
                        if (label) handleRenameJobFamily(f.id, label);
                      }}
                      style={{ cursor: "pointer", fontWeight: 600 }}
                      title="Renommer"
                    >
                      {f.label}
                    </span>
                    <span style={{ opacity: 0.5, fontSize: 10 }}>({f.id})</span>
                    <button
                      onClick={() => handleToggleJobFamily(f.id, !f.active)}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: f.active ? "#a5a8ff" : "rgba(255,255,255,0.4)",
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      {f.active ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      onClick={() => handleDeleteJobFamily(f.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(239,68,68,0.7)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      title="Supprimer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {jobFamilies.length === 0 && !jobFamiliesLoading && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
                    Aucune famille. Créez-en une ci-dessous.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={newFamilyLabel}
                  onChange={(e) => setNewFamilyLabel(e.target.value)}
                  placeholder="Label (ex. Management)"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                  }}
                />
                <input
                  type="text"
                  value={newFamilyId}
                  onChange={(e) => setNewFamilyId(e.target.value)}
                  placeholder="ID (optionnel, kebab-case)"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={handleCreateJobFamily}
                  style={{
                    padding: "6px 14px",
                    background: "#5b5fc7",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Ajouter
                </button>
              </div>
            </div>

            {/* Filter by family */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Filtrer :</span>
              <button
                onClick={() => setFamilyFilter("all")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: familyFilter === "all" ? "#5b5fc7" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Tous ({studioScenarios.length})
              </button>
              {jobFamilies.filter((f) => f.active).map((f) => {
                const count = studioScenarios.filter((s) =>
                  (s.jobFamilies || []).includes(f.id)
                ).length;
                const on = familyFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFamilyFilter(f.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: on ? "#5b5fc7" : "rgba(255,255,255,0.05)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.15)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
              <button
                onClick={() => setFamilyFilter("none")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: familyFilter === "none" ? "#5b5fc7" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: 12,
                  fontStyle: "italic",
                  cursor: "pointer",
                }}
              >
                Sans famille
              </button>
            </div>

            {/* Studio error */}
            {studioError && (
              <div style={{
                background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)",
                color: "#fca5a5", padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 14,
              }}>
                {studioError}
              </div>
            )}

            {/* Studio loading */}
            {studioLoading && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 16, padding: "40px 0" }}>
                Chargement...
              </div>
            )}

            {/* Empty state */}
            {!studioLoading && studioScenarios.length === 0 && (
              <div style={{
                textAlign: "center", color: "rgba(255,255,255,0.6)",
                fontSize: 16, padding: "60px 20px",
              }}>
                Aucun scénario studio. Commencez par en créer un !
              </div>
            )}

            {/* Scenario cards */}
            {!studioLoading && studioScenarios.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                {studioScenarios
                  .filter((sc) => {
                    if (familyFilter === "all") return true;
                    const fams = sc.jobFamilies || [];
                    if (familyFilter === "none") return fams.length === 0;
                    return fams.includes(familyFilter);
                  })
                  .map((sc) => {
                  const badge = getStudioStatusBadge(sc.status);
                  return (
                    <div
                      key={sc.id}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 16, padding: 20,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                      }}
                    >
                      <div
                        onClick={() => router.push(`/studio/${sc.id}`)}
                        style={{ cursor: "pointer", marginBottom: 12 }}
                      >
                        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "#fff" }}>
                          {sc.title}
                        </h3>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            display: "inline-block", padding: "4px 12px", borderRadius: 6,
                            fontSize: 12, fontWeight: 600,
                            background: badge.bg, color: badge.color,
                          }}>
                            {badge.label}
                          </span>
                          {sc.isTeaserVisible && (
                            <span style={{
                              display: "inline-block", padding: "4px 10px", borderRadius: 6,
                              fontSize: 11, fontWeight: 600,
                              background: "rgba(255,171,64,0.2)", color: "#ffab40",
                              border: "1px solid rgba(255,171,64,0.4)",
                            }}>
                              🚧 Teaser
                            </span>
                          )}
                          {(sc.jobFamilies || []).slice(0, 2).map((fid) => {
                            const f = jobFamilies.find((jf) => jf.id === fid);
                            return (
                              <span key={fid} style={{
                                display: "inline-block", padding: "4px 10px", borderRadius: 6,
                                fontSize: 11, fontWeight: 500,
                                background: "rgba(91,95,199,0.15)", color: "#a5a8ff",
                              }}>
                                {f?.label || fid}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                          Mis à jour {formatStudioDate(sc.updatedAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => router.push(`/studio/${sc.id}`)}
                          style={{
                            flex: 1, background: "rgba(91,95,199,0.2)", color: "#a5a8ff",
                            border: "none", padding: "8px 12px", borderRadius: 6,
                            fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          Éditer
                        </button>
                        {studioDeleteConfirm === sc.id ? (
                          <>
                            <button
                              onClick={() => handleStudioDelete(sc.id)}
                              disabled={studioDeleting === sc.id}
                              style={{
                                flex: 1, background: "#ef4444", color: "#fff",
                                border: "none", padding: "8px 12px", borderRadius: 6,
                                fontSize: 12, fontWeight: 600,
                                cursor: studioDeleting === sc.id ? "wait" : "pointer",
                                opacity: studioDeleting === sc.id ? 0.7 : 1,
                              }}
                            >
                              {studioDeleting === sc.id ? "..." : "Confirmer"}
                            </button>
                            <button
                              onClick={() => setStudioDeleteConfirm(null)}
                              style={{
                                flex: 1, background: "rgba(255,255,255,0.1)", color: "#fff",
                                border: "none", padding: "8px 12px", borderRadius: 6,
                                fontSize: 12, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setStudioDeleteConfirm(sc.id)}
                            style={{
                              flex: 1, background: "rgba(255,255,255,0.1)",
                              color: "rgba(255,255,255,0.6)",
                              border: "none", padding: "8px 12px", borderRadius: 6,
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(239,68,68,0.2)";
                              e.currentTarget.style.color = "#fca5a5";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                              e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                            }}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create Modal */}
            {studioShowModal && (
              <div
                style={{
                  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                  background: "rgba(0,0,0,0.6)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
                }}
                onClick={() => setStudioShowModal(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 16, padding: 32, maxWidth: 400, width: "100%",
                  }}
                >
                  <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#fff" }}>
                    Créer un nouveau scénario
                  </h2>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                      Titre *
                    </label>
                    <input
                      type="text"
                      value={studioModalTitle}
                      onChange={(e) => setStudioModalTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleStudioCreate(); }}
                      placeholder="Ex: Négociation difficile"
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                        padding: "10px 12px", color: "#fff", fontSize: 13,
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                      Tags (optionnel, séparés par des virgules)
                    </label>
                    <input
                      type="text"
                      value={studioModalTags}
                      onChange={(e) => setStudioModalTags(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleStudioCreate(); }}
                      placeholder="Ex: difficult, sales, high-stakes"
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                        padding: "10px 12px", color: "#fff", fontSize: 13,
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      onClick={() => setStudioShowModal(false)}
                      style={{
                        flex: 1, background: "rgba(255,255,255,0.1)", color: "#fff",
                        border: "none", padding: "10px 16px", borderRadius: 8,
                        fontSize: 14, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleStudioCreate}
                      disabled={studioCreating}
                      style={{
                        flex: 1, background: "#5b5fc7", color: "#fff",
                        border: "none", padding: "10px 16px", borderRadius: 8,
                        fontSize: 14, fontWeight: 600,
                        cursor: studioCreating ? "wait" : "pointer",
                        opacity: studioCreating ? 0.7 : 1,
                      }}
                    >
                      {studioCreating ? "Création..." : "Créer"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Organizations Section (super_admin only) */}
        {activeSection === "organizations" && (
          <OrganizationsSection token={userToken || ""} />
        )}
      </div>
    </main>
  );

  async function handleEditorSend() {
    if (!editorInput.trim() || !userToken || !editorScenarioId || editorSending) return;
    const msg = editorInput.trim();
    setEditorInput("");
    setEditorMessages((prev) => [...prev, { role: "user", content: msg }]);
    setEditorSending(true);
    setEditorPendingChanges(null);

    try {
      const res = await fetch("/api/admin/scenario-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          scenarioId: editorScenarioId,
          message: msg,
          conversationHistory: editorMessages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.error || `Erreur serveur (${res.status})`;
        const detail = data.detail ? `\n${data.detail}` : "";
        console.error("[Éditeur IA] Erreur API:", res.status, data);
        setEditorMessages((prev) => [...prev, { role: "assistant", content: `❌ ${errMsg}${detail}` }]);
        return;
      }

      if (!data.reply && !data.rawReply) {
        console.error("[Éditeur IA] Réponse vide:", data);
        setEditorMessages((prev) => [...prev, { role: "assistant", content: "❌ Réponse vide de l'IA. Vérifiez la clé API et les logs serveur." }]);
        return;
      }

      setEditorMessages((prev) => [...prev, { role: "assistant", content: data.reply || data.rawReply }]);

      if (data.changes && data.changes.length > 0) {
        setEditorPendingChanges(data.changes);
      }
    } catch (err) {
      console.error("[Éditeur IA] Erreur réseau:", err);
      setEditorMessages((prev) => [...prev, { role: "assistant", content: `❌ Erreur de communication avec l'API : ${err instanceof Error ? err.message : "Connexion échouée"}` }]);
    } finally {
      setEditorSending(false);
      setTimeout(() => editorChatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATIONS SECTION — Manage orgs (super_admin)
// ═══════════════════════════════════════════════════════════════════

interface OrgData {
  id: string;
  name: string;
  type: string;
  status: string;
  adminUserId: string;
  createdAt: string;
  settings: { description?: string };
}

function OrganizationsSection({ token }: { token: string }) {
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"enterprise" | "coach">("enterprise");
  const [formAdminEmail, setFormAdminEmail] = useState("");
  // coachLevel is now on the user profile, not the org
  const [formDescription, setFormDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  async function fetchOrgs() {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName || !formAdminEmail) return;
    setCreating(true);
    setMessage(null);

    try {
      // First find or hint at the admin user
      // The API expects adminUserId, so we need to resolve email → id
      // For simplicity, pass the email and let the server handle it
      // Actually the API expects adminUserId. We'll need to look up the user first.
      const usersRes = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      let adminUserId = "";
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const adminUser = (usersData.users || []).find(
          (u: any) => u.email.toLowerCase() === formAdminEmail.toLowerCase()
        );
        if (adminUser) {
          adminUserId = adminUser.id;
        }
      }

      if (!adminUserId) {
        setMessage({ type: "error", text: `Utilisateur "${formAdminEmail}" non trouvé` });
        setCreating(false);
        return;
      }

      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formName,
          type: formType,
          adminUserId,
          // coachLevel is on the user now, not the org
          description: formDescription || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Organisation "${formName}" créée !` });
        setFormName("");
        setFormAdminEmail("");
        setFormDescription("");
        setShowCreate(false);
        await fetchOrgs();
      } else {
        setMessage({ type: "error", text: data.error || "Erreur" });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau" });
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div style={{ padding: 20, color: "rgba(255,255,255,0.7)" }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff" }}>
          Organisations ({orgs.length})
        </h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: "10px 20px", background: "#5b5fc7", color: "#fff",
            border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}
        >
          {showCreate ? "Annuler" : "+ Nouvelle organisation"}
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: 14, borderRadius: 10, fontSize: 13, marginBottom: 16,
            background: message.type === "success" ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)",
            border: `1px solid ${message.type === "success" ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)"}`,
            color: message.type === "success" ? "#86efac" : "#fca5a5",
          }}
        >
          {message.text}
        </div>
      )}

      {showCreate && (
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#fff" }}>Créer une organisation</h3>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Nom</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nom de l'organisation"
                  style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Email de l'admin</label>
                <input
                  type="email"
                  value={formAdminEmail}
                  onChange={(e) => setFormAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", fontSize: 14 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["enterprise", "coach"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      style={{
                        padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: formType === t ? "#5b5fc7" : "rgba(255,255,255,0.1)",
                        color: formType === t ? "#fff" : "rgba(255,255,255,0.6)",
                      }}
                    >
                      {t === "enterprise" ? "🏢 Entreprise" : "🎓 Coach"}
                    </button>
                  ))}
                </div>
              </div>
              {/* coachLevel is now set on user profiles, not orgs */}
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Description (optionnel)</label>
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Description courte"
                style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", fontSize: 14 }}
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: "12px 24px", background: creating ? "#4b4faa" : "#5b5fc7", color: "#fff",
                border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14,
                cursor: creating ? "not-allowed" : "pointer", alignSelf: "flex-start",
              }}
            >
              {creating ? "Création..." : "Créer l'organisation"}
            </button>
          </form>
        </div>
      )}

      {/* Org list */}
      <div style={{ display: "grid", gap: 16 }}>
        {orgs.map((org) => (
          <div
            key={org.id}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{org.type === "enterprise" ? "🏢" : "🎓"}</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>{org.name}</h3>
                <span style={{
                  padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: org.status === "active" ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)",
                  color: org.status === "active" ? "#86efac" : "#fca5a5",
                }}>
                  {org.status === "active" ? "Actif" : "Suspendu"}
                </span>
                {/* coachLevel now on user profiles */}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {org.type === "enterprise" ? "Entreprise" : "Coach"} · Créé le {new Date(org.createdAt).toLocaleDateString("fr-FR")}
                {org.settings.description && ` · ${org.settings.description}`}
              </div>
            </div>
            <a
              href={org.type === "enterprise" ? `/enterprise/${org.id}` : `/coach/${org.id}`}
              style={{
                padding: "8px 16px", background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8,
                color: "#a5a8ff", fontSize: 13, fontWeight: 600, textDecoration: "none",
                cursor: "pointer",
              }}
            >
              Ouvrir →
            </a>
          </div>
        ))}
        {orgs.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            Aucune organisation créée. Cliquez sur "+ Nouvelle organisation" pour commencer.
          </div>
        )}
      </div>
    </div>
  );
}
