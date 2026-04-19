/**
 * Background music via HTMLAudioElement (not spatial).
 *
 * Browsers **block autoplay** of audible media until there is a **user
 * activation** (tap, click, or key press in most cases). The first
 * `play()` right after load therefore often fails silently — that is
 * expected, not a bug in this file.
 *
 * We retry on:
 * - **pointerdown** — click / tap on the page
 * - **keydown** — so players who jump straight into WASD / arrows still
 *   unlock audio without having to click first (this was the main source
 *   of “music starts much later or only after I click”).
 * - **canplaythrough** — slow networks: first `play()` may run before the
 *   MP3 has enough buffer; retry once the element can play through.
 */
export function installMusicLoop(url: string, volume = 0.35): void {
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = volume;
  audio.preload = 'auto';

  const tryPlay = () => {
    void audio.play().catch(() => {
      // Still blocked or not ready; a later event / canplaythrough will retry.
    });
  };

  tryPlay();

  audio.addEventListener('canplaythrough', tryPlay, { once: true });

  const resume = () => {
    if (audio.paused) tryPlay();
  };

  const opts = { passive: true, capture: true } as const;
  window.addEventListener('pointerdown', resume, opts);
  window.addEventListener('keydown', resume, opts);
}
