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

/** Same storage as the welcome modal — used when reading the badge label offline. */
export function getPlayerDisplayNameFromCache(): string | null {
  return loadCachedName();
}

/** Call only with a string already accepted by `sanitiseName`. */
export function persistSanitisedPlayerName(name: string): void {
  persistName(name);
}

type NameModalVariant = 'welcome' | 'rename';

/**
 * Opens the name modal (same DOM as first-run). `welcome` has no
 * cancel path and resolves only after a valid submit. `rename` resolves
 * `null` if the player cancels (button, Escape, or backdrop tap).
 */
function openNameModal(
  variant: NameModalVariant,
  initialValue: string,
): Promise<string | null> {
  const overlay = document.getElementById('name-modal');
  const form = document.getElementById('name-modal-form');
  const titleEl = document.getElementById('name-modal-title');
  const input = document.getElementById('name-modal-input') as
    | HTMLInputElement
    | null;
  const submit = form?.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  const cancelBtn = document.getElementById(
    'name-modal-cancel',
  ) as HTMLButtonElement | null;
  const errorEl = document.getElementById('name-modal-error');
  if (!overlay || !form || !input || !submit || !titleEl) {
    return Promise.reject(
      new Error(
        'name-modal DOM is missing; cannot prompt the player for a name',
      ),
    );
  }

  const isRename = variant === 'rename';
  titleEl.textContent = isRename ? 'Change your name' : "What's your name?";
  submit.textContent = isRename ? 'Save' : 'Start';
  if (cancelBtn) {
    cancelBtn.classList.toggle('hidden', !isRename);
    cancelBtn.hidden = !isRename;
  }

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  input.value = initialValue;
  if (errorEl) errorEl.textContent = '';

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      teardown();
      resolve(value);
    };

    const setError = (msg: string) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
    };

    const onInput = () => {
      const valid = isValidName(input.value);
      submit.disabled = !valid;
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
      persistName(cleaned);
      finish(cleaned);
    };

    const onCancel = () => {
      if (!isRename) return;
      finish(null);
    };

    const onOverlayPointerDown = (e: MouseEvent) => {
      if (!isRename) return;
      if (e.target === overlay) onCancel();
    };

    const onDocumentKeydown = (e: KeyboardEvent) => {
      if (!isRename || e.key !== 'Escape') return;
      e.preventDefault();
      onCancel();
    };

    const teardown = () => {
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', onInput);
      cancelBtn?.removeEventListener('click', onCancel);
      overlay.removeEventListener('pointerdown', onOverlayPointerDown, true);
      document.removeEventListener('keydown', onDocumentKeydown, true);
    };

    onInput();
    input.addEventListener('input', onInput);
    form.addEventListener('submit', onSubmit);
    cancelBtn?.addEventListener('click', onCancel);
    overlay.addEventListener('pointerdown', onOverlayPointerDown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);

    requestAnimationFrame(() => input.focus());
  });
}

function promptForName(): Promise<string> {
  return openNameModal('welcome', '').then((name) => {
    if (name === null) {
      return Promise.reject(
        new Error('name modal closed without a name (welcome flow)'),
      );
    }
    return name;
  });
}

/**
 * Re-show the first-run name UI with the current value prefilled.
 * Resolves the new sanitised name after Save, or `null` if the player
 * cancels — does not write to storage on cancel.
 */
export function promptPlayerNameEdit(initialDisplay: string): Promise<string | null> {
  return openNameModal('rename', initialDisplay.trim());
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
