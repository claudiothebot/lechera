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
