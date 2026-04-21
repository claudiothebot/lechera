// One-off script: densifies the horizon tree ring of public/levels/level-01.json
// so angular gaps stay below TARGET_GAP_DEG (the lower the value, the denser
// the forest). Uses a seeded PRNG so a single run is deterministic. Each run
// is **additive**: trees are only appended, never removed. Lower the target
// and run again to densify further.
//
// Usage (from repo root):
//   node scripts/fill-tree-ring.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LEVEL_PATH = resolve('public/levels/level-01.json');
const level = JSON.parse(readFileSync(LEVEL_PATH, 'utf8'));

const cx = level.worldBoundary.centerX;
const cz = level.worldBoundary.centerZ;
const R = level.worldBoundary.radius;

const TARGET_GAP_DEG = 3;
const RING_R_MIN = 63;
const RING_R_MAX = 74;
const VARIANTS = ['poplar', 'poplar-alt'];

// Mulberry32 PRNG — small, deterministic, enough for placement jitter.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(0xc0ffee);

function ringThetas() {
  return level.trees
    .map((t) => ({
      r: Math.hypot(t.x - cx, t.z - cz),
      theta: ((Math.atan2(t.z - cz, t.x - cx) * 180) / Math.PI + 360) % 360,
    }))
    .filter((t) => t.r > R)
    .map((t) => t.theta)
    .sort((a, b) => a - b);
}

function placeTreeAt(thetaDeg) {
  const jitterTheta = (rng() - 0.5) * 2.0;
  const theta = (((thetaDeg + jitterTheta) % 360) + 360) % 360;
  const radius = RING_R_MIN + rng() * (RING_R_MAX - RING_R_MIN);
  const rad = (theta * Math.PI) / 180;
  const x = cx + radius * Math.cos(rad);
  const z = cz + radius * Math.sin(rad);
  const variant = VARIANTS[Math.floor(rng() * VARIANTS.length)];
  const yaw = rng() * Math.PI * 2;
  return {
    x: Number(x.toFixed(2)),
    z: Number(z.toFixed(2)),
    yaw: Number(yaw.toFixed(2)),
    variant,
  };
}

const initialThetas = ringThetas();
let added = 0;

for (let i = 0; i < initialThetas.length; i++) {
  const a = initialThetas[i];
  const b = initialThetas[(i + 1) % initialThetas.length];
  let gap = b - a;
  if (gap < 0) gap += 360;
  if (gap <= TARGET_GAP_DEG) continue;
  // Number of new trees needed so the largest sub-gap is ≤ TARGET_GAP_DEG.
  const n = Math.ceil(gap / TARGET_GAP_DEG) - 1;
  for (let k = 1; k <= n; k++) {
    const t = a + (gap * k) / (n + 1);
    level.trees.push(placeTreeAt(t));
    added += 1;
  }
}

writeFileSync(LEVEL_PATH, `${JSON.stringify(level, null, 2)}\n`, 'utf8');
console.log(`Added ${added} trees. Ring trees now: ${ringThetas().length}.`);
