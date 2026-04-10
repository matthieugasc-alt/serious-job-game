"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function avatarStyle(background: string, size = 52) {
  return {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: 999,
    background,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700 as const,
    fontSize: 18,
    boxShadow: "0 6px 16px rgba(0,0,0,0.14)",
  };
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 18,
        padding: 22,
        background: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 22 }}>{title}</h2>
      <div style={{ lineHeight: 1.75, fontSize: 16 }}>{children}</div>
    </section>
  );
}

export default function IntroductionPage() {
  const [playerName, setPlayerName] = useState("");
  const router = useRouter();

  const handleStart = () => {
    const name = playerName.trim() || "Joueur";
    localStorage.setItem("playerName", name);
    router.push("/");
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
        padding: "28px 20px 40px",
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: 24,
            padding: "18px 20px",
            border: "1px solid #d8dbe3",
            borderRadius: 16,
            background:
              "linear-gradient(90deg, rgba(255,248,230,0.98) 0%, rgba(255,243,214,0.98) 100%)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.4,
              color: "#8a5a00",
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            Simulation métier
          </div>

          <h1
            style={{
              margin: "0 0 10px 0",
              fontSize: 34,
              lineHeight: 1.15,
            }}
          >
            Assistant(e) en collaboration internationale
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 17,
              lineHeight: 1.7,
              color: "#3f3f46",
              maxWidth: 920,
            }}
          >
            Tu vas gérer une situation diplomatique et logistique sous contrainte
            de temps, avec plusieurs interlocuteurs, des informations partielles
            et un niveau d’autonomie élevé.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 0.9fr",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <Card title="Ton rôle">
              <p style={{ marginTop: 0 }}>
                Tu incarnes un(e) assistant(e) en collaboration internationale.
              </p>
              <p>
                Ta mission est de gérer une situation de crise impliquant des
                partenaires externes, des autorités, des documents sensibles et
                une forte pression temporelle.
              </p>
              <p style={{ marginBottom: 0 }}>
                On attend de toi que tu saches :
              </p>
              <ul style={{ marginTop: 10, marginBottom: 0, paddingLeft: 20 }}>
                <li>comprendre rapidement les enjeux,</li>
                <li>prendre des initiatives crédibles,</li>
                <li>communiquer clairement,</li>
                <li>coordonner sans te faire porter par les autres,</li>
                <li>agir malgré l’incertitude.</li>
              </ul>
            </Card>

            <Card title="Règles du jeu">
              <p style={{ marginTop: 0 }}>
                Cette simulation est volontairement <strong>peu guidée</strong>.
              </p>

              <p>
                Tu ne recevras pas toujours une consigne explicite à chaque
                étape. C’est normal : l’objectif est de te mettre dans une
                situation proche du réel, pas de te donner un exercice scolaire.
              </p>

              <p style={{ marginBottom: 10 }}>
                Concrètement :
              </p>
              <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 20 }}>
                <li>tu dois interpréter la situation,</li>
                <li>tu peux prendre des initiatives,</li>
                <li>tu peux proposer des actions concrètes,</li>
                <li>tu peux rédiger des messages et des mails,</li>
                <li>
                  tu peux inventer des éléments réalistes lorsqu’ils sont
                  plausibles.
                </li>
              </ul>
            </Card>

            <Card title="Ce que le jeu attend de toi">
              <p style={{ marginTop: 0 }}>
                Romain n’est <strong>pas ton manager</strong>. Ce n’est pas un
                tuteur ni un professeur.
              </p>
              <p>
                C’est un collaborateur. Il peut transmettre une information,
                réagir, poser une question utile ou exprimer une contrainte.
                Mais à partir du moment où tu as compris la situation,
                <strong> c’est à toi de piloter</strong>.
              </p>
              <p style={{ marginBottom: 0 }}>
                Si tu attends passivement des instructions, tu seras en retard.
              </p>
            </Card>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <Card title="Personnages du scénario">
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={avatarStyle("#5b5fc7")}>R</div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      Romain Dufresne
                    </div>
                    <div style={{ color: "#475467", lineHeight: 1.65 }}>
                      Collaborateur direct. Il travaille avec toi mais ne dirige
                      pas la situation à ta place.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={avatarStyle("#0f766e")}>C</div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      Claudia Vargas
                    </div>
                    <div style={{ color: "#475467", lineHeight: 1.65 }}>
                      Cheffe de la délégation péruvienne. Interlocutrice externe
                      clé dans la situation.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={avatarStyle("#a16207")}>A</div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      Autorités / institutions
                    </div>
                    <div style={{ color: "#475467", lineHeight: 1.65 }}>
                      Consulat, police aux frontières, interlocuteurs officiels :
                      ils ne sont pas là pour te guider, mais pour traiter la
                      situation.
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Conseil avant de commencer">
              <p style={{ marginTop: 0 }}>
                Le but n’est pas d’être parfait dès la première seconde.
              </p>
              <p>
                Le but est de montrer comment tu raisonnes, comment tu arbitres
                et comment tu avances quand la situation est floue.
              </p>
              <p style={{ marginBottom: 0 }}>
                Va vers l’action crédible, pas vers l’attente.
              </p>
            </Card>

            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 18,
                padding: 22,
                background: "#fff",
                boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 22 }}>
                Commencer la simulation
              </h2>

              <label
                htmlFor="player-name"
                style={{
                  display: "block",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Ton prénom ou ton nom
              </label>

              <input
                id="player-name"
                type="text"
                placeholder="Ex. Matthieu"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #cfd5df",
                  fontSize: 16,
                  marginBottom: 14,
                  boxSizing: "border-box",
                  background: "#fff",
                }}
              />

              <button
                onClick={handleStart}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid #4338ca",
                  background: "#5b5fc7",
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 8px 16px rgba(91,95,199,0.18)",
                }}
              >
                Commencer le scénario
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}