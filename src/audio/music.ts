/**
 * Background music via HTMLAudioElement (not spatial). Browsers often block
 * autoplay until a user gesture; we try immediately and resume on first input.
 */
export function installMusicLoop(url: string, volume = 0.35): void {
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = volume;
  audio.preload = 'auto';

  const resume = () => {
    if (audio.paused) {
      void audio.play().catch(() => {});
    }
  };

  void audio.play().catch(() => {});

  window.addEventListener('pointerdown', resume, { passive: true, capture: true });
}
