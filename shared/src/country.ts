/**
 * Phase 7 — country code helpers.
 *
 * The server captures an ISO 3166-1 alpha-2 code at join time
 * (`'ES'`, `'US'`, ...). These helpers normalise and render it. Kept
 * in the shared package because both sides deal with it:
 *   - server: normalises what `geoip-lite` returns before writing to
 *     the schema / Supabase.
 *   - client: renders the flag next to the leaderboard name.
 *
 * We intentionally do NOT ship a name table (Spain, United States, ...)
 * — the code + flag is enough for the HUD, and a name lookup would
 * duplicate what the browser already knows via `Intl.DisplayNames`
 * when we need it later.
 */

/**
 * Regional Indicator Symbol Letter A (U+1F1E6). ISO country codes map
 * to pairs of these via `'A'.charCodeAt(0) = 65` → `0x1F1E6`; the two
 * resulting code points rendered together form the flag emoji.
 */
const REGIONAL_INDICATOR_A = 0x1f1e6;

/**
 * Strict alpha-2 validator. Accepts uppercase A–Z only — matches what
 * `normaliseCountryCode` produces. `null` inputs (no geoip match)
 * return false without throwing so callers can use it as a render
 * guard.
 */
export function isCountryCode(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  if (value.length !== 2) return false;
  const a = value.charCodeAt(0);
  const b = value.charCodeAt(1);
  return a >= 65 && a <= 90 && b >= 65 && b <= 90;
}

/**
 * Normalise arbitrary input into a clean alpha-2 code or `null`.
 * Handles:
 *   - lowercase / mixed case (`'es'` → `'ES'`)
 *   - surrounding whitespace
 *   - the three-letter / numeric variants some geoip libs return
 *     (rejected as `null`; we don't translate, we only accept alpha-2)
 *   - `geoip-lite`'s empty-string convention for unknown regions
 *
 * Returns `null` for anything that isn't a two-letter A–Z code so the
 * database's `country char(2)` column can stay strict.
 */
export function normaliseCountryCode(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return isCountryCode(trimmed) ? trimmed : null;
}

/**
 * Convert an alpha-2 code into its flag emoji (e.g. `'ES'` → `'🇪🇸'`).
 * Returns an empty string for invalid / null inputs so callers can
 * concatenate without branching.
 *
 * Flags render as two regional-indicator code points side by side.
 * Fonts on most modern platforms compose them into the national flag;
 * on platforms without that support (old Windows), they fall back to
 * rendering the letters, which is still legible.
 */
export function countryCodeToFlagEmoji(code: string | null | undefined): string {
  const clean = normaliseCountryCode(code);
  if (!clean) return '';
  const first = clean.charCodeAt(0) - 65 + REGIONAL_INDICATOR_A;
  const second = clean.charCodeAt(1) - 65 + REGIONAL_INDICATOR_A;
  return String.fromCodePoint(first, second);
}

/**
 * UN flag (U+1F1FA U+1F1F3). Shown in the HUD when geoip did not resolve
 * a country (localhost, private IP, VPN-only ranges) so the player
 * still sees a consistent "no country" affordance.
 */
export const UNKNOWN_COUNTRY_FLAG_EMOJI = '🇺🇳';

/**
 * Known alpha-2 → national flag; otherwise the UN placeholder (never
 * empty — useful for leaderboard rows and the online net badge).
 */
export function countryCodeToFlagEmojiOrUn(code: string | null | undefined): string {
  return countryCodeToFlagEmoji(code) || UNKNOWN_COUNTRY_FLAG_EMOJI;
}
