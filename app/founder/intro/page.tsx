"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════
// FOUNDER INTRO — Carte narrative unique
// ═══════════════════════════════════════════════════════════════════

export default function FounderIntroPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleLaunch() {
    setCreating(true);
    const token = localStorage.getItem("auth_token");
    if (!token) {
      router.push("/login?redirect=/founder/intro");
      return;
    }

    try {
      // 1. Create (or retrieve existing) campaign
      const res = await fetch("/api/founder/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      const campaign = data.campaign;
      if (!campaign?.id) {
        setCreating(false);
        return;
      }

      // If existing campaign already in progress, go to dashboard
      if (data.existing) {
        router.push(`/founder/${campaign.id}`);
        return;
      }

      // 2. Set the first scenario as pending
      await fetch("/api/founder/campaigns", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          pendingScenarioId: "founder_00_cto",
        }),
      });

      // 3. Launch directly into scenario 0
      router.push(`/scenarios/founder_00_cto/play`);
    } catch (err) {
      console.error("Failed to create campaign:", err);
      setCreating(false);
    }
  }

  return (
    <main style={S.main}>
      <div style={S.ambientGlow} />

      {/* Top bar */}
      <header style={S.topBar}>
        <div style={S.modeBadge}>
          <span style={S.modeDot} />
          Founder Mode
        </div>
        <button onClick={() => router.push("/")} style={S.exitBtn}>
          Quitter
        </button>
      </header>

      {/* ── Carte narrative ─────────────────────────────────────── */}
      <article style={S.card}>
        <div style={S.cardAccent} />

        {/* ── Bloc 1 : Alexandre ────────────────────────────────── */}
        <p style={S.body}>
          <span style={S.name}>Alexandre Morel</span> est chirurgien en clinique
          privée à Bordeaux.
        </p>
        <p style={S.body}>
          Depuis des années, il voit le même gâchis : des blocs opératoires mal
          planifiés, des salles qui tournent en dessous de leur capacité, des
          équipes qui attendent, des patients qui décalent.
        </p>
        <p style={S.body}>
          À force de vivre ce problème de l'intérieur, il a une conviction
          simple : un bon outil pourrait fluidifier l'occupation des blocs,
          améliorer leur rotation et faire gagner un temps considérable aux
          établissements.
        </p>

        {/* ── Séparateur ───────────────────────────────────────── */}
        <div style={S.separator} />

        {/* ── Bloc 2 : Son profil vs le tien ───────────────────── */}
        <p style={S.body}>
          Il a l'expertise métier. Il connaît le terrain, les irritants, les
          contraintes, et les bonnes personnes pour tester une solution.
        </p>
        <p style={S.body}>
          Mais il n'a ni la vision startup, ni les réflexes business, ni les
          compétences pour transformer cette idée en entreprise.
        </p>
        <p style={S.body}>
          Il te propose donc de lancer la boîte avec lui.
        </p>

        {/* ── Séparateur ───────────────────────────────────────── */}
        <div style={S.separator} />

        {/* ── Bloc 3 : Les rôles ───────────────────────────────── */}
        <p style={S.body}>
          Lui restera chirurgien à mi-temps pour garder sa stabilité et
          continuer à alimenter le projet en retours terrain.
        </p>
        <p style={S.body}>
          Toi, tu viens du monde du business. Tu prends le rôle de CEO, à
          plein temps. Tu peux tenir{" "}
          <span style={S.emphasis}>18 mois sans te rémunérer</span>.
        </p>
        <p style={S.body}>
          Tu disposes de{" "}
          <span style={S.number}>25 000 € d'économies</span>, dont{" "}
          <span style={S.number}>15 000 € réellement mobilisables</span> pour
          le projet.
        </p>

        {/* ── Séparateur ───────────────────────────────────────── */}
        <div style={S.separator} />

        {/* ── Bloc 4 : La réalité ──────────────────────────────── */}
        <p style={S.body}>
          En revanche, vous partez avec presque rien : pas de produit, pas
          d'équipe technique, pas de client, pas de revenu.
        </p>

        {/* ── Séparateur ───────────────────────────────────────── */}
        <div style={S.separator} />

        {/* ── Bloc 5 : Acculturation ───────────────────────────── */}
        <p style={S.body}>
          Avant de plonger, fais ce que ferait n'importe quel entrepreneur à
          qui un ami propose de s'associer :{" "}
          <span style={S.emphasis}>
            renseigne-toi un minimum sur le marché
          </span>
          .
        </p>
        <p style={S.body}>
          Qui sont les acteurs ? Combien d'établissements sont concernés ?
          Quels outils existent déjà ? Est-ce qu'il y a une fenêtre de tir ?
          Tu n'as pas besoin d'être expert — juste assez informé pour savoir
          si tu veux te lancer.
        </p>

        {/* ── Urgence finale ───────────────────────────────────── */}
        <div style={S.urgencyBox}>
          <p style={S.urgencyText}>
            Première étape : trouver quelqu'un capable de construire le
            produit. C'est maintenant.
          </p>
        </div>
      </article>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={S.footer}>
        <button onClick={() => router.push("/")} style={S.backBtn}>
          ← Retour
        </button>
        <button
          onClick={handleLaunch}
          disabled={creating}
          style={{
            ...S.launchBtn,
            opacity: creating ? 0.7 : 1,
            cursor: creating ? "not-allowed" : "pointer",
          }}
        >
          {creating ? "Création..." : "Lancer ma startup →"}
        </button>
      </footer>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const S: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#08080f",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 20px 48px",
    position: "relative",
    overflow: "hidden",
  },
  ambientGlow: {
    position: "absolute",
    top: -140,
    left: "50%",
    transform: "translateX(-50%)",
    width: 640,
    height: 420,
    borderRadius: "50%",
    background:
      "radial-gradient(ellipse, rgba(91,95,199,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
    zIndex: 0,
  },

  // Top bar
  topBar: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 0 28px",
  },
  modeBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#5b5fc7",
    boxShadow: "0 0 10px rgba(91,95,199,0.6)",
  },
  exitBtn: {
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },

  // Card
  card: {
    position: "relative",
    zIndex: 1,
    maxWidth: 600,
    width: "100%",
    padding: "36px 32px 32px 36px",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: "linear-gradient(180deg, #5b5fc7 0%, #7c7fff 40%, rgba(91,95,199,0.15) 100%)",
    borderRadius: "3px 0 0 3px",
  },

  // Text
  body: {
    margin: "0 0 16px",
    fontSize: 15,
    lineHeight: 1.8,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.1,
  },
  name: {
    color: "#fff",
    fontWeight: 700,
  },
  emphasis: {
    color: "#a5a8ff",
    fontWeight: 700,
  },
  number: {
    color: "#fff",
    fontWeight: 700,
    borderBottom: "1px solid rgba(165,168,255,0.3)",
    paddingBottom: 1,
  },

  // Separator
  separator: {
    width: 40,
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "24px 0",
  },

  // Urgency
  urgencyBox: {
    marginTop: 28,
    padding: "20px 24px",
    background: "rgba(91,95,199,0.07)",
    borderRadius: 12,
    border: "1px solid rgba(91,95,199,0.15)",
  },
  urgencyText: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.6,
    color: "#c4c6ff",
    letterSpacing: -0.1,
  },

  // Footer
  footer: {
    position: "relative",
    zIndex: 1,
    maxWidth: 600,
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 40,
  },
  backBtn: {
    padding: "11px 22px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  launchBtn: {
    padding: "14px 36px",
    background: "linear-gradient(135deg, #5b5fc7 0%, #4a4eb3 100%)",
    border: "1px solid rgba(91,95,199,0.4)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow:
      "0 4px 24px rgba(91,95,199,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
    transition: "all 0.2s",
  },
};
