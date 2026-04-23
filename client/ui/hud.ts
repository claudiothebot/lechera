/**
 * HUD state model:
 *  - 'playing'   → regular play, timer running
 *  - 'spilled'   → game over because balance tipped past its threshold
 *  - 'timeout'   → game over because the 3-minute countdown hit zero
 *
 * On 'spilled'/'timeout' the HUD shows a final summary with total litres
 * delivered and the dream the player was chasing when it ended.
 */
import { countryCodeToFlagEmojiOrUn } from '@milk-dreams/shared';
import type { FirstRunCoachView } from './firstRunCoach';

export type GameStatus = 'playing' | 'spilled' | 'timeout';

export type ToastTone = 'default' | 'celebrate' | 'warn';

export interface ToastOptions {
  /** Optional leading emoji (reward face, spill cue, etc.). */
  emoji?: string;
  tone?: ToastTone;
}

/**
 * Cinematic center-screen message (see `showProclamation`). Kept
 * narrow on purpose: one short headline plus an optional one-line
 * caption above it. Keep copy short — the Bungee face doesn't wrap
 * gracefully past ~2 words per line.
 */
export type ProclamationKind = 'dream' | 'spill';

export interface ProclamationView {
  kind: ProclamationKind;
  /** Small overline above the title (e.g. "CHASING", "OH NO"). */
  caption?: string;
  /** Main line — rendered in the display typeface. */
  title: string;
  /** Optional decorative emoji to the left of the title. */
  emoji?: string;
}

/**
 * Multiplayer connection status, mirrored from `net/multiplayer.ts`.
 * Re-declared here to keep `hud.ts` from depending on the net module.
 */
export type NetStatus = 'idle' | 'connecting' | 'online' | 'offline';

export interface GameOverContext {
  /** Total litres successfully delivered before failing. */
  litresDelivered: number;
  /** Name of the dream we were chasing when the run ended. */
  currentDream: string;
}

export interface ScoreboardEntry {
  /** Display name of the player. */
  name: string;
  /**
   * Cumulative litres delivered this round (Phase 4.5 — survives a
   * spill, monotonic). Was previously `deliveries` (= `dreamIndex`)
   * before soft-spill made the dream chain a poor proxy for total
   * contribution.
   */
  litresDelivered: number;
  /** HSL hue in [0, 1) — used for the colored dot before the name. */
  colorHue: number;
  /** True for the local player so the row can be visually emphasised. */
  isSelf: boolean;
}

/**
 * One row of the persistent all-time leaderboard (Phase 5). Mirrors
 * `LeaderboardEntry` from `net/leaderboard.ts` minus the timestamp
 * (which we don't show in the panel — keep it scannable).
 */
export interface AllTimeEntry {
  name: string;
  totalMilk: number;
  roundsPlayed: number;
  /**
   * ISO 3166-1 alpha-2 country code captured server-side at the
   * player's last join (Phase 7). `null` when geolocation failed or
   * the row pre-dates the country column; the HUD renders nothing in
   * that case.
   */
  country: string | null;
}

/**
 * Balance hint state, one call per frame while playing. The hint cluster
 * is pinned to `(screenX, screenY)` in CSS pixels; the forward/right axes
 * are camera-relative so the caller is responsible for mapping
 * `balance.tiltForward/Right` straight through.
 *
 * Axes are shown INDEPENDENTLY: at most ONE arrow per axis appears (the
 * opposing direction, i.e. the key the player should press to correct).
 */
export interface BalanceHintInput {
  /** Camera-space tilt, radians. Positive forward = leaning away from camera. */
  tiltForward: number;
  /** Camera-space tilt, radians. Positive right = leaning to camera-right. */
  tiltRight: number;
  /** Current spill threshold (rad). Used to normalise severity. */
  maxTilt: number;
  /** Centre of the hint cluster, in CSS pixels relative to the viewport. */
  screenX: number;
  screenY: number;
  /** False when the jug is off-screen or behind the camera. */
  visible: boolean;
}

export interface Hud {
  setBalance(normalizedTilt: number): void;
  /** Per-frame update for the arrow prompts above the jug. */
  setBalanceHints(input: BalanceHintInput): void;
  /** Hide all four arrows (e.g. when not playing). */
  hideBalanceHints(): void;
  setDistance(meters: number): void;
  setStatus(status: GameStatus, ctx?: GameOverContext): void;
  setLocked(locked: boolean): void;
  /**
   * Show / hide the central instructions panel (keyboard + jug diagram).
   * The panel is visible at boot and auto-hides on first engagement;
   * Space toggles it explicitly after that. Separate from `setLocked`
   * (the bottom "Space · controls" hint pill) on purpose — the hint
   * stays visible while the panel is open and vice versa.
   */
  setInstructionsVisible(visible: boolean): void;
  /**
   * Toggle the instructions panel open/closed. Returns the new state
   * (`true` = visible). Cheap — reads a DOM class list.
   */
  toggleInstructions(): boolean;
  /** Whether the instructions overlay is currently visible (for conditional HUD renders). */
  getInstructionsVisible(): boolean;
  /**
   * Show / hide the "Tale" panel (the traditional Spanish fable of La
   * Lechera the game is themed around). Mutually exclusive with the
   * instructions panel — opening one closes the other.
   */
  setStoryVisible(visible: boolean): void;
  /** Toggle the story panel. Returns the new visibility state. */
  toggleStory(): boolean;
  /** Whether the story overlay is currently visible. */
  getStoryVisible(): boolean;
  /**
   * Milk on the jug (`carrying`) and total deliveries completed (`delivered`;
   * same meaning as in the game-over summary).
   */
  setMilkStats(carrying: number, delivered: number): void;
  /** Dream name for accessibility on the 3D preview wrapper. */
  setDreamLabel(dreamName: string): void;
  /** Remaining time, seconds. Displayed as mm:ss. */
  setTime(secondsLeft: number): void;
  /** Match / session round index (server round online, local counter offline). */
  setRound(roundNumber: number): void;
  /** Transient message (fades after durationMs). */
  showToast(text: string, durationMs?: number, options?: ToastOptions): void;
  /**
   * Cinematic, center-screen proclamation used for dream advance / spill.
   * Much louder than `showToast` (Bungee title, glow, pop-in animation)
   * and intentionally NOT a card — it should feel like in-world signage,
   * not a system notification.
   */
  showProclamation(
    view: ProclamationView,
    durationMs?: number,
  ): void;
  /** Shows the invincibility line when `DEBUG_INVINCIBLE` is on. */
  setDebugInvincible(visible: boolean): void;
  /**
   * Update the multiplayer status badge. `selfName` is the player's
   * chosen display name (or null if unknown). `selfHue` is the
   * server-assigned color hue in [0, 1) — when present, the name is
   * tinted to match the in-world Lechera body so the player's
   * identity reads at a glance from the HUD too. Pass `null` for
   * hue to fall back to the default fg color (used while
   * connecting / offline).
   * `selfCountry` is an ISO alpha-2 code when the server resolved the
   * join IP (Phase 7). Only shown in the badge when `status === 'online'`;
   * pass `null`/`undefined` when unknown.
   */
  setNetStatus(
    status: NetStatus,
    selfName: string | null,
    selfHue?: number | null,
    selfCountry?: string | null,
  ): void;
  /**
   * Show the round-end scoreboard with the given entries (already
   * sorted, top first). `secondsLeft` shows the countdown to the next
   * round. Pass `null` to hide.
   */
  showScoreboard(entries: ScoreboardEntry[], secondsLeft: number): void;
  /**
   * Open the scoreboard overlay in "on-demand ranking" mode: same
   * entries/leaderboard layout as the between-rounds view, but titled
   * "Ranking" and without the countdown subtitle (there's no next-round
   * deadline — the player opened this panel themselves).
   */
  showRanking(entries: ScoreboardEntry[]): void;
  hideScoreboard(): void;
  /** True while the scoreboard/ranking overlay is up (either variant). */
  isScoreboardVisible(): boolean;
  /**
   * Update only the countdown number on the visible scoreboard.
   * Cheap (DOM single-text-node update); call every frame while the
   * scoreboard is up.
   */
  setScoreboardCountdown(secondsLeft: number): void;
  /**
   * Render the persistent all-time leaderboard inside the scoreboard
   * overlay (Phase 5). Pass `null` to show a "loading…" placeholder
   * (used while the fetch is in flight); pass `[]` to render an
   * explicit "no data yet" line so the user knows the request landed.
   * Sorting is the caller's responsibility (server already sorts by
   * total_milk desc).
   */
  setAllTimeLeaderboard(
    entries: readonly AllTimeEntry[] | null,
    selfName: string | null,
  ): void;
  /**
   * First-run bottom strip (desktop). `text: null` hides it; may show
   * key clusters matching the instruction panel. Dedupes identical views.
   */
  setFirstRunCoach(view: FirstRunCoachView): void;
}

export interface HudOptions {
  /**
   * Called when the player clicks the "Instructions" HUD button.
   * Equivalent to a Space / Enter press — the caller is expected to
   * call `hud.toggleInstructions()` and disable any auto-hide logic
   * so the panel stays up until dismissed.
   */
  onInstructionsClick?: () => void;
  /**
   * Called when the player clicks the "Tale" HUD button. The HUD
   * already toggles the story panel internally; the callback exists so
   * the caller can mirror side effects (e.g. cancel the auto-hide on
   * the instructions panel so things don't fight each other on boot).
   */
  onStoryClick?: () => void;
  /**
   * Called when the player clicks the "Ranking" HUD button. The
   * caller decides whether to open the overlay (via `showRanking`)
   * with the current-round entries + all-time leaderboard, or close
   * it (via `hideScoreboard`) if already visible.
   */
  onRankingClick?: () => void;
  /**
   * Called when the player taps the "Play again" button shown on
   * game-over. Exists mainly for touch devices (no `R` key), but
   * desktop can click it too — both paths should route to the same
   * `restart()` in main.ts.
   */
  onRestartClick?: () => void;
}

export function createHud(options: HudOptions = {}): Hud {
  const spillValue = document.querySelector<HTMLElement>('#spill-value')!;
  const balanceLabel = document.querySelector<HTMLElement>('#balance-label')!;
  const balanceChrome = document.querySelector<HTMLElement>('.hud-balance-chrome')!;
  const balanceBarTrack = document.querySelector<HTMLElement>('#balance-bar-track')!;
  const spillBar = document.querySelector<HTMLElement>('#spill-bar')!;
  const distanceValue = document.querySelector<HTMLElement>('#minimap-distance')!;
  const messageEl = document.querySelector<HTMLElement>('#message')!;
  const hintEl = document.querySelector<HTMLElement>('#hint')!;
  const litresCarrying = document.querySelector<HTMLElement>('#litres-carrying')!;
  const litresDeliveredEl = document.querySelector<HTMLElement>('#litres-delivered')!;
  const dreamWrap = document.querySelector<HTMLElement>('#hud-dream-wrap')!;
  const timerValue = document.querySelector<HTMLElement>('#timer-value')!;
  const roundLabel = document.querySelector<HTMLElement>('#hud-round')!;
  const toastEl = document.querySelector<HTMLElement>('#toast')!;
  const proclamationEl =
    document.querySelector<HTMLElement>('#hud-proclamation')!;
  const proclamationCaption = proclamationEl.querySelector<HTMLElement>(
    '.proclamation__caption',
  )!;
  const proclamationTitle = proclamationEl.querySelector<HTMLElement>(
    '.proclamation__title',
  )!;
  const proclamationEmoji = proclamationEl.querySelector<HTMLElement>(
    '.proclamation__emoji',
  )!;
  const playtestHint = document.querySelector<HTMLElement>(
    '#debug-playtest-hint',
  );
  const netBadge = document.querySelector<HTMLElement>('#net-badge')!;
  const netBadgeFlag = netBadge.querySelector<HTMLElement>('.net-badge__flag')!;
  const netBadgeText = netBadge.querySelector<HTMLElement>('.net-badge__text')!;
  const scoreboard = document.querySelector<HTMLElement>('#scoreboard')!;
  const scoreboardTitle =
    document.querySelector<HTMLElement>('#scoreboard-title')!;
  const scoreboardSubtitle =
    document.querySelector<HTMLElement>('#scoreboard-subtitle')!;
  const scoreboardList =
    document.querySelector<HTMLOListElement>('#scoreboard-list')!;
  const scoreboardCountdown =
    document.querySelector<HTMLElement>('#scoreboard-countdown')!;
  const leaderboardList =
    document.querySelector<HTMLOListElement>('#leaderboard-list')!;
  const firstRunCoach = document.querySelector<HTMLElement>('#hud-coach')!;
  const firstRunCoachKeys =
    firstRunCoach.querySelector<HTMLElement>('.hud-coach__keys')!;
  const firstRunCoachText = firstRunCoach.querySelector<HTMLElement>(
    '.hud-coach__text',
  )!;
  const instructionsPanel = document.querySelector<HTMLElement>(
    '#instructions-panel',
  )!;
  const instructionsBackdrop = instructionsPanel.querySelector<HTMLElement>(
    '.instructions-panel__backdrop',
  );
  const scoreboardBackdrop = scoreboard.querySelector<HTMLElement>(
    '.scoreboard__backdrop',
  );
  const instructionsButton =
    document.querySelector<HTMLButtonElement>('#hud-action-instructions');
  const rankingButton =
    document.querySelector<HTMLButtonElement>('#hud-action-ranking');
  const storyPanel = document.querySelector<HTMLElement>('#story-panel')!;
  const storyBackdrop = storyPanel.querySelector<HTMLElement>(
    '.story-panel__backdrop',
  );
  const storyButton =
    document.querySelector<HTMLButtonElement>('#hud-action-story');
  // Optional by design: older builds / tests may not render this
  // button, and we want the HUD to degrade to the pre-existing keyboard
  // restart affordance without throwing.
  const restartCtaButton =
    document.querySelector<HTMLButtonElement>('#game-over-cta');

  const showRestartCta = (): void => {
    if (!restartCtaButton) return;
    restartCtaButton.classList.remove('hidden');
    restartCtaButton.setAttribute('aria-hidden', 'false');
  };
  const hideRestartCta = (): void => {
    if (!restartCtaButton) return;
    restartCtaButton.classList.add('hidden');
    restartCtaButton.setAttribute('aria-hidden', 'true');
  };
  const balanceHints = document.querySelector<HTMLElement>('#balance-hints')!;
  const balanceHintUp = balanceHints.querySelector<HTMLElement>('.balance-hint--up')!;
  const balanceHintDown = balanceHints.querySelector<HTMLElement>('.balance-hint--down')!;
  const balanceHintLeft = balanceHints.querySelector<HTMLElement>('.balance-hint--left')!;
  const balanceHintRight = balanceHints.querySelector<HTMLElement>('.balance-hint--right')!;

  let lastBalancePct = -1;
  let lastDistance = -1;
  let lastStatus: GameStatus | null = null;
  let lastCarrying = -1;
  let lastDelivered = -1;
  let lastTimerText = '';
  let lastRound = -1;
  let lastDreamLabel = '';
  let toastTimer: number | null = null;
  let proclamationTimer: number | null = null;
  let lastNetStatus: NetStatus | null = null;
  let lastNetName: string | null = null;
  let lastNetHue: number | null = null;
  let lastNetCountry: string | null = null;
  let lastScoreboardCountdown = -1;

  // -- Balance hints -----------------------------------------------------
  // Axis thresholds: below these fractions of the current `maxTilt`, the
  // arrow is hidden entirely. Above, opacity + scale + colour ramp with
  // severity so "almost spilling" reads brighter/bigger than "slightly off".
  const BALANCE_HINT_MIN_FRACTION = 0.1;
  const BALANCE_HINT_FULL_FRACTION = 0.75;

  // Reused to avoid layout thrash. Always mutate then read once in JS.
  let lastHintVisible = false;

  const applyHintAxis = (
    positive: HTMLElement,
    negative: HTMLElement,
    tilt: number,
    maxTilt: number,
  ): void => {
    const frac = maxTilt > 0 ? Math.abs(tilt) / maxTilt : 0;
    if (frac < BALANCE_HINT_MIN_FRACTION) {
      positive.classList.remove('is-active');
      negative.classList.remove('is-active');
      return;
    }
    // Prompt the key that REDUCES |tilt|: if jug leans positive, show the
    // arrow on the NEGATIVE side (player presses "backwards").
    const leansPositive = tilt > 0;
    const active = leansPositive ? negative : positive;
    const idle = leansPositive ? positive : negative;
    idle.classList.remove('is-active');

    const severity = Math.min(
      1,
      Math.max(
        0,
        (frac - BALANCE_HINT_MIN_FRACTION) /
          (BALANCE_HINT_FULL_FRACTION - BALANCE_HINT_MIN_FRACTION),
      ),
    );
    const opacity = 0.55 + severity * 0.45;
    const scale = 0.85 + severity * 0.35;
    const color =
      severity >= 0.75
        ? '#f29179'
        : severity >= 0.45
          ? '#f1b16a'
          : '#f1d28d';

    active.style.setProperty('--hint-opacity', String(opacity.toFixed(2)));
    active.style.setProperty('--hint-scale', String(scale.toFixed(2)));
    active.style.setProperty('--hint-color', color);
    active.classList.add('is-active');
  };

  const setBalanceHints: Hud['setBalanceHints'] = (input) => {
    if (!input.visible || input.maxTilt <= 0) {
      if (lastHintVisible) {
        lastHintVisible = false;
        balanceHints.classList.remove('is-visible');
        balanceHintUp.classList.remove('is-active');
        balanceHintDown.classList.remove('is-active');
        balanceHintLeft.classList.remove('is-active');
        balanceHintRight.classList.remove('is-active');
      }
      return;
    }
    // Forward axis: up (away from camera) vs down (toward camera).
    // A positive `tiltForward` means the jug leans forward -> player
    // must pull it back -> DOWN arrow is the corrective prompt.
    applyHintAxis(balanceHintUp, balanceHintDown, input.tiltForward, input.maxTilt);
    // Lateral: `tiltRight` > 0 = lean camera-right → corrective key is left; list
    // (positive, negative) maps lean-on-positive to the "negative" arrow node.
    applyHintAxis(balanceHintRight, balanceHintLeft, input.tiltRight, input.maxTilt);

    // Top-left at (x,y) pushed the 88×88 cluster down-right; chain centers on jug.
    balanceHints.style.transform = `translate3d(${input.screenX}px, ${input.screenY}px, 0) translate(-50%, -50%)`;
    if (!lastHintVisible) {
      lastHintVisible = true;
      balanceHints.classList.add('is-visible');
    }
  };

  const hideBalanceHints: Hud['hideBalanceHints'] = () => {
    if (!lastHintVisible) return;
    lastHintVisible = false;
    balanceHints.classList.remove('is-visible');
    balanceHintUp.classList.remove('is-active');
    balanceHintDown.classList.remove('is-active');
    balanceHintLeft.classList.remove('is-active');
    balanceHintRight.classList.remove('is-active');
  };
  // ----------------------------------------------------------------------

  /** ~15%–100% maps to pulse speed; below ~14% the bar stays calm. */
  const BALANCE_PULSE_T0 = 0.14;
  const BALANCE_PULSE_DUR_LO = 0.88;
  const BALANCE_PULSE_DUR_HI = 0.2;

  const setBalance: Hud['setBalance'] = (normalizedTilt) => {
    const t = Math.max(0, Math.min(1, normalizedTilt));
    const stressed = t >= BALANCE_PULSE_T0;
    /** Vars live on the chrome so both the card + track share timing / stress. */
    balanceChrome.classList.toggle('is-balance-urgent', stressed);
    if (stressed) {
      const s = (t - BALANCE_PULSE_T0) / (1 - BALANCE_PULSE_T0);
      const dur = BALANCE_PULSE_DUR_LO - s * (BALANCE_PULSE_DUR_LO - BALANCE_PULSE_DUR_HI);
      balanceChrome.style.setProperty('--balance-pulse-sec', `${dur.toFixed(3)}s`);
      balanceChrome.style.setProperty('--balance-stress', s.toFixed(4));
    } else {
      balanceChrome.style.removeProperty('--balance-pulse-sec');
      balanceChrome.style.removeProperty('--balance-stress');
    }

    const pct = Math.round(t * 100);
    if (pct === lastBalancePct) return;
    lastBalancePct = pct;
    spillValue.textContent = `${pct}%`;
    spillBar.style.width = `${pct}%`;
    const color = pct >= 80 ? '#f29179' : pct >= 50 ? '#f1b16a' : '#f1d28d';
    const glow =
      pct >= 80
        ? 'rgba(242, 145, 121, 0.42)'
        : pct >= 50
          ? 'rgba(241, 177, 106, 0.38)'
          : 'rgba(241, 210, 141, 0.35)';
    spillBar.style.background = `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 52%), ${color}`;
    spillBar.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.3), 0 0 18px ${glow}`;
    const readoutShadow = `0 1px 2px rgba(0,0,0,0.55), 0 0 16px ${glow}`;
    spillValue.style.color = color;
    spillValue.style.textShadow = readoutShadow;
    balanceLabel.style.color = color;
    balanceLabel.style.textShadow = readoutShadow;
  };

  const setDistance: Hud['setDistance'] = (meters) => {
    const rounded = Math.max(0, Math.round(meters));
    if (rounded !== lastDistance) {
      lastDistance = rounded;
      const numEl = distanceValue.querySelector('.distance-num');
      if (numEl) numEl.textContent = String(rounded);
    }
  };

  const setStatus: Hud['setStatus'] = (status, ctx) => {
    if (status === lastStatus) return;
    lastStatus = status;
    messageEl.classList.remove('win', 'fail');
    if (status === 'playing') {
      messageEl.textContent = '';
      hideRestartCta();
      return;
    }
    if (status === 'spilled') {
      messageEl.classList.add('fail');
      const litres = ctx?.litresDelivered ?? 0;
      const dream = ctx?.currentDream ?? '—';
      // `message-sub--kbd` hides the "R to …" line on touch devices via
      // CSS (`body.is-touch .message-sub--kbd { display: none; }`): the
      // dedicated `game-over-cta` button handles restart there.
      messageEl.innerHTML =
        `<div class="message-gameover message-gameover--spill">` +
        `<span class="message-gameover__emoji" aria-hidden="true">🥛💦</span>` +
        `<div class="message-gameover__body">` +
        `You spilled the milk!<br>` +
        `<span class="message-sub">` +
        `You were dreaming of <b>${dream}</b>. You had delivered ${litres} L.` +
        `</span><br>` +
        `<span class="message-sub message-sub--kbd">R to dream again</span>` +
        `</div></div>`;
      showRestartCta();
      return;
    }
    messageEl.classList.add('fail');
    const litres = ctx?.litresDelivered ?? 0;
    messageEl.innerHTML =
      `Time's up<br>` +
      `<span class="message-sub">You delivered ${litres} L before dawn.</span><br>` +
      `<span class="message-sub message-sub--kbd">R to start again</span>`;
    showRestartCta();
  };

  const setLocked: Hud['setLocked'] = (locked) => {
    hintEl.classList.toggle('hidden', locked);
  };

  let instructionsVisible = !instructionsPanel.classList.contains('hidden');
  const syncInstructionsButton = (): void => {
    instructionsButton?.classList.toggle('is-active', instructionsVisible);
    instructionsButton?.setAttribute(
      'aria-expanded',
      instructionsVisible ? 'true' : 'false',
    );
  };
  syncInstructionsButton();

  // --- Boot attract-mode on the Instructions button ---------------------
  // First-time players don't always notice the HUD button once the
  // initial "How to play" panel auto-hides. We tag the button with an
  // attention class at boot so CSS pulses it while the panel is closed
  // (`.hud-action--attention:not(.is-active)`), then clear the class
  // after ~30s or on first interaction / panel toggle, whichever comes
  // first. Interaction wins so we don't keep pulsing at a player who has
  // already acknowledged the button.
  const ATTENTION_MS = 30_000;
  let attentionTimer: number | null = null;
  const stopAttention = (): void => {
    if (attentionTimer !== null) {
      window.clearTimeout(attentionTimer);
      attentionTimer = null;
    }
    instructionsButton?.classList.remove('hud-action--attention');
  };
  if (instructionsButton) {
    instructionsButton.classList.add('hud-action--attention');
    attentionTimer = window.setTimeout(stopAttention, ATTENTION_MS);
  }

  const setInstructionsVisible: Hud['setInstructionsVisible'] = (visible) => {
    if (visible === instructionsVisible) return;
    // Mutual exclusion: the story panel is a sibling popup with the same
    // chrome; we don't want both open at once because their cards would
    // stack and the backdrop clicks would fight for precedence.
    if (visible && storyVisible) setStoryVisible(false);
    instructionsVisible = visible;
    instructionsPanel.classList.toggle('hidden', !visible);
    instructionsPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    syncInstructionsButton();
  };
  const toggleInstructions: Hud['toggleInstructions'] = () => {
    // Any explicit toggle counts as acknowledgement of the button's role.
    stopAttention();
    setInstructionsVisible(!instructionsVisible);
    return instructionsVisible;
  };
  const getInstructionsVisible: Hud['getInstructionsVisible'] = () =>
    instructionsVisible;

  // --- Story panel (traditional Spanish fable) --------------------------
  // Same overlay model as the instructions panel: a backdrop that closes
  // on click, a card with prose. Kept purely presentational — no game
  // state depends on it. Opens/closes are mutually exclusive with the
  // instructions panel so only one narrative popup is ever on screen.
  let storyVisible = !storyPanel.classList.contains('hidden');
  const syncStoryButton = (): void => {
    storyButton?.classList.toggle('is-active', storyVisible);
    storyButton?.setAttribute(
      'aria-expanded',
      storyVisible ? 'true' : 'false',
    );
  };
  syncStoryButton();
  const setStoryVisible: Hud['setStoryVisible'] = (visible) => {
    if (visible === storyVisible) return;
    if (visible && instructionsVisible) setInstructionsVisible(false);
    storyVisible = visible;
    storyPanel.classList.toggle('hidden', !visible);
    storyPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    syncStoryButton();
  };
  const toggleStory: Hud['toggleStory'] = () => {
    setStoryVisible(!storyVisible);
    return storyVisible;
  };
  const getStoryVisible: Hud['getStoryVisible'] = () => storyVisible;

  // Wire the HUD buttons once. The callbacks own state transitions so
  // hud.ts doesn't need to know about multiplayer / autoHidePending.
  instructionsButton?.addEventListener('click', (ev) => {
    ev.preventDefault();
    // Buttons live inside the always-focusable HUD; blurring them after
    // click prevents Space/Enter from re-triggering via :focus.
    instructionsButton.blur();
    stopAttention();
    options.onInstructionsClick?.();
  });
  storyButton?.addEventListener('click', (ev) => {
    ev.preventDefault();
    storyButton.blur();
    toggleStory();
    options.onStoryClick?.();
  });
  rankingButton?.addEventListener('click', (ev) => {
    ev.preventDefault();
    rankingButton.blur();
    options.onRankingClick?.();
  });
  restartCtaButton?.addEventListener('click', (ev) => {
    ev.preventDefault();
    restartCtaButton.blur();
    options.onRestartClick?.();
  });

  const setMilkStats: Hud['setMilkStats'] = (carrying, delivered) => {
    if (carrying === lastCarrying && delivered === lastDelivered) return;
    lastCarrying = carrying;
    lastDelivered = delivered;
    litresCarrying.textContent = `${carrying}L`;
    litresDeliveredEl.textContent = `${delivered}L`;
  };

  const setDreamLabel: Hud['setDreamLabel'] = (dreamName) => {
    if (dreamName === lastDreamLabel) return;
    lastDreamLabel = dreamName;
    dreamWrap.setAttribute('aria-label', `Current dream: ${dreamName}`);
  };

  const setTime: Hud['setTime'] = (secondsLeft) => {
    const s = Math.max(0, Math.ceil(secondsLeft));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const text = `${mm}:${ss.toString().padStart(2, '0')}`;
    if (text === lastTimerText) return;
    lastTimerText = text;
    timerValue.textContent = text;
    timerValue.classList.toggle('low', s <= 30);
  };

  const setRound: Hud['setRound'] = (roundNumber) => {
    const n = Math.max(1, Math.floor(roundNumber));
    if (n === lastRound) return;
    lastRound = n;
    roundLabel.textContent = `Round ${n}`;
  };

  const showToast: Hud['showToast'] = (text, durationMs = 1800, options) => {
    const tone = options?.tone ?? 'default';
    toastEl.classList.remove('toast--celebrate', 'toast--warn');
    if (tone === 'celebrate') toastEl.classList.add('toast--celebrate');
    else if (tone === 'warn') toastEl.classList.add('toast--warn');

    const emoji = options?.emoji?.trim();
    const emojiHtml = emoji
      ? `<span class="toast__emoji" aria-hidden="true">${emoji}</span>`
      : '';
    toastEl.innerHTML =
      `<div class="toast__motion">` +
      `<div class="toast__inner">${emojiHtml}<p class="toast__text"></p></div>` +
      `</div>`;
    const textEl = toastEl.querySelector('.toast__text');
    if (textEl) textEl.textContent = text;

    const motion = toastEl.querySelector<HTMLElement>('.toast__motion');
    toastEl.classList.remove('visible');
    motion?.classList.remove('toast--play');

    const runIn = (): void => {
      motion?.classList.add('toast--play');
      toastEl.classList.add('visible');
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(runIn);
    });

    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('visible');
      motion?.classList.remove('toast--play');
      toastTimer = null;
    }, durationMs);
  };

  const PROCLAMATION_KINDS: readonly ProclamationKind[] = ['dream', 'spill'];
  const showProclamation: Hud['showProclamation'] = (view, durationMs = 2200) => {
    // Reset kind classes so re-entrant calls don't leave both tones on.
    for (const k of PROCLAMATION_KINDS) {
      proclamationEl.classList.remove(`proclamation--${k}`);
    }
    proclamationEl.classList.add(`proclamation--${view.kind}`);

    const caption = view.caption?.trim() ?? '';
    proclamationCaption.textContent = caption;
    proclamationCaption.hidden = caption.length === 0;

    proclamationTitle.textContent = view.title;

    const emoji = view.emoji?.trim() ?? '';
    proclamationEmoji.textContent = emoji;
    proclamationEmoji.hidden = emoji.length === 0;

    // Force a reflow so re-triggering the same kind in quick succession
    // still re-plays the pop-in animation (class remove → reflow → add).
    proclamationEl.classList.remove('is-visible', 'is-playing');
    void proclamationEl.offsetWidth;
    proclamationEl.classList.add('is-visible', 'is-playing');
    proclamationEl.setAttribute('aria-hidden', 'false');

    if (proclamationTimer !== null) window.clearTimeout(proclamationTimer);
    proclamationTimer = window.setTimeout(() => {
      proclamationEl.classList.remove('is-visible', 'is-playing');
      proclamationEl.setAttribute('aria-hidden', 'true');
      proclamationTimer = null;
    }, durationMs);
  };

  const setDebugInvincible: Hud['setDebugInvincible'] = (visible) => {
    if (!playtestHint) return;
    playtestHint.classList.toggle('hidden', !visible);
    playtestHint.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  const setNetStatus: Hud['setNetStatus'] = (status, selfName, selfHue, selfCountry) => {
    const hue = selfHue ?? null;
    const countryKey =
      status === 'online' && typeof selfCountry === 'string' && selfCountry.trim()
        ? selfCountry.trim().toUpperCase()
        : null;
    if (
      status === lastNetStatus &&
      selfName === lastNetName &&
      hue === lastNetHue &&
      countryKey === lastNetCountry
    ) {
      return;
    }
    lastNetStatus = status;
    lastNetName = selfName;
    lastNetHue = hue;
    lastNetCountry = countryKey;
    netBadge.classList.remove(
      'net-badge--idle',
      'net-badge--connecting',
      'net-badge--online',
      'net-badge--offline',
    );
    netBadge.classList.add(`net-badge--${status}`);
    switch (status) {
      case 'idle':
        netBadgeText.textContent = 'Local';
        break;
      case 'connecting':
        netBadgeText.textContent = 'Connecting…';
        break;
      case 'online':
        netBadgeText.textContent = selfName?.trim()
          ? selfName.trim()
          : 'Player';
        break;
      case 'offline':
        netBadgeText.textContent = 'Local';
        break;
    }
    // Phase 7 — flag beside the dot when online; real country or UN 🇺🇳
    // when geoip missed (localhost, etc.).
    if (status === 'online') {
      netBadgeFlag.textContent = countryCodeToFlagEmojiOrUn(countryKey);
      netBadgeFlag.hidden = false;
      netBadgeFlag.title = countryKey ?? 'Country not detected';
    } else {
      netBadgeFlag.textContent = '';
      netBadgeFlag.hidden = true;
      netBadgeFlag.removeAttribute('title');
    }
    // Tint the name when we know which hue the server assigned us.
    // Same HSL formula as the in-world tint (see remotePlayers.ts) so
    // the colour reads as "this is YOUR lechera" everywhere it shows.
    if (status === 'online' && hue !== null) {
      const css = `hsl(${(hue * 360).toFixed(0)} 70% 72%)`;
      netBadgeText.style.color = css;
      netBadge.style.setProperty('--net-badge-accent', css);
    } else {
      netBadgeText.style.removeProperty('color');
      netBadge.style.removeProperty('--net-badge-accent');
    }
  };

  const renderScoreboardCountdown = (secondsLeft: number) => {
    const s = Math.max(0, Math.ceil(secondsLeft));
    if (s === lastScoreboardCountdown) return;
    lastScoreboardCountdown = s;
    scoreboardCountdown.textContent = String(s);
  };

  const renderScoreboardEntries = (entries: ScoreboardEntry[]): void => {
    // Rebuild the list from scratch — it only changes once per round
    // end (5–20 entries), so DOM diffing isn't worth the complexity.
    scoreboardList.replaceChildren();
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i]!;
      const li = document.createElement('li');

      const rank = document.createElement('span');
      rank.className = 'scoreboard__rank';
      rank.textContent = `${i + 1}.`;
      li.appendChild(rank);

      const dot = document.createElement('span');
      dot.className = 'scoreboard__dot';
      // Match the in-world tint applied to the Lechera body — see
      // `remotePlayers.ts` and `player.ts` for the same HSL formula.
      dot.style.background = `hsl(${(e.colorHue * 360).toFixed(0)} 70% 55%)`;
      li.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'scoreboard__name';
      if (e.isSelf) name.classList.add('scoreboard__name--self');
      name.textContent = e.name + (e.isSelf ? ' (you)' : '');
      li.appendChild(name);

      const deliveries = document.createElement('span');
      deliveries.className = 'scoreboard__deliveries';
      const strong = document.createElement('strong');
      strong.textContent = String(e.litresDelivered);
      deliveries.appendChild(strong);
      deliveries.appendChild(document.createTextNode(' L'));
      li.appendChild(deliveries);

      scoreboardList.appendChild(li);
    }
  };

  const revealScoreboard = (): void => {
    scoreboard.classList.remove('hidden');
    scoreboard.setAttribute('aria-hidden', 'false');
    rankingButton?.classList.add('is-active');
    rankingButton?.setAttribute('aria-expanded', 'true');
  };

  const showScoreboard: Hud['showScoreboard'] = (entries, secondsLeft) => {
    renderScoreboardEntries(entries);
    scoreboardTitle.textContent = 'Round over';
    scoreboardSubtitle.hidden = false;
    // Re-hydrate the countdown span (it gets swapped out of the DOM in
    // ranking mode where the whole subtitle is replaced wholesale).
    scoreboardSubtitle.replaceChildren(
      document.createTextNode('Next in '),
      scoreboardCountdown,
      document.createTextNode('s'),
    );
    lastScoreboardCountdown = -1;
    renderScoreboardCountdown(secondsLeft);
    revealScoreboard();
  };

  const showRanking: Hud['showRanking'] = (entries) => {
    renderScoreboardEntries(entries);
    scoreboardTitle.textContent = 'Ranking';
    // No deadline to show: the player opened this themselves. Hide the
    // subtitle rather than emptying it so the panel keeps compact
    // vertical rhythm with the list below.
    scoreboardSubtitle.hidden = true;
    revealScoreboard();
  };

  const hideScoreboard: Hud['hideScoreboard'] = () => {
    scoreboard.classList.add('hidden');
    scoreboard.setAttribute('aria-hidden', 'true');
    rankingButton?.classList.remove('is-active');
    rankingButton?.setAttribute('aria-expanded', 'false');
  };

  const isScoreboardVisible: Hud['isScoreboardVisible'] = () =>
    !scoreboard.classList.contains('hidden');

  instructionsBackdrop?.addEventListener('click', () => {
    setInstructionsVisible(false);
  });
  storyBackdrop?.addEventListener('click', () => {
    setStoryVisible(false);
  });
  scoreboardBackdrop?.addEventListener('click', () => {
    hideScoreboard();
  });

  const setScoreboardCountdown: Hud['setScoreboardCountdown'] = (
    secondsLeft,
  ) => {
    renderScoreboardCountdown(secondsLeft);
  };

  const COACH_KEYS_MOVE = `<div class="instructions-keys instructions-keys--cross" aria-hidden="true">
  <kbd class="kbd kbd--top">W</kbd>
  <kbd class="kbd kbd--left">A</kbd>
  <kbd class="kbd kbd--mid">S</kbd>
  <kbd class="kbd kbd--right">D</kbd>
</div>`;
  const COACH_KEYS_ARROWS = `<div class="instructions-keys instructions-keys--cross" aria-hidden="true">
  <kbd class="kbd kbd--arrow kbd--top">↑</kbd>
  <kbd class="kbd kbd--arrow kbd--left">←</kbd>
  <kbd class="kbd kbd--arrow kbd--mid">↓</kbd>
  <kbd class="kbd kbd--arrow kbd--right">→</kbd>
</div>`;
  /** Minimap cue only (matches the circular radar — no second “panel” icon). */
  const COACH_RADAR_MINI = `<div class="hud-coach__hud-mini hud-coach__hud-mini--radar" aria-hidden="true">
  <svg class="hud-coach__hud-mini-radar" viewBox="0 0 44 44" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="22" cy="22" r="20.5" fill="rgba(205, 190, 160, 0.08)" stroke="rgba(247, 244, 236, 0.35)" stroke-width="1" />
    <circle cx="22" cy="22" r="13" fill="none" stroke="rgba(247, 244, 236, 0.18)" stroke-width="0.8" stroke-dasharray="2 2" />
    <path d="M22 16 L26 27 L22 25 L18 27 Z" fill="#f7f4ec" stroke="rgba(10, 10, 18, 0.7)" stroke-width="0.6" />
    <circle cx="33" cy="13" r="3" fill="none" stroke="rgba(255, 216, 107, 0.85)" stroke-width="1">
      <animate attributeName="r" from="2.8" to="8" dur="1.4s" repeatCount="indefinite" />
      <animate attributeName="stroke-opacity" from="0.85" to="0" dur="1.4s" repeatCount="indefinite" />
    </circle>
    <circle cx="33" cy="13" r="2.4" fill="#ffd86b" stroke="rgba(10, 10, 18, 0.85)" stroke-width="0.6" />
  </svg>
</div>`;

  let lastFirstRunCoachKey = '';
  const setFirstRunCoach: Hud['setFirstRunCoach'] = (view) => {
    const key = view.text === null ? '' : `${view.text}|||${view.visual}`;
    if (key === lastFirstRunCoachKey) {
      return;
    }
    lastFirstRunCoachKey = key;
    if (view.text === null) {
      firstRunCoach.setAttribute('hidden', '');
      firstRunCoach.setAttribute('aria-hidden', 'true');
      firstRunCoachText.textContent = '';
      firstRunCoachKeys.innerHTML = '';
      return;
    }
    firstRunCoach.removeAttribute('hidden');
    firstRunCoach.setAttribute('aria-hidden', 'false');
    firstRunCoachText.textContent = view.text;
    if (view.visual === 'move') {
      firstRunCoachKeys.innerHTML = COACH_KEYS_MOVE;
    } else if (view.visual === 'arrows') {
      firstRunCoachKeys.innerHTML = COACH_KEYS_ARROWS;
    } else if (view.visual === 'dreamhud') {
      firstRunCoachKeys.innerHTML = COACH_RADAR_MINI;
    } else if (view.visual === 'dreamonly') {
      firstRunCoachKeys.innerHTML = '';
    } else {
      firstRunCoachKeys.innerHTML = '';
    }
  };

  const setAllTimeLeaderboard: Hud['setAllTimeLeaderboard'] = (
    entries,
    selfName,
  ) => {
    leaderboardList.replaceChildren();
    if (entries === null) {
      const li = document.createElement('li');
      li.className = 'scoreboard__placeholder';
      li.textContent = 'Loading…';
      leaderboardList.appendChild(li);
      return;
    }
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'scoreboard__placeholder';
      li.textContent = 'No rounds played yet.';
      leaderboardList.appendChild(li);
      return;
    }
    const trimmedSelf = selfName?.trim() ?? '';
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i]!;
      const li = document.createElement('li');

      const rank = document.createElement('span');
      rank.className = 'scoreboard__rank';
      rank.textContent = `${i + 1}.`;
      li.appendChild(rank);

      const name = document.createElement('span');
      name.className = 'scoreboard__name';
      const isSelf = trimmedSelf !== '' && e.name.trim() === trimmedSelf;
      if (isSelf) name.classList.add('scoreboard__name--self');
      // Persistent ranking is per-name, so the self indicator is
      // best-effort. If two players sit on the same name (intentional
      // by design — names are spoofable), both rows look "self" — we
      // accept that rather than fingerprinting sessions client-side.
      // Phase 7 — prefix flag; real country or UN when unknown.
      const flag = countryCodeToFlagEmojiOrUn(e.country);
      const flagSpan = document.createElement('span');
      flagSpan.className = 'scoreboard__flag';
      flagSpan.textContent = flag;
      flagSpan.title = e.country?.trim() ?? 'Country not detected';
      flagSpan.setAttribute('aria-hidden', 'true');
      name.appendChild(flagSpan);
      name.appendChild(
        document.createTextNode(e.name + (isSelf ? ' (you)' : '')),
      );
      li.appendChild(name);

      const total = document.createElement('span');
      total.className = 'scoreboard__deliveries';
      const strong = document.createElement('strong');
      strong.textContent = String(e.totalMilk);
      total.appendChild(strong);
      total.appendChild(document.createTextNode(' L'));
      li.appendChild(total);

      leaderboardList.appendChild(li);
    }
  };

  return {
    setBalance,
    setBalanceHints,
    hideBalanceHints,
    setDistance,
    setStatus,
    setLocked,
    setInstructionsVisible,
    toggleInstructions,
    getInstructionsVisible,
    setStoryVisible,
    toggleStory,
    getStoryVisible,
    setMilkStats,
    setDreamLabel,
    setTime,
    setRound,
    showToast,
    showProclamation,
    setDebugInvincible,
    setNetStatus,
    showScoreboard,
    showRanking,
    hideScoreboard,
    isScoreboardVisible,
    setScoreboardCountdown,
    setAllTimeLeaderboard,
    setFirstRunCoach,
  };
}
