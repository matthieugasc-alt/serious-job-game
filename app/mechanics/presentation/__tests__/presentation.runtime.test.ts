import { describe, it, expect } from "vitest";
import {
  DEFAULT_LANG,
  DEFAULT_PREPARATION_S,
  DEFAULT_TIME_LIMIT_S,
  RESUME_GRACE_S,
  buildOutput,
  computeDurationS,
  remainingSeconds,
  resolveLang,
  resolvePreparationS,
  resolveTimeLimitS,
  validateParams,
} from "../Runtime";

describe("presentation/Runtime — résolution des temps", () => {
  it("preparation_s : défaut 60, respecte 0 et les valeurs valides", () => {
    expect(resolvePreparationS({})).toBe(DEFAULT_PREPARATION_S);
    expect(DEFAULT_PREPARATION_S).toBe(60);
    expect(resolvePreparationS({ preparation_s: 0 })).toBe(0);
    expect(resolvePreparationS({ preparation_s: 90.9 })).toBe(90);
    expect(resolvePreparationS({ preparation_s: -5 })).toBe(60);
    expect(resolvePreparationS({ preparation_s: "30" })).toBe(60);
  });
  it("timeLimitS : défaut 180 si absent ou invalide", () => {
    expect(resolveTimeLimitS(undefined)).toBe(DEFAULT_TIME_LIMIT_S);
    expect(DEFAULT_TIME_LIMIT_S).toBe(180);
    expect(resolveTimeLimitS(120)).toBe(120);
    expect(resolveTimeLimitS(0)).toBe(180);
    expect(resolveTimeLimitS(NaN)).toBe(180);
  });
  it("lang : défaut fr-FR", () => {
    expect(resolveLang({})).toBe(DEFAULT_LANG);
    expect(resolveLang({ lang: "en-US" })).toBe("en-US");
    expect(resolveLang({ lang: "  " })).toBe("fr-FR");
  });
});

describe("presentation/Runtime — remainingSeconds (reprise)", () => {
  const t0 = 1_000_000;
  it("retourne la limite entière si la phase vient de démarrer", () => {
    expect(remainingSeconds(t0, t0, 180)).toBe(180);
  });
  it("décompte le temps écoulé", () => {
    expect(remainingSeconds(t0, t0 + 30_000, 180)).toBe(150);
  });
  it("accorde un sursis si le chrono a expiré pendant le refresh", () => {
    expect(remainingSeconds(t0, t0 + 400_000, 180)).toBe(RESUME_GRACE_S);
  });
  it("le sursis ne dépasse jamais la limite", () => {
    expect(remainingSeconds(t0, t0 + 400_000, 5)).toBe(5);
  });
  it("startedAt invalide → limite entière (défensif)", () => {
    expect(remainingSeconds(undefined, t0, 180)).toBe(180);
    expect(remainingSeconds("x", t0, 180)).toBe(180);
  });
});

describe("presentation/Runtime — computeDurationS", () => {
  const t0 = 1_000_000;
  it("mesure la durée arrondie en secondes", () => {
    expect(computeDurationS(t0, t0 + 92_400, 180)).toBe(92);
  });
  it("borne à la limite du step", () => {
    expect(computeDurationS(t0, t0 + 999_000, 180)).toBe(180);
  });
  it("ne retourne jamais de valeur négative ou NaN", () => {
    expect(computeDurationS(t0, t0 - 5_000, 180)).toBe(0);
    expect(computeDurationS(undefined, t0, 180)).toBe(0);
  });
});

describe("presentation/Runtime — buildOutput", () => {
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const out = buildOutput("  Mon exposé.  ", 95);
    expect(Object.keys(out).sort()).toEqual(["duration_s", "speech"]);
    expect(out.speech).toBe("Mon exposé.");
    expect(out.duration_s).toBe(95);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("presentation/Runtime — validateParams", () => {
  it("accepte des params valides", () => {
    expect(
      validateParams({ brief: "Présentez votre synthèse", preparation_s: 30, lang: "fr-FR" }),
    ).toEqual([]);
  });
  it("refuse un brief manquant ou vide", () => {
    expect(validateParams({}).length).toBe(1);
    expect(validateParams({ brief: "  " }).length).toBe(1);
  });
  it("refuse les optionnels mal typés", () => {
    const errs = validateParams({ brief: "b", preparation_s: -1, lang: "" });
    expect(errs.length).toBe(2);
  });
});
