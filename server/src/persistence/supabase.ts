/**
 * Phase 5 — persistent ranking via Supabase Postgres.
 *
 * Two principles:
 *  - **Optional dependency.** When `SUPABASE_URL` / `SUPABASE_ANON_KEY`
 *    are not set (typical for local dev / CI), this module returns a
 *    no-op store so the rest of the server keeps working unchanged.
 *    Multiplayer never *requires* the leaderboard to be online.
 *  - **Atomic increments via RPC.** Per-name accumulation lives in the
 *    Postgres function `milk_dreams.record_contribution(name, litres)`
 *    so the server doesn't read-modify-write (which would lose updates
 *    under concurrent rounds, e.g. two server instances behind a load
 *    balancer in the future). The schema + function DDL is in the
 *    project's `MULTIPLAYER.md`.
 *
 * The leaderboard read path also goes through a function
 * (`milk_dreams.top_rankings(limit)`) so the table itself stays
 * inaccessible to anonymous clients — defense in depth on top of the
 * "names are spoofable" trust model.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LeaderboardEntry } from '@milk-dreams/shared';

/**
 * Shape returned by the Postgres `top_rankings` RPC. Matches the wire
 * shape (`LeaderboardEntry` from `@milk-dreams/shared`) one-to-one
 * because we hand the rows straight to the HTTP response without
 * remapping. Re-aliased here so callers in the persistence layer
 * import a domain-flavoured name.
 */
export type RankingEntry = LeaderboardEntry;

export interface RoundContribution {
  name: string;
  /** Litres delivered THIS ROUND for this player (must be > 0). */
  litres: number;
}

const RPC_TIMEOUT_MS = Number(process.env.SUPABASE_RPC_TIMEOUT_MS ?? 1500);

export interface LeaderboardStore {
  /**
   * `true` if the store is wired to a real Supabase project. Lets the
   * room log "persistence enabled / disabled" once at boot without
   * having to special-case the no-op store everywhere.
   */
  readonly enabled: boolean;
  /**
   * Persist the contributions from a finished round. Implementations
   * MUST be safe to call with an empty array (no players delivered) and
   * MUST never throw — failures are logged and swallowed so a transient
   * Supabase outage doesn't take down the room.
   */
  recordRoundContributions(entries: readonly RoundContribution[]): Promise<void>;
  /**
   * Read the all-time top N entries (by `total_milk` desc). Returns an
   * empty array on any error — same contract as `recordRoundContributions`.
   */
  topRankings(limit: number): Promise<readonly RankingEntry[]>;
}

const NOOP_STORE: LeaderboardStore = {
  enabled: false,
  async recordRoundContributions() {},
  async topRankings() {
    return [];
  },
};

/**
 * Process-level singleton. Built lazily on first access so importing
 * the module never opens a network connection by itself (handy for
 * tests that want to swap it out via `setLeaderboardStore(stub)` before
 * the room loads).
 */
let singleton: LeaderboardStore | null = null;

/** Access the shared store. Lazily initialised from env vars. */
export function getLeaderboardStore(): LeaderboardStore {
  if (!singleton) singleton = createLeaderboardStore();
  return singleton;
}

/**
 * Replace the shared store. Intended for unit / smoke tests that want
 * to inject a controlled stub without setting up Supabase. Production
 * code should never call this.
 */
export function setLeaderboardStore(store: LeaderboardStore): void {
  singleton = store;
}

/**
 * Build a leaderboard store from environment variables. Returns a
 * no-op store if either `SUPABASE_URL` or `SUPABASE_ANON_KEY` is
 * missing — this is the common case during local dev when the user
 * just wants to play multiplayer without setting up the DB.
 *
 * The factory is sync; the underlying `createClient` doesn't make a
 * network call until the first request, so a wrong URL fails per-call
 * instead of on boot. We log the choice once for visibility.
 */
export function createLeaderboardStore(): LeaderboardStore {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    console.log(
      '[persistence] SUPABASE_URL / SUPABASE_ANON_KEY not set — leaderboard disabled (in-memory only).',
    );
    return NOOP_STORE;
  }

  // The anon key has restricted privileges — only the two RPCs are
  // grant-execute for `anon`. We never SELECT or UPSERT directly here,
  // which means a leaked anon key cannot dump or rewrite the rankings
  // table beyond what the functions allow.
  //
  // `db.schema: 'milk_dreams'` is REQUIRED for PostgREST to find our
  // functions, which live in the `milk_dreams` schema (not `public`).
  // The matching prerequisite on the Supabase side is having
  // `milk_dreams` in "Exposed schemas" under Project Settings → API.
  // Without that, the RPC calls return `404 schema not found`.
  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'milk_dreams' as never },
  });
  console.log(`[persistence] leaderboard enabled at ${url}`);

  async function withTimeout<T>(
    label: string,
    op: PromiseLike<T>,
  ): Promise<T> {
    return await Promise.race<T>([
      Promise.resolve(op),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `${label} timed out after ${RPC_TIMEOUT_MS}ms`,
            ),
          );
        }, RPC_TIMEOUT_MS);
      }),
    ]);
  }

  return {
    enabled: true,
    async recordRoundContributions(entries) {
      if (entries.length === 0) return;
      // Sequential calls instead of Promise.all: keeps the per-row
      // error visible in logs and avoids hammering the DB with N
      // simultaneous RPCs when N could be ~20 in a busy room.
      for (const entry of entries) {
        const trimmed = entry.name.trim();
        if (!trimmed || entry.litres <= 0) continue;
        try {
          const { error } = await withTimeout(
            `record_contribution(${trimmed})`,
            client.rpc(
              'record_contribution',
              { p_name: trimmed, p_litres: entry.litres },
              { get: false },
            ),
          );
          if (error) {
            console.warn(
              `[persistence] record_contribution(${trimmed}) failed: ${error.message}`,
            );
          }
        } catch (err) {
          console.warn(
            `[persistence] record_contribution(${trimmed}) threw: ${(err as Error).message}`,
          );
        }
      }
    },
    async topRankings(limit) {
      const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      try {
        const { data, error } = await withTimeout(
          `top_rankings(${safeLimit})`,
          client.rpc('top_rankings', {
            p_limit: safeLimit,
          }),
        );
        if (error) {
          console.warn(`[persistence] top_rankings failed: ${error.message}`);
          return [];
        }
        // PostgREST returns the function result as an array of rows when
        // the function declares RETURNS TABLE — cast through unknown to
        // narrow without losing the runtime safety of the empty default.
        return (data ?? []) as RankingEntry[];
      } catch (err) {
        console.warn(
          `[persistence] top_rankings threw: ${(err as Error).message}`,
        );
        return [];
      }
    },
  };
}
