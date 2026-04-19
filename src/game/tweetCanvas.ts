/**
 * Draw a tweet-shaped card onto a 2D canvas.
 *
 * Kept Three-free on purpose: input is a plain `Tweet` object, output is the
 * `HTMLCanvasElement` (ready to wrap in a `THREE.CanvasTexture`). That lets
 * you render/preview these in isolation, and swap the data source later (a
 * live endpoint, a mock, a fixture) without touching the renderer.
 *
 * Layout strategy:
 *  - Canvas aspect matches the screen-plane aspect so the final texture is
 *    undistorted. Caller passes it via `aspect`.
 *  - Sizing is resolution-independent: everything is expressed relative to
 *    `canvas.height`, so switching to higher DPI by changing `pixelHeight`
 *    just yields a crisper texture with the same layout.
 *  - Variable-length body: word-wrap + optional line cap with ellipsis. No
 *    auto-shrink for the POC — overflow is truncated, which is the right
 *    behaviour for a roadside sign (you pick tweets that fit, not tweets
 *    that need scrolling).
 */

export interface TweetAuthor {
  name: string;
  handle: string;
  /** Optional avatar URL; falls back to a tinted initial circle. */
  avatarUrl?: string;
}

export interface Tweet {
  id: string;
  author: TweetAuthor;
  body: string;
  /** ISO timestamp or a pre-formatted short string like "2h" or "Apr 18". */
  createdAt: string;
  /** Full URL to open on click. */
  url: string;
  /** Optional media image URL rendered below the body. */
  mediaUrl?: string;
}

export interface RenderTweetOptions {
  /** Width / height of the output canvas. Matches the billboard screen plane. */
  aspect: number;
  /** Canvas pixel height. Width is derived from aspect. Default 720. */
  pixelHeight?: number;
  /** Card background. Default is Twitter-dark-ish for outdoor legibility. */
  background?: string;
  /** Foreground text colour. */
  foreground?: string;
  /** Muted label colour (handle, timestamp). */
  muted?: string;
}

const DEFAULTS: Required<Omit<RenderTweetOptions, 'aspect'>> = {
  pixelHeight: 720,
  background: '#15202b',
  foreground: '#f7f9f9',
  muted: '#8b98a5',
};

/**
 * Synchronous canvas render. Returns immediately with a first-pass canvas
 * (avatar + media not yet loaded). If the tweet has image URLs we kick off
 * loads in the background and call `onReady` once everything has resolved
 * so the caller can flag its `CanvasTexture` as dirty. This keeps scene
 * startup non-blocking — billboards appear instantly with text and fill in
 * imagery as it arrives.
 */
export function renderTweetToCanvas(
  tweet: Tweet,
  options: RenderTweetOptions,
  onReady?: () => void,
): HTMLCanvasElement {
  const opts = { ...DEFAULTS, ...options };
  const H = opts.pixelHeight;
  const W = Math.round(H * opts.aspect);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const padding = H * 0.06;
  const avatarSize = H * 0.16;
  const nameSize = H * 0.075;
  const handleSize = H * 0.048;
  const bodySize = H * 0.075;
  const bodyLineHeight = bodySize * 1.25;
  const contentBottom = H - padding;

  drawBackground(ctx, W, H, opts.background);

  const avatarX = padding;
  const avatarY = padding;
  drawPlaceholderAvatar(ctx, avatarX, avatarY, avatarSize, tweet.author);

  const headerX = avatarX + avatarSize + padding * 0.6;
  const nameY = padding + nameSize;
  ctx.fillStyle = opts.foreground;
  ctx.font = `700 ${nameSize}px "Helvetica Neue", system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(truncate(ctx, tweet.author.name, W - headerX - padding), headerX, nameY);

  ctx.fillStyle = opts.muted;
  ctx.font = `400 ${handleSize}px "Helvetica Neue", system-ui, sans-serif`;
  ctx.fillText(
    truncate(ctx, `${tweet.author.handle} · ${tweet.createdAt}`, W - headerX - padding),
    headerX,
    nameY + handleSize * 1.25,
  );

  const bodyX = padding;
  const bodyY = padding + avatarSize + padding * 0.6 + bodySize;
  const bodyMaxWidth = W - padding * 2;

  ctx.fillStyle = opts.foreground;
  ctx.font = `400 ${bodySize}px "Helvetica Neue", system-ui, sans-serif`;

  const hasMedia = Boolean(tweet.mediaUrl);
  // Reserve ~38 % of canvas height for media when present; otherwise body
  // uses the full card down to the bottom padding.
  const bodyMaxY = hasMedia ? H * 0.56 : contentBottom - bodyLineHeight * 0.35;
  const maxBodyLines = Math.max(
    1,
    Math.floor((bodyMaxY - bodyY) / bodyLineHeight) + 1,
  );

  const bodyLines = wrapText(ctx, tweet.body, bodyMaxWidth, maxBodyLines);
  for (let i = 0; i < bodyLines.length; i++) {
    ctx.fillText(bodyLines[i] as string, bodyX, bodyY + i * bodyLineHeight);
  }

  // Async layer: avatar + media. We don't await: caller gets a "text-only"
  // canvas right away and `onReady` fires once images have been composited
  // on top. If either image fails the placeholder stays.
  const pending: Promise<void>[] = [];

  if (tweet.author.avatarUrl) {
    pending.push(
      loadImage(tweet.author.avatarUrl)
        .then((img) => {
          drawCircleImage(ctx, img, avatarX, avatarY, avatarSize);
        })
        .catch(() => {
          /* leave placeholder */
        }),
    );
  }

  if (tweet.mediaUrl) {
    const mediaY = bodyY + maxBodyLines * bodyLineHeight;
    const mediaMaxH = contentBottom - mediaY - padding * 0.35;
    const mediaW = bodyMaxWidth;
    const mediaRadius = H * 0.03;
    pending.push(
      loadImage(tweet.mediaUrl)
        .then((img) => {
          drawRoundedCoveredImage(
            ctx,
            img,
            bodyX,
            mediaY,
            mediaW,
            mediaMaxH,
            mediaRadius,
          );
        })
        .catch(() => {
          /* leave empty */
        }),
    );
  }

  if (pending.length > 0 && onReady) {
    void Promise.all(pending).then(() => onReady());
  }

  return canvas;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: string,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle bottom vignette for depth (no footer copy).
  const grad = ctx.createLinearGradient(0, h * 0.7, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawPlaceholderAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  author: TweetAuthor,
) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  // Hash the handle to a hue so different authors visibly differ even
  // before avatars load.
  const hue = hashHue(author.handle || author.name);
  ctx.fillStyle = `hsl(${hue}, 55%, 45%)`;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${size * 0.5}px "Helvetica Neue", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const initial = (author.name[0] || author.handle[1] || '?').toUpperCase();
  ctx.fillText(initial, cx, cy + size * 0.02);
  ctx.restore();
}

function drawCircleImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // `cover` fit: scale so the shorter side fills the circle's bbox.
  const s = Math.max(size / img.width, size / img.height);
  const drawW = img.width * s;
  const drawH = img.height * s;
  const dx = x + (size - drawW) / 2;
  const dy = y + (size - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

function drawRoundedCoveredImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  const drawW = img.width * s;
  const drawH = img.height * s;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const paragraphs = text.split(/\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      if (lines.length >= maxLines) break;
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        if (lines.length >= maxLines) break;
      }
      // Word alone too long → hard-wrap it character by character.
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch;
          } else {
            lines.push(chunk);
            if (lines.length >= maxLines) break;
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) {
      lines.push(current);
    }
    if (lines.length >= maxLines) break;
  }

  // If we had to cut, ellipsise the last line.
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const maybeTruncated = ellipsise(ctx, text.length > 0 ? last ?? '' : '', maxWidth);
    lines[maxLines - 1] =
      hasMoreContent(text, lines) ? maybeTruncated.withEllipsis : maybeTruncated.asIs;
  }

  return lines;
}

function hasMoreContent(full: string, lines: string[]): boolean {
  const shown = lines.join(' ').replace(/\s+/g, ' ').trim();
  const source = full.replace(/\s+/g, ' ').trim();
  return shown.length < source.length;
}

function ellipsise(
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
): { asIs: string; withEllipsis: string } {
  const ellipsis = '…';
  let cut = line;
  while (cut.length > 0 && ctx.measureText(`${cut}${ellipsis}`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return { asIs: line, withEllipsis: `${cut.trimEnd()}${ellipsis}` };
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  const ellipsis = '…';
  while (cut.length > 0 && ctx.measureText(`${cut}${ellipsis}`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}${ellipsis}`;
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Texture uploads need a non-tainted canvas. Hosts that don't return
    // proper CORS headers will simply fail to load here and we keep the
    // placeholder — no silent canvas taint.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
