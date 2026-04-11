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
  const [activeSection, setActiveSection] = useState<"conversion" | "management">("conversion");
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

  useEffect(() => {
    const role = localStorage.getItem("user_role");
    const name = localStorage.getItem("user_name");
    const token = localStorage.getItem("auth_token");
    if (!name || !role) {
      router.push("/login");
      return;
    }
    // Allow admin access (fallback: also allow if email matches)
    if (role !== "admin") {
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
  const getEditingConfig = (scenarioId: string): ScenarioConfig => {
    return (
      editingConfigs[scenarioId] || {
        id: scenarioId,
        scenario_id: scenarioId,
        adminLocked: false,
        lockMessage: "",
        prerequisites: [],
        categoryOverride: "",
        sortOrder: 0,
        featured: false,
      }
    );
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
      const res = await fetch("/api/admin/scenario-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          scenarioId: config.scenario_id,
          adminLocked: config.adminLocked ?? false,
          lockMessage: config.lockMessage,
          prerequisites: config.prerequisites,
          category: config.categoryOverride,
          order: config.sortOrder,
          featured: config.featured,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la sauvegarde");
      }

      // Update local configs
      setConfigs((prev) => ({ ...prev, [scenarioId]: config }));
      setEditingConfigs((prev) => {
        const next = { ...prev };
        delete next[scenarioId];
        return next;
      });
    } catch (err: any) {
      console.error("Save config error:", err);
      alert("Erreur lors de la sauvegarde de la configuration");
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
      </div>
    </main>
  );
}
