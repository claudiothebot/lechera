/**
 * Editor-side asset catalog.
 *
 * Centralises per-mode asset kind metadata (id, label) so the level editor
 * can render a generic "Variant / Kind" picker without knowing the specifics
 * of each category. Adding a new asset in the future is a 3-step process:
 *
 *   1. Drop the optimised `.glb` under `public/models/`.
 *   2. Extend the union / kinds array + URL + label maps in the owning
 *      module (`houseModel.ts` / `treeModel.ts` / `sceneryProps.ts`).
 *   3. That's it — the editor picks it up automatically.
 *
 * The catalog is keyed by editor mode, not by category, because the
 * editor groups modes like `houses`, `trees`, `props`. Modes that don't
 * have a selectable kind (paving, boundary, billboards) simply aren't in
 * the catalog.
 */

import { HOUSE_VARIANT_LABELS } from '../game/houseModel';
import {
  HOUSE_VARIANT_KINDS,
  SCENERY_PROP_KINDS,
  TREE_VARIANT_KINDS,
  type HouseVariantKind,
  type SceneryPropKind,
  type TreeVariantKind,
} from '../game/levelDefinition';
import { TREE_VARIANT_LABELS } from '../game/treeModel';
import { SCENERY_PROP_LABELS } from '../game/sceneryProps';

export type AssetCatalogMode = 'houses' | 'trees' | 'props';

export interface AssetKindOption<Id extends string = string> {
  id: Id;
  label: string;
}

export const ASSET_CATALOG: {
  houses: readonly AssetKindOption<HouseVariantKind>[];
  trees: readonly AssetKindOption<TreeVariantKind>[];
  props: readonly AssetKindOption<SceneryPropKind>[];
} = {
  houses: HOUSE_VARIANT_KINDS.map((id) => ({ id, label: HOUSE_VARIANT_LABELS[id] })),
  trees: TREE_VARIANT_KINDS.map((id) => ({ id, label: TREE_VARIANT_LABELS[id] })),
  props: SCENERY_PROP_KINDS.map((id) => ({ id, label: SCENERY_PROP_LABELS[id] })),
};

/**
 * Whether a given editor mode surfaces a kind picker. Used to toggle the
 * "Variant" dropdown next to the Add button.
 */
export function modeHasAssetCatalog(mode: string): mode is AssetCatalogMode {
  return mode === 'houses' || mode === 'trees' || mode === 'props';
}
