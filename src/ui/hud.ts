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

export interface GameOverContext {
  /** Total litres successfully delivered before failing. */
  litresDelivered: number;
  /** Name of the dream we were chasing when the run ended. */
  currentDream: string;
}

export interface Hud {
  setBalance(normalizedTilt: number): void;
  setDistance(meters: number): void;
  setStatus(status: GameStatus, ctx?: GameOverContext): void;
  setLocked(locked: boolean): void;
  /** Litres of milk currently on the character's head. */
  setLitres(litres: number): void;
  /** Name of the next dream the milkmaid is chasing. */
  setDream(name: string, endless: boolean): void;
  /** Remaining time, seconds. Displayed as mm:ss. */
  setTime(secondsLeft: number): void;
  /** Transient message (fades after durationMs). */
  showToast(text: string, durationMs?: number): void;
}

export function createHud(): Hud {
  const spillValue = document.querySelector<HTMLElement>('#spill-value')!;
  const spillBar = document.querySelector<HTMLElement>('#spill-bar')!;
  const spillLabel = document.querySelector<HTMLElement>(
    '#hud-top-left .hud-label',
  )!;
  const distanceValue = document.querySelector<HTMLElement>('#distance-value')!;
  const messageEl = document.querySelector<HTMLElement>('#message')!;
  const hintEl = document.querySelector<HTMLElement>('#hint')!;
  const litresValue = document.querySelector<HTMLElement>('#litres-value')!;
  const dreamValue = document.querySelector<HTMLElement>('#dream-value')!;
  const timerValue = document.querySelector<HTMLElement>('#timer-value')!;
  const toastEl = document.querySelector<HTMLElement>('#toast')!;

  spillLabel.textContent = 'BALANCE';

  let lastBalancePct = -1;
  let lastDistance = -1;
  let lastStatus: GameStatus | null = null;
  let lastLitres = -1;
  let lastDream = '';
  let lastTimerText = '';
  let toastTimer: number | null = null;

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
      distanceValue.textContent = `${rounded} m`;
      lastDistance = rounded;
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
    // status === 'timeout'
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

  const setLitres: Hud['setLitres'] = (litres) => {
    if (litres === lastLitres) return;
    lastLitres = litres;
    litresValue.textContent = `${litres} L`;
  };

  const setDream: Hud['setDream'] = (name, endless) => {
    const text = endless ? `${name} (sin fin)` : name;
    if (text === lastDream) return;
    lastDream = text;
    dreamValue.textContent = text;
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

  return {
    setBalance,
    setDistance,
    setStatus,
    setLocked,
    setLitres,
    setDream,
    setTime,
    showToast,
  };
}
