/**
 * Wire shape of one row from the all-time leaderboard. The server's
 * `/leaderboard` endpoint returns `{ entries: LeaderboardEntry[] }`,
 * the client renders them verbatim. snake_case field names are kept
 * because they come straight from the Postgres `milk_dreams.rankings`
 * table via PostgREST — renaming them in transit would force the
 * server to materialise an extra DTO for no readability gain.
 */
export interface LeaderboardEntry {
  name: string;
  total_milk: number;
  rounds_played: number;
  best_round_milk: number;
  /** ISO 8601 UTC timestamp from Postgres. */
  last_played: string;
  /**
   * ISO 3166-1 alpha-2 country code captured at the player's last join
   * (e.g. `'ES'`, `'US'`). `null` when the server could not geolocate
   * the IP (local connections, VPNs, private networks, lookup failures)
   * OR when the database row pre-dates the Phase 7 migration. The RPC
   * intentionally keeps the previous value when the new one is null
   * (`coalesce(excluded.country, rankings.country)`) so a single failed
   * lookup doesn't blank an already-known country.
   */
  country: string | null;
}

/**
 * Aggregated payload returned by `GET /leaderboard?limit=N`. Wrapping
 * the array in an object leaves room for additional fields (last
 * refresh time, total players ever, etc.) without breaking older
 * clients that already expect `{ entries }`.
 */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}
