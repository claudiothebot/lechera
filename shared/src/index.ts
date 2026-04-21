/**
 * Public surface of the `@milk-dreams/shared` package.
 *
 * Anything exported here is a contract between the client and the
 * server. Treat additions as "design carefully" and removals as
 * breaking — both consumers will fail to typecheck on a missing
 * export.
 */

export {
  DELIVERY_TOLERANCE,
  DREAM_GOALS,
  GOAL_RADIUS,
  goalFor,
  litresFor,
} from './dreams.js';
export type { Goal2D } from './dreams.js';

export {
  SPAWN_RING_INNER_M,
  SPAWN_RING_OUTER_M,
  SPAWN_X,
  SPAWN_Z,
  spawnPositionInRing,
} from './spawn.js';

export {
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  isValidName,
  sanitiseName,
} from './name.js';

export type {
  LeaderboardEntry,
  LeaderboardResponse,
} from './leaderboard.js';

export {
  UNKNOWN_COUNTRY_FLAG_EMOJI,
  countryCodeToFlagEmoji,
  countryCodeToFlagEmojiOrUn,
  isCountryCode,
  normaliseCountryCode,
} from './country.js';
