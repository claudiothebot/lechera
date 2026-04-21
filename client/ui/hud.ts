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

export type GameStatus = 'playing' | 'spilled' | 'timeout';

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
  showToast(text: string, durationMs?: number): void;
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
  hideScoreboard(): void;
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
}

export function createHud(): Hud {
  const spillValue = document.querySelector<HTMLElement>('#spill-value')!;
  const balanceLabel = document.querySelector<HTMLElement>('#balance-label')!;
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
  const playtestHint = document.querySelector<HTMLElement>(
    '#debug-playtest-hint',
  );
  const netBadge = document.querySelector<HTMLElement>('#net-badge')!;
  const netBadgeFlag = netBadge.querySelector<HTMLElement>('.net-badge__flag')!;
  const netBadgeText = netBadge.querySelector<HTMLElement>('.net-badge__text')!;
  const scoreboard = document.querySelector<HTMLElement>('#scoreboard')!;
  const scoreboardList =
    document.querySelector<HTMLOListElement>('#scoreboard-list')!;
  const scoreboardCountdown =
    document.querySelector<HTMLElement>('#scoreboard-countdown')!;
  const leaderboardList =
    document.querySelector<HTMLOListElement>('#leaderboard-list')!;
  const instructionsPanel = document.querySelector<HTMLElement>(
    '#instructions-panel',
  )!;
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

  const setBalance: Hud['setBalance'] = (normalizedTilt) => {
    const pct = Math.round(Math.max(0, Math.min(1, normalizedTilt)) * 100);
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
      return;
    }
    if (status === 'spilled') {
      messageEl.classList.add('fail');
      const litres = ctx?.litresDelivered ?? 0;
      const dream = ctx?.currentDream ?? '—';
      messageEl.innerHTML =
        `You spilled the milk!<br>` +
        `<span class="message-sub">` +
        `You were dreaming of <b>${dream}</b>. You had delivered ${litres} L.` +
        `</span><br>` +
        `<span class="message-sub">R to dream again</span>`;
      return;
    }
    messageEl.classList.add('fail');
    const litres = ctx?.litresDelivered ?? 0;
    messageEl.innerHTML =
      `Time's up<br>` +
      `<span class="message-sub">You delivered ${litres} L before dawn.</span><br>` +
      `<span class="message-sub">R to start again</span>`;
  };

  const setLocked: Hud['setLocked'] = (locked) => {
    hintEl.classList.toggle('hidden', locked);
  };

  let instructionsVisible = !instructionsPanel.classList.contains('hidden');
  const setInstructionsVisible: Hud['setInstructionsVisible'] = (visible) => {
    if (visible === instructionsVisible) return;
    instructionsVisible = visible;
    instructionsPanel.classList.toggle('hidden', !visible);
    instructionsPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };
  const toggleInstructions: Hud['toggleInstructions'] = () => {
    setInstructionsVisible(!instructionsVisible);
    return instructionsVisible;
  };
  const getInstructionsVisible: Hud['getInstructionsVisible'] = () =>
    instructionsVisible;

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

  const showToast: Hud['showToast'] = (text, durationMs = 1800) => {
    toastEl.textContent = text;
    toastEl.classList.add('visible');
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('visible');
      toastTimer = null;
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

  const showScoreboard: Hud['showScoreboard'] = (entries, secondsLeft) => {
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
    lastScoreboardCountdown = -1;
    renderScoreboardCountdown(secondsLeft);
    scoreboard.classList.remove('hidden');
    scoreboard.setAttribute('aria-hidden', 'false');
  };

  const hideScoreboard: Hud['hideScoreboard'] = () => {
    scoreboard.classList.add('hidden');
    scoreboard.setAttribute('aria-hidden', 'true');
  };

  const setScoreboardCountdown: Hud['setScoreboardCountdown'] = (
    secondsLeft,
  ) => {
    renderScoreboardCountdown(secondsLeft);
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
    setMilkStats,
    setDreamLabel,
    setTime,
    setRound,
    showToast,
    setDebugInvincible,
    setNetStatus,
    showScoreboard,
    hideScoreboard,
    setScoreboardCountdown,
    setAllTimeLeaderboard,
  };
}
