/**
 * Phase 6a — name input modal.
 *
 * Asks the player for a display name once per browser, caches it in
 * `localStorage` under `LECHERA_NAME_KEY`, and resolves a sanitised
 * string. Subsequent boots read the cache directly and skip the
 * modal.
 *
 * The name is MANDATORY: there is no skip path. The submit button
 * stays disabled until the live input passes `sanitiseName` from
 * `@milk-dreams/shared` (the SAME function the server uses to
 * accept / reject joins). Doing the validation here means the
 * player gets instant feedback in the modal instead of a cryptic
 * "join rejected" error after pressing submit.
 *
 * Spoofing names by hand-editing `localStorage` is still trivial and
 * intentional — the validation is about catching accidental garbage
 * (zero-width chars, pasted ANSI escapes, single-letter "names")
 * not about authentication.
 */
import {
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  isValidName,
  sanitiseName,
} from '@milk-dreams/shared';

const LECHERA_NAME_KEY = 'lechera.name';

/** Read the cached name, returning `null` for an unusable value. */
function loadCachedName(): string | null {
  try {
    const raw = window.localStorage.getItem(LECHERA_NAME_KEY);
    if (!raw) return null;
    return sanitiseName(raw);
  } catch {
    // localStorage can throw in private browsing modes; degrade
    // gracefully to "ask every time" rather than crashing.
    return null;
  }
}

function persistName(name: string): void {
  try {
    window.localStorage.setItem(LECHERA_NAME_KEY, name);
  } catch {
    // Same private-mode caveat as `loadCachedName`. The session still
    // gets the name; it just won't survive a refresh.
  }
}

/** Same storage as the welcome modal — used by the HUD inline rename. */
export function getPlayerDisplayNameFromCache(): string | null {
  return loadCachedName();
}

/** Call only with a string already accepted by `sanitiseName`. */
export function persistSanitisedPlayerName(name: string): void {
  persistName(name);
}

/**
 * Show the modal and resolve with the chosen name. The promise only
 * resolves when the player submits a value that passes
 * `sanitiseName`; there is no "skip" path. Reuses the modal's
 * existing DOM (declared in `index.html`) so we don't fight the
 * bundler over CSS-in-JS.
 *
 * If the modal DOM is missing for some reason (e.g. an exotic build
 * without `index.html`), the promise rejects so the caller knows
 * we can't enforce the contract — far better than silently letting
 * the player into multiplayer without a name.
 */
function promptForName(): Promise<string> {
  const overlay = document.getElementById('name-modal');
  const form = document.getElementById('name-modal-form');
  const input = document.getElementById('name-modal-input') as
    | HTMLInputElement
    | null;
  const submit = form?.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  const errorEl = document.getElementById('name-modal-error');
  if (!overlay || !form || !input || !submit) {
    return Promise.reject(
      new Error(
        'name-modal DOM is missing; cannot prompt the player for a name',
      ),
    );
  }

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  // Focus the input on next frame: doing it in the same microtask as
  // a click handler that opened the overlay can swallow the focus
  // because the click target hasn't lost focus yet.
  requestAnimationFrame(() => input.focus());

  // Initial state: empty input → submit disabled, no error visible.
  submit.disabled = true;
  if (errorEl) errorEl.textContent = '';

  return new Promise<string>((resolve) => {
    const setError = (msg: string) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
    };

    const onInput = () => {
      const valid = isValidName(input.value);
      submit.disabled = !valid;
      // Don't surface "too short" while the user is still typing the
      // first 1-2 characters — that's noisy. Only show it once the
      // user has typed SOMETHING but it still isn't valid.
      if (input.value.trim().length === 0) {
        setError('');
      } else if (!valid) {
        setError(
          `Name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters.`,
        );
      } else {
        setError('');
      }
    };

    const onSubmit = (e: Event) => {
      e.preventDefault();
      const cleaned = sanitiseName(input.value);
      if (cleaned === null) {
        // Re-focus + visually shake to communicate "we need something
        // valid". This branch is only reachable if the user mashes
        // Enter past the disabled-button gate — the input event
        // handler keeps it disabled until validation passes.
        input.focus();
        input.classList.add('name-modal__input--shake');
        setTimeout(
          () => input.classList.remove('name-modal__input--shake'),
          400,
        );
        setError(
          `Name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters.`,
        );
        return;
      }
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', onInput);
      persistName(cleaned);
      resolve(cleaned);
    };

    input.addEventListener('input', onInput);
    form.addEventListener('submit', onSubmit);
  });
}

/**
 * Public entry point. Returns a resolved, sanitised display name —
 * either the cached one (if it still passes validation, e.g. after
 * we tightened the rules) or whatever the player just typed. Never
 * resolves to null: the caller can always pass the value straight to
 * `connectMultiplayer({ name })`.
 *
 * Rejects only if the modal DOM is missing entirely, which is a
 * deployment bug. Callers should treat that as fatal (or fall back
 * to single-player with a warning) rather than retrying.
 */
export async function getOrAskPlayerName(): Promise<string> {
  const cached = loadCachedName();
  if (cached) return cached;
  return promptForName();
}
