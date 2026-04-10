"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IntroductionPage() {
  const [playerName, setPlayerName] = useState("");
  const router = useRouter();

  const handleStart = () => {
    const name = playerName.trim() || "Joueur";

    // on stocke le prénom pour la suite
    localStorage.setItem("playerName", name);

    // redirection vers le jeu
    router.push("/");
  };

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 20 }}>
        Simulation métier : Assistant(e) en collaboration internationale
      </h1>

      <section style={{ marginBottom: 24 }}>
        <h2>🎯 Ton rôle</h2>
        <p>
          Tu incarnes un(e) assistant(e) en collaboration internationale.
        </p>
        <p>
          Ta mission : gérer une situation de crise impliquant plusieurs
          interlocuteurs (délégations, consulat, partenaires), dans un contexte
          d’urgence.
        </p>
        <ul>
          <li>Comprendre rapidement les enjeux</li>
          <li>Prendre des initiatives</li>
          <li>Communiquer efficacement</li>
          <li>Anticiper les problèmes</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>⚠️ Règles du jeu</h2>
        <p>
          Cette simulation est volontairement peu guidée pour reproduire une
          situation réelle.
        </p>
        <ul>
          <li>Tu ne recevras pas toujours des consignes explicites</li>
          <li>Tu dois interpréter et décider</li>
          <li>Tu peux inventer des éléments réalistes</li>
          <li>Tu peux prendre des initiatives</li>
        </ul>
        <p>
          Tu es évalué(e) sur ta capacité à comprendre, décider et agir.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>👤 Les personnages</h2>
        <p>
          <strong>Romain</strong> — Collaborateur direct. Il travaille avec toi
          mais n’est pas ton manager. Il attend que tu prennes le lead.
        </p>
        <p>
          <strong>Claudia Vargas</strong> — Cheffe de délégation péruvienne.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>🧠 Important</h2>
        <p>
          À partir d’un certain moment, c’est à toi de piloter la situation.
        </p>
        <p>
          Si tu attends des instructions, tu seras en retard.
        </p>
      </section>

      <section>
        <h2>🎮 Commencer</h2>

        <input
          type="text"
          placeholder="Ton prénom"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={{
            padding: 10,
            fontSize: 16,
            width: "100%",
            marginBottom: 12,
          }}
        />

        <button
          onClick={handleStart}
          style={{
            padding: "12px 16px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Commencer la simulation
        </button>
      </section>
    </main>
  );
}