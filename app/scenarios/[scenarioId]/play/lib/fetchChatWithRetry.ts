/**
 * fetchChatWithRetry — robust POST /api/chat with automatic retry on
 * transient failures (401 expired token, 429 rate limit, 5xx, network).
 *
 * Extracted from page.tsx so it can be unit-tested and so the chat
 * sender stays focused on game logic.
 *
 * Contract:
 *   - On success: returns { data, error: null }
 *   - On terminal failure (after MAX_RETRIES): returns { data: null, error: string }
 *   - 401 refreshes the auth token from localStorage["auth_token"] and retries
 *   - 429 honours retryAfterMs (capped at 5 s)
 *   - 5xx and network errors retry up to MAX_RETRIES times with 800 ms × attempt backoff
 */

export type ChatRetryDeps = {
  /** Build auth headers (Content-Type + Bearer). */
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
  /** Ref-like wrapper around the current auth token (refreshed in place on 401). */
  authTokenRef: { current: string | null };
};

export type ChatRetryResult = {
  /** Parsed JSON response on success. */
  data: any | null;
  /** Human-readable French error message, or null on success. */
  error: string | null;
};

const MAX_RETRIES = 2;

export async function fetchChatWithRetry(
  payload: unknown,
  deps: ChatRetryDeps,
): Promise<ChatRetryResult> {
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // On retry after 401, refresh token from localStorage
      if (attempt > 0) {
        const freshToken =
          typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
        if (freshToken) deps.authTokenRef.current = freshToken;
        // Small linear backoff before retry to avoid hammering
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: deps.apiHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.status === 401 && attempt < MAX_RETRIES) {
        lastError = "Session expirée, nouvelle tentative...";
        continue;
      }

      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          const retryBody = await res.json().catch(() => ({} as any));
          const waitMs = (retryBody as any).retryAfterMs || 3000;
          lastError = "Trop de requêtes, patientez...";
          await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
          continue;
        }
        lastError = "Trop de requêtes. Veuillez patienter quelques instants.";
        break;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        lastError = "Erreur serveur, nouvelle tentative...";
        continue;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as any));
        lastError =
          (errBody as any).message ||
          (errBody as any).error ||
          `Erreur chat (${res.status})`;
        break;
      }

      const data = await res.json();
      return { data, error: null };
    } catch (fetchErr: any) {
      lastError = fetchErr?.message || "Erreur réseau";
      if (attempt < MAX_RETRIES) continue;
    }
  }

  return { data: null, error: lastError };
}
