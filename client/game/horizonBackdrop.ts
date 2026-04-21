import * as THREE from 'three';

/**
 * Cylindrical billboard wall at the horizon. Fills the empty band between the
 * playable area and the sky with a silhouette of distant trees so the world
 * doesn't read as "open field ending in clouds". One mesh, one draw call,
 * no instancing, no shadow interaction — the cheapest possible horizon decor.
 *
 * The texture is generated procedurally in a 2D canvas at boot so there's no
 * asset to manage and colours can be tuned from code. Trunks are dark blue-
 * green stripes (height varies), canopies are noisy blobs stacked on top.
 * Alpha is 0 above the canopy and 1 below, with a soft gradient at the top
 * so the silhouette fades into the fog/sky instead of ending in a hard line.
 */

export interface HorizonBackdropOptions {
  /** Distance from the cylinder centre to its wall, in world units. */
  radius: number;
  /** Cylinder wall height, in world units. */
  height: number;
  /** How low the bottom of the wall sits (world Y). Slightly below 0 to
   *  hide the seam where it meets the ground plane. */
  bottomY: number;
  /** World-space centre of the cylinder on XZ. */
  centerX: number;
  /** World-space centre of the cylinder on XZ. */
  centerZ: number;
  /** How many times the procedural strip tiles around the circumference.
   *  Higher = denser forest. */
  tileRepeatU: number;
}

/** Build the silhouette strip texture on a 2D canvas. */
function buildForestSilhouetteTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Transparent base — alpha-tested material will reject this.
  ctx.clearRect(0, 0, w, h);

  // A few "distance layers" painted back-to-front so nearer trees overlap
  // the pale layers behind. Each layer has its own colour and scale.
  interface Layer {
    baseY: number;       // bottom of tree band, in pixel space (0 = top)
    canopyAmp: number;   // vertical wobble of canopy top
    trunkWidth: number;  // average trunk width in pixels
    gap: number;         // average horizontal gap between trunks
    color: string;       // silhouette colour (alpha left to globalAlpha)
    alpha: number;       // overall layer opacity
    seed: number;
  }

  const layers: Layer[] = [
    { baseY: 210, canopyAmp: 46, trunkWidth: 18, gap: 26, color: '#5a7c6f', alpha: 0.55, seed: 17 },
    { baseY: 218, canopyAmp: 38, trunkWidth: 14, gap: 22, color: '#415d55', alpha: 0.75, seed: 53 },
    { baseY: 228, canopyAmp: 30, trunkWidth: 11, gap: 17, color: '#2a3f3a', alpha: 0.95, seed: 101 },
  ];

  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  for (const layer of layers) {
    const r = rng(layer.seed);
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = layer.color;

    let x = -10;
    while (x < w + 20) {
      const trunkW = layer.trunkWidth * (0.7 + r() * 0.7);
      const canopyH = layer.canopyAmp * (0.7 + r() * 0.8);
      const canopyW = trunkW * (2.2 + r() * 1.6);
      const topY = layer.baseY - canopyH;

      // Trunk: a thin rectangle from base down to the bottom of the canvas.
      ctx.fillRect(x + (canopyW - trunkW) * 0.5, layer.baseY - 4, trunkW, h - (layer.baseY - 4));

      // Canopy: three overlapping ellipses make a believable blob.
      const cx = x + canopyW * 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, topY + canopyH * 0.5, canopyW * 0.55, canopyH * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - canopyW * 0.22, topY + canopyH * 0.65, canopyW * 0.45, canopyH * 0.45, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + canopyW * 0.22, topY + canopyH * 0.65, canopyW * 0.45, canopyH * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      x += canopyW * 0.55 + layer.gap * (0.5 + r());
    }
    ctx.restore();
  }

  // Soft vertical gradient on the alpha so the top of the strip fades into
  // the fog/sky instead of cutting hard. Multiply by existing alpha so
  // transparent pixels stay transparent.
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    // 0 at the very top, 1 once we're 40 px in — canopies fade in softly.
    const feather = Math.min(1, y / 40);
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4 + 3;
      data[i] = Math.round(data[i]! * feather);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createHorizonBackdrop(options: HorizonBackdropOptions): THREE.Mesh {
  const { radius, height, bottomY, centerX, centerZ, tileRepeatU } = options;

  const tex = buildForestSilhouetteTexture();
  tex.repeat.set(tileRepeatU, 1);

  // Open-ended cylinder with normals flipped inward isn't needed — we want
  // the outside face visible (player is inside). Three.js default cylinder
  // has outward normals, so rendering from inside requires BackSide.
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    64,          // radial segments — 64 is smooth enough for a horizon ring
    1,           // one vertical segment; the texture handles silhouette shape
    true,        // openEnded — no caps (player never sees top/bottom)
  );

  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.1,
    depthWrite: false,
    // Rendered from inside the cylinder: flip which face the renderer keeps.
    side: THREE.BackSide,
    // No scene fog on this mesh: the cylinder sits mid-distance; linear fog
    // with a sky-bright colour was washing the silhouette to grey/white at
    // the base. Terrain + hills still get fog for depth; the forest strip
    // stays a readable dark green band in front of the relief.
    fog: false,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(centerX, bottomY + height * 0.5, centerZ);
  mesh.name = 'horizon-backdrop';
  // Always rendered, never casts/receives shadows. Pushed to the back of the
  // render order so it draws after opaque geometry (safer for blending).
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
