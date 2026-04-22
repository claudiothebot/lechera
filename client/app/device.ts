/**
 * Device-class detection used by the bootstrap to tag the body with
 * `.is-touch` on phones / tablets. Everything else (CSS layout, future
 * touch-control wiring in `systems/input.ts`) keys off either that class
 * or the `(pointer: coarse)` media query, so the check lives in one
 * place.
 *
 * Deliberately conservative: we treat "coarse primary pointer" as the
 * signal. A laptop with a touchscreen reports `(any-pointer: coarse)`
 * true but `(pointer: coarse)` false (its primary pointer is still the
 * trackpad), which is correct — we don't want to collapse the HUD or
 * show touch-only overlays on a Surface being used as a laptop.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Stamp the document body with a class reflecting the input class. We
 * intentionally write the class once at boot rather than react to media
 * query changes live: a player swapping primary input mid-session is
 * rare and any mid-boot reclassification would race against the
 * renderer / HUD setup. If it ever matters we can add a
 * `matchMedia(...).addEventListener('change', ...)` here.
 */
export function applyDeviceClass(): void {
  if (typeof document === 'undefined') return;
  if (isTouchDevice()) {
    document.body.classList.add('is-touch');
  }
}
