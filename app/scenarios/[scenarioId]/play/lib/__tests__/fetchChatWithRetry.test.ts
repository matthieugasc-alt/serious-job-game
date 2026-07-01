/**
 * Tests unit — fetchChatWithRetry.
 *
 * Vérifie que le retry est déclenché sur 401 / 429 / 5xx / network et
 * qu'il abandonne après MAX_RETRIES en renvoyant `{ data: null, error }`.
 *
 * Note technique: le module utilise `localStorage.getItem("auth_token")`
 * comme global implicite (côté browser, `window.localStorage` est aliasé).
 * En environnement Node/vitest on doit installer un stub sur `globalThis`.
 *
 * On garde des délais réels: `800*attempt` = 0/800/1600ms → 2.4s max
 * par test qui pousse jusqu'au bout. Acceptable pour un fichier de tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchChatWithRetry } from "../fetchChatWithRetry";

// ── Mocks ──────────────────────────────────────────────────────────

function mockAuthTokenRef(initial: string | null = "tok-initial") {
  return { current: initial };
}

function mockApiHeaders() {
  return () => ({ "Content-Type": "application/json" });
}

/** Install a globalThis.window + globalThis.localStorage so the code that
 *  reads them from a Node environment doesn't throw ReferenceError. */
function installBrowserGlobals(token: string | null = "tok-fresh") {
  const store = new Map<string, string>();
  if (token !== null) store.set("auth_token", token);
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  (globalThis as any).window = { localStorage: (globalThis as any).localStorage };
}

function uninstallBrowserGlobals() {
  delete (globalThis as any).localStorage;
  delete (globalThis as any).window;
}

/** Fake fetch that plays a sequence of responses. */
function mockFetchSequence(sequence: Array<{ status?: number; body?: any; throw?: string }>) {
  let call = 0;
  const fn = vi.fn(async () => {
    const step = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    if (step.throw) throw new Error(step.throw);
    const status = step.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => step.body ?? {},
    };
  });
  (globalThis as any).fetch = fn;
  return fn;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  installBrowserGlobals();
});

afterEach(() => {
  uninstallBrowserGlobals();
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("fetchChatWithRetry", () => {
  it("returns data on first-try success", async () => {
    mockFetchSequence([{ status: 200, body: { reply: "ok" } }]);
    const res = await fetchChatWithRetry({ msg: "hi" }, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: mockAuthTokenRef(),
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ reply: "ok" });
  });

  it("retries once on 401 then succeeds after token refresh", async () => {
    const fetchFn = mockFetchSequence([
      { status: 401 },
      { status: 200, body: { reply: "after refresh" } },
    ]);
    const authRef = mockAuthTokenRef();
    const res = await fetchChatWithRetry({ msg: "hi" }, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: authRef,
    });
    expect(res.data?.reply).toBe("after refresh");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(authRef.current).toBe("tok-fresh");
  });

  it("retries on 429 respecting retryAfterMs (capped at 5s)", async () => {
    const fetchFn = mockFetchSequence([
      { status: 429, body: { retryAfterMs: 100 } },
      { status: 200, body: { reply: "ok" } },
    ]);
    const res = await fetchChatWithRetry({}, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: mockAuthTokenRef(),
    });
    expect(res.data?.reply).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx and returns success on 3rd attempt", async () => {
    const fetchFn = mockFetchSequence([
      { status: 500 },
      { status: 503 },
      { status: 200, body: { reply: "finally" } },
    ]);
    const res = await fetchChatWithRetry({}, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: mockAuthTokenRef(),
    });
    expect(res.data?.reply).toBe("finally");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("retries on network errors then returns error after MAX_RETRIES", async () => {
    const fetchFn = mockFetchSequence([
      { throw: "ECONNRESET" },
      { throw: "timeout" },
      { throw: "network down" },
    ]);
    const res = await fetchChatWithRetry({}, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: mockAuthTokenRef(),
    });
    expect(res.data).toBeNull();
    // Le message d'erreur remonte le dernier échec.
    expect(res.error).toContain("network down");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("returns error with server-provided message on terminal 4xx (not retriable)", async () => {
    mockFetchSequence([{ status: 400, body: { error: "Bad request explicit" } }]);
    const res = await fetchChatWithRetry({}, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: mockAuthTokenRef(),
    });
    expect(res.data).toBeNull();
    expect(res.error).toContain("Bad request explicit");
  });

  it("gives up after MAX_RETRIES on repeated 5xx", async () => {
    const fetchFn = mockFetchSequence([
      { status: 500 },
      { status: 500 },
      { status: 500 },
    ]);
    const res = await fetchChatWithRetry({}, {
      apiHeaders: mockApiHeaders(),
      authTokenRef: mockAuthTokenRef(),
    });
    expect(res.data).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
  }, 10_000);
});
