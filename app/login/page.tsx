"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TabKey = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect URL after login (if coming from a protected page)
  const redirectTo = searchParams.get("redirect") || "/";

  // Auto-redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      router.replace(redirectTo);
    }
  }, []);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Connexion échouée");
      }

      const data = await response.json();
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("user_name", data.user?.name || data.name || "");
      localStorage.setItem("user_role", data.user?.role || "user");

      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (registerPassword !== registerConfirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Inscription échouée");
      }

      const data = await response.json();
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("user_name", data.user?.name || data.name || "");
      localStorage.setItem("user_role", data.user?.role || "user");

      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
        padding: "40px 20px",
        fontFamily: "Arial, sans-serif",
        color: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
        }}
      >
        {/* Card */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 18,
            background: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          {/* Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #ddd",
              background: "#f9f9f9",
            }}
          >
            <button
              onClick={() => setActiveTab("login")}
              style={{
                flex: 1,
                padding: "16px",
                border: "none",
                background: activeTab === "login" ? "#fff" : "transparent",
                borderBottom: activeTab === "login" ? "3px solid #5b5fc7" : "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                color: activeTab === "login" ? "#5b5fc7" : "#999",
                transition: "all 0.2s",
              }}
            >
              Connexion
            </button>
            <button
              onClick={() => setActiveTab("register")}
              style={{
                flex: 1,
                padding: "16px",
                border: "none",
                background: activeTab === "register" ? "#fff" : "transparent",
                borderBottom:
                  activeTab === "register" ? "3px solid #5b5fc7" : "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                color: activeTab === "register" ? "#5b5fc7" : "#999",
                transition: "all 0.2s",
              }}
            >
              Inscription
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: 32 }}>
            {error && (
              <div
                style={{
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 20,
                  color: "#991b1b",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {/* Login Form */}
            {activeTab === "login" && (
              <form onSubmit={handleLoginSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontFamily: "Arial, sans-serif",
                      boxSizing: "border-box",
                    }}
                    placeholder="votre@email.com"
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontFamily: "Arial, sans-serif",
                      boxSizing: "border-box",
                    }}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 8,
                    background: loading ? "#9999aa" : "#5b5fc7",
                    color: "#fff",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "#4a4aaa";
                  }}
                  onMouseLeave={(e) => {
                    if (!loading)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "#5b5fc7";
                  }}
                >
                  {loading ? "Connexion..." : "Se connecter"}
                </button>
              </form>
            )}

            {/* Register Form */}
            {activeTab === "register" && (
              <form onSubmit={handleRegisterSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    Nom
                  </label>
                  <input
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontFamily: "Arial, sans-serif",
                      boxSizing: "border-box",
                    }}
                    placeholder="Votre nom"
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontFamily: "Arial, sans-serif",
                      boxSizing: "border-box",
                    }}
                    placeholder="votre@email.com"
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontFamily: "Arial, sans-serif",
                      boxSizing: "border-box",
                    }}
                    placeholder="8 caractères minimum"
                  />
                  <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                    Minimum 8 caractères
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#333",
                    }}
                  >
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 14,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontFamily: "Arial, sans-serif",
                      boxSizing: "border-box",
                    }}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 8,
                    background: loading ? "#9999aa" : "#5b5fc7",
                    color: "#fff",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "#4a4aaa";
                  }}
                  onMouseLeave={(e) => {
                    if (!loading)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "#5b5fc7";
                  }}
                >
                  {loading ? "Inscription..." : "S'inscrire"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "none",
              border: "none",
              color: "#5b5fc7",
              cursor: "pointer",
              fontSize: 14,
              textDecoration: "underline",
            }}
          >
            Retour aux scénarios
          </button>
        </div>
      </div>
    </main>
  );
}
