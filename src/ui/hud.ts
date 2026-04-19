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
  /** Successful deliveries this round (== `dreamIndex` server-side). */
  deliveries: number;
  /** HSL hue in [0, 1) — used for the colored dot before the name. */
  colorHue: number;
  /** True for the local player so the row can be visually emphasised. */
  isSelf: boolean;
}

export interface Hud {
  setBalance(normalizedTilt: number): void;
  setDistance(meters: number): void;
  setStatus(status: GameStatus, ctx?: GameOverContext): void;
  setLocked(locked: boolean): void;
  /**
   * Leche en el cántaro (`carrying`) y total ya entregada (`delivered` =
   * entregas completadas; mismo criterio que en el game over).
   */
  setMilkStats(carrying: number, delivered: number): void;
  /** Dream name for accessibility on the 3D preview wrapper. */
  setDreamLabel(dreamName: string): void;
  /** Remaining time, seconds. Displayed as mm:ss. */
  setTime(secondsLeft: number): void;
  /** Transient message (fades after durationMs). */
  showToast(text: string, durationMs?: number): void;
  /** Muestra línea de aviso discreta cuando `DEBUG_INVINCIBLE` está activo. */
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

  let lastBalancePct = -1;
  let lastDistance = -1;
  let lastStatus: GameStatus | null = null;
  let lastCarrying = -1;
  let lastDelivered = -1;
  let lastTimerText = '';
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
        `¡Has derramado la leche!<br>` +
        `<span class="message-sub">` +
        `Soñabas con <b>${dream}</b>. Entregaste ${litres} L.` +
        `</span><br>` +
        `<span class="message-sub">R para volver a soñar</span>`;
      return;
    }
    messageEl.classList.add('fail');
    const litres = ctx?.litresDelivered ?? 0;
    messageEl.innerHTML =
      `Se acabó el tiempo<br>` +
      `<span class="message-sub">Entregaste ${litres} L antes del amanecer.</span><br>` +
      `<span class="message-sub">R para empezar de nuevo</span>`;
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
    dreamWrap.setAttribute('aria-label', `Sueño actual: ${dreamName}`);
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
        netBadgeText.textContent = 'Conectando…';
        break;
      case 'online':
        netBadgeText.textContent = selfName?.trim()
          ? selfName.trim()
          : 'Jugador';
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
      name.textContent = e.name + (e.isSelf ? ' (tú)' : '');
      li.appendChild(name);

      const deliveries = document.createElement('span');
      deliveries.className = 'scoreboard__deliveries';
      const strong = document.createElement('strong');
      strong.textContent = String(e.deliveries);
      deliveries.appendChild(strong);
      deliveries.appendChild(
        document.createTextNode(e.deliveries === 1 ? 'sueño' : 'sueños'),
      );
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

  return {
    setBalance,
    setDistance,
    setStatus,
    setLocked,
    setMilkStats,
    setDreamLabel,
    setTime,
    showToast,
    setDebugInvincible,
    setNetStatus,
    showScoreboard,
    hideScoreboard,
    setScoreboardCountdown,
  };
}
