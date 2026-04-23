import type { Obstacle } from './level';

/**
 * The four XZ world corners of the house footprint, closed loop, for
 * debug drawing (e.g. level editor). Matches the OBB’s local half-extents
 * and `rotation.y`.
 */
export function houseFootprintWorldCornersXz(
  centerX: number,
  centerZ: number,
  hf: { localHalfX: number; localHalfZ: number; yaw: number },
): [number, number][] {
  const c = Math.cos(hf.yaw);
  const s = Math.sin(hf.yaw);
  const { localHalfX: Lx, localHalfZ: Lz } = hf;
  const corners: [number, number][] = [
    [Lx, Lz],
    [Lx, -Lz],
    [-Lx, -Lz],
    [-Lx, Lz],
  ];
  return corners.map(([lx, lz]) => [
    centerX + lx * c + lz * s,
    centerZ - lx * s + lz * c,
  ]);
}

/**
 * OBB centre → point, inverse of Three.js R_y.
 */
function worldXzToObbLocalXz(
  dwx: number,
  dwz: number,
  yaw: number,
): { lx: number; lz: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { lx: c * dwx - s * dwz, lz: s * dwx + c * dwz };
}

function obbLocalVecToWorldXz(ux: number, uz: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: ux * c + uz * s,
    z: -ux * s + uz * c,
  };
}

/**
 * Closest point on the filled-AABB *border* to (lx, lz) — the four line
 * segments, same construction as the editor / conservative AABBs.
 */
function closestOnRectanglePerimeter(
  lx: number,
  lz: number,
  Lx: number,
  Lz: number,
): [number, number] {
  const cands: [number, number][] = [
    [-Lx, Math.max(-Lz, Math.min(Lz, lz))],
    [Lx, Math.max(-Lz, Math.min(Lz, lz))],
    [Math.max(-Lx, Math.min(Lx, lx)), -Lz],
    [Math.max(-Lx, Math.min(Lx, lx)), Lz],
  ];
  let best: [number, number] = cands[0]!;
  let bestD2 = Infinity;
  for (const p of cands) {
    const d2 = (lx - p[0]) * (lx - p[0]) + (lz - p[1]) * (lz - p[1]);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

/**
 * Outward normal in local OZ when c ≈ p (on edge / corner of the footprint).
 */
function normalWhenDegenerate(
  lx: number,
  lz: number,
  Lx: number,
  Lz: number,
): { nlx: number; nlz: number } {
  const ox = Math.abs(lx) - Lx;
  const oz = Math.abs(lz) - Lz;
  if (ox > oz) {
    return { nlx: Math.sign(lx) || 1, nlz: 0 };
  }
  if (oz > ox) {
    return { nlx: 0, nlz: Math.sign(lz) || 1 };
  }
  const h = 1 / Math.SQRT2;
  return { nlx: h * (Math.sign(lx) || 1), nlz: h * (Math.sign(lz) || 1) };
}

/**
 * Circle vs house OBB in XZ: same feel as the AABB pass (position, velocity, bumps).
 */
export function applyCircleVsHouseOBB2D(
  outX: number,
  outZ: number,
  r: number,
  ob: Obstacle,
  house: NonNullable<Obstacle['houseFootprint2D']>,
  velocity: { x: number; z: number },
  bumps: Array<{ impulse: number; dirX: number; dirZ: number }>,
  obVelX: number,
  obVelZ: number,
): { x: number; z: number } {
  const cx = ob.center.x;
  const cz = ob.center.z;
  const { lx, lz } = worldXzToObbLocalXz(outX - cx, outZ - cz, house.yaw);
  const Lx = house.localHalfX;
  const Lz = house.localHalfZ;

  const [clx, clz] = closestOnRectanglePerimeter(lx, lz, Lx, Lz);
  /** Open interior of the solid 2D footprint (player should not be here). */
  const strictInterior =
    Math.abs(lx) < Lx - 1e-4 && Math.abs(lz) < Lz - 1e-4;
  // Everywhere else (air, edges, or thin boundary strip): c → p. Strict
  // inside the house footprint: p → c (shortest way out to the skin).
  let tlx: number;
  let tlz: number;
  if (strictInterior) {
    tlx = clx - lx;
    tlz = clz - lz;
  } else {
    tlx = lx - clx;
    tlz = lz - clz;
  }
  const dist = Math.hypot(tlx, tlz);
  let nlx: number;
  let nlz: number;
  if (dist < 1e-7) {
    const g = normalWhenDegenerate(lx, lz, Lx, Lz);
    nlx = g.nlx;
    nlz = g.nlz;
  } else {
    nlx = tlx / dist;
    nlz = tlz / dist;
  }

  const effectiveDist = dist < 1e-7 ? 0 : dist;
  if (effectiveDist >= r - 1e-8) {
    return { x: outX, z: outZ };
  }
  const push = r - effectiveDist;
  const { x: nxW, z: nzw } = obbLocalVecToWorldXz(nlx, nlz, house.yaw);
  const hW = Math.hypot(nxW, nzw) || 1e-5;
  const nxN = nxW / hW;
  const nzN = nzw / hW;
  const rx = outX + nxN * push;
  const rz = outZ + nzN * push;
  const vn = velocity.x * nxN + velocity.z * nzN;
  if (vn < 0) {
    velocity.x -= vn * nxN;
    velocity.z -= vn * nzN;
  }
  const vrelN = (velocity.x - obVelX) * nxN + (velocity.z - obVelZ) * nzN;
  if (vrelN < -0.3) {
    bumps.push({ impulse: -vrelN, dirX: -nxN, dirZ: -nzN });
  }
  return { x: rx, z: rz };
}
