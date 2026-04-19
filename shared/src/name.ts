/**
 * Display-name validation shared between client and server.
 *
 * Same code on both sides means "if the client says it's valid, the
 * server agrees". Without that, a paste that survives client checks
 * (e.g. due to a different regex or order of operations) would be
 * silently rejected at join, leaving the player staring at a frozen
 * modal with no error message.
 *
 * Names are spoofable by design (per `MULTIPLAYER.md`); these helpers
 * are about stopping accidental garbage (zero-width chars, newlines,
 * pasted ANSI escapes) and enforcing a sane minimum length — not
 * about authentication.
 */

/**
 * Floor on the sanitised length. < 3 chars (initials, single chars)
 * read poorly on the floating name tag and on the leaderboard, so
 * we reject them outright instead of falling back silently.
 */
export const MIN_NAME_LENGTH = 3;

/**
 * Cap on the sanitised length. ≈ 18 monospace chars at the current
 * billboard font size — anything longer wraps or clips above the
 * avatar.
 */
export const MAX_NAME_LENGTH = 18;

/**
 * Strip control + format characters, collapse internal whitespace,
 * trim, length-cap, then trim AGAIN — truncation can land mid-space
 * ("Big Nasty Name Way " with the trailing space at position 18) so
 * the final trim is what makes the bound robust.
 *
 * Returns null if the cleaned result is empty OR shorter than
 * `MIN_NAME_LENGTH`. Returning null (instead of throwing) lets each
 * caller decide how to react (the modal disables the submit button and
 * shows an inline message; the server throws and rejects the join)
 * without a try/catch in the hot path.
 *
 * `\p{C}` covers control + format + private-use + surrogate. The
 * `u` flag is required for the Unicode property escape.
 */
export function sanitiseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  if (cleaned.length < MIN_NAME_LENGTH) return null;
  return cleaned;
}

/**
 * Convenience boolean form of `sanitiseName`. Useful for live
 * input validation in the modal (enabling/disabling the submit
 * button as the user types).
 */
export function isValidName(raw: unknown): boolean {
  return sanitiseName(raw) !== null;
}
