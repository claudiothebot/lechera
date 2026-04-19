import * as THREE from 'three';

/**
 * PBR tileable texture set loader.
 *
 * Conventions we apply (see threejs-gamedev-skill/references/texturing-pipeline.md):
 *  - albedo/color → sRGB color space
 *  - normal/roughness → linear (NoColorSpace), treated as data maps
 *  - RepeatWrapping + user-controlled `repeat` in tiles-per-metre
 *  - anisotropy capped to the renderer's max (big win on grazing angles)
 *  - mipmaps left to Three.js defaults (textures here are 1K JPG)
 */

export interface PbrMapUrls {
  color: string;
  normal?: string;
  roughness?: string;
}

export interface PbrMaterialOptions {
  /** Texture units per world-metre (u,v). Same value for u/v keeps tiles square. */
  tilesPerMetre?: number;
  /** Overrides per channel if you need non-square tiling. */
  tilesPerMetreU?: number;
  tilesPerMetreV?: number;
  /** Extra multiplier on the normal map strength (Three default ~= 1). */
  normalScale?: number;
  /** Base roughness multiplier baked on top of the roughness map. */
  roughness?: number;
  /** Optional material name for debugging. */
  name?: string;
}

export interface PbrMaterialResult {
  material: THREE.MeshStandardMaterial;
  /**
   * Rebind the texture repeat for a specific surface size (metres).
   * Call this after attaching the material to a mesh whose extents you know.
   */
  setPlaneSize(widthMetres: number, heightMetres: number): void;
}

export async function loadPbrMaterial(
  renderer: THREE.WebGLRenderer,
  urls: PbrMapUrls,
  opts: PbrMaterialOptions = {},
): Promise<PbrMaterialResult> {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const [colorTex, normalTex, roughTex] = await Promise.all([
    loader.loadAsync(urls.color),
    urls.normal ? loader.loadAsync(urls.normal) : Promise.resolve(null),
    urls.roughness ? loader.loadAsync(urls.roughness) : Promise.resolve(null),
  ]);

  colorTex.colorSpace = THREE.SRGBColorSpace;
  configureTiling(colorTex, maxAniso);

  if (normalTex) {
    normalTex.colorSpace = THREE.NoColorSpace;
    configureTiling(normalTex, maxAniso);
  }
  if (roughTex) {
    roughTex.colorSpace = THREE.NoColorSpace;
    configureTiling(roughTex, maxAniso);
  }

  const material = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex ?? null,
    roughnessMap: roughTex ?? null,
    roughness: opts.roughness ?? 1.0,
    metalness: 0.0,
    name: opts.name,
  });

  if (normalTex && opts.normalScale !== undefined) {
    material.normalScale.setScalar(opts.normalScale);
  }

  const tU = opts.tilesPerMetreU ?? opts.tilesPerMetre ?? 0.25;
  const tV = opts.tilesPerMetreV ?? opts.tilesPerMetre ?? 0.25;

  const allTex: THREE.Texture[] = [colorTex];
  if (normalTex) allTex.push(normalTex);
  if (roughTex) allTex.push(roughTex);

  function applyRepeat(uRepeat: number, vRepeat: number) {
    for (const tex of allTex) {
      tex.repeat.set(uRepeat, vRepeat);
      tex.needsUpdate = true;
    }
  }

  // Default repeat is set for a 1x1 metre surface; callers should normally
  // invoke setPlaneSize() to recompute proportional tiling for their mesh.
  applyRepeat(tU, tV);

  return {
    material,
    setPlaneSize(widthMetres: number, heightMetres: number) {
      applyRepeat(tU * widthMetres, tV * heightMetres);
    },
  };
}

function configureTiling(tex: THREE.Texture, maxAniso: number) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
}
