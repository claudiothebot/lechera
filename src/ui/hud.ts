/**
 * HUD state model:
 *  - 'playing'   → regular play, timer running
 *  - 'spilled'   → game over because balance tipped past its threshold
 *  - 'timeout'   → game over because the 3-minute countdown hit zero
 *
 * On 'spilled'/'timeout' the HUD shows a final summary with total litres
 * delivered and the dream the player was chasing when it ended.
 */
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
}

export interface Hud {
  setBalance(normalizedTilt: number): void;
  setDistance(meters: number): void;
  setStatus(status: GameStatus, ctx?: GameOverContext): void;
  setLocked(locked: boolean): void;
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
   * Update the multiplayer status badge. `selfName` is the server-
   * assigned display name (e.g. "Player 7"), or null if unknown.
   */
  setNetStatus(status: NetStatus, selfName: string | null): void;
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
  const netBadgeText = netBadge.querySelector<HTMLElement>('.net-badge__text')!;
  const scoreboard = document.querySelector<HTMLElement>('#scoreboard')!;
  const scoreboardList =
    document.querySelector<HTMLOListElement>('#scoreboard-list')!;
  const scoreboardCountdown =
    document.querySelector<HTMLElement>('#scoreboard-countdown')!;
  const leaderboardList =
    document.querySelector<HTMLOListElement>('#leaderboard-list')!;

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
  let lastScoreboardCountdown = -1;

  const setBalance: Hud['setBalance'] = (normalizedTilt) => {
    const pct = Math.round(Math.max(0, Math.min(1, normalizedTilt)) * 100);
    if (pct === lastBalancePct) return;
    lastBalancePct = pct;
    spillValue.textContent = `${pct}%`;
    spillBar.style.width = `${pct}%`;
    const color = pct >= 80 ? '#f29179' : pct >= 50 ? '#f1b16a' : '#f1d28d';
    spillBar.style.background = color;
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

  const setMilkStats: Hud['setMilkStats'] = (carrying, delivered) => {
    if (carrying === lastCarrying && delivered === lastDelivered) return;
    lastCarrying = carrying;
    lastDelivered = delivered;
    litresCarrying.textContent = `${carrying} L`;
    litresDeliveredEl.textContent = `${delivered} L`;
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

  const setNetStatus: Hud['setNetStatus'] = (status, selfName) => {
    if (status === lastNetStatus && selfName === lastNetName) return;
    lastNetStatus = status;
    lastNetName = selfName;
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
      name.textContent = e.name + (isSelf ? ' (you)' : '');
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
    setDistance,
    setStatus,
    setLocked,
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
