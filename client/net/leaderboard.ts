/**
 * Phase 5 — client-side fetch of the all-time leaderboard.
 *
 * The Colyseus server exposes `GET /leaderboard?limit=N` (Express,
 * defined in `server/src/index.ts`). We don't talk to Supabase from the
 * client at all — that keeps the Supabase URL + anon key out of the
 * shipped JS bundle and lets the server be the single chokepoint for
 * persistence policy (rate limiting, sanitisation, etc. when needed).
 *
 * The wire shape (`LeaderboardEntry`, `LeaderboardResponse`) lives in
 * `@milk-dreams/shared` so the server's response type and the client's
 * fetch type are defined ONCE and verified at compile time on both
 * sides.
 */

import type {
  LeaderboardEntry,
  LeaderboardResponse,
} from '@milk-dreams/shared';

export type { LeaderboardEntry } from '@milk-dreams/shared';

/**
 * Convert a `ws://host:port` (or `wss://`) endpoint to its HTTP twin.
 * Same host + port, just `http`/`https`. Used to derive the REST base
 * URL from the multiplayer endpoint the user / `?mp=` already chose,
 * so we don't need a second config knob.
 */
export function httpEndpointFromWs(wsEndpoint: string): string {
  if (wsEndpoint.startsWith('wss://')) {
    return 'https://' + wsEndpoint.slice('wss://'.length);
  }
  if (wsEndpoint.startsWith('ws://')) {
    return 'http://' + wsEndpoint.slice('ws://'.length);
  }
  // Fallback: assume it's already an HTTP URL.
  return wsEndpoint;
}

/**
 * Fetch the top N entries from the server. Returns `[]` on any error
 * (network, non-2xx, malformed payload) — the caller renders an empty
 * leaderboard rather than blocking the scoreboard overlay.
 *
 * Aborts after `timeoutMs` so a stuck server doesn't keep the
 * scoreboard "loading" forever.
 */
export async function fetchLeaderboard(
  httpEndpoint: string,
  limit = 10,
  timeoutMs = 2500,
): Promise<readonly LeaderboardEntry[]> {
  const url = `${httpEndpoint.replace(/\/$/, '')}/leaderboard?limit=${limit}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as Partial<LeaderboardResponse>;
    return body.entries ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
