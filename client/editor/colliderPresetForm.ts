import type { ColliderPresets } from '../game/colliderPresets';
import {
  HOUSE_VARIANT_KINDS,
  SCENERY_PROP_KINDS,
  TREE_VARIANT_KINDS,
} from '../game/levelDefinition';
import { HOUSE_VARIANT_LABELS } from '../game/houseModel';
import { TREE_VARIANT_LABELS } from '../game/treeModel';
import { SCENERY_PROP_LABELS } from '../game/sceneryProps';

const RANGE = { min: '0.2', max: '1.5', step: '0.01' };

function mk(
  parent: HTMLElement,
  title: string,
  get: () => number,
  set: (v: number) => void,
  onLive: () => void,
) {
  const label = document.createElement('label');
  label.className = 'level-editor__field level-editor__collider-row';
  const span = document.createElement('span');
  span.className = 'level-editor__collider-title';
  span.textContent = title;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = RANGE.min;
  input.max = RANGE.max;
  input.step = RANGE.step;
  input.value = String(get());
  const out = document.createElement('span');
  out.className = 'level-editor__collider-value';
  out.textContent = input.value;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    set(v);
    out.textContent = String(v);
    onLive();
  });
  label.appendChild(span);
  label.appendChild(input);
  label.appendChild(out);
  parent.appendChild(label);
}

/**
 * Binds the collider-preset form to a live `ColliderPresets` object (mutated in place).
 */
export function mountColliderPresetForm(
  container: HTMLElement,
  presets: ColliderPresets,
  onLive: () => void,
): void {
  container.replaceChildren();

  const h = (t: string) => {
    const e = document.createElement('div');
    e.className = 'level-editor__collider-heading';
    e.textContent = t;
    container.appendChild(e);
  };

  h('Houses (footprint × scale)');
  for (const id of HOUSE_VARIANT_KINDS) {
    h(HOUSE_VARIANT_LABELS[id]);
    mk(
      container,
      'Width / depth (XZ)',
      () => presets.houses[id]!.footprintScaleXZ,
      (v) => {
        presets.houses[id]!.footprintScaleXZ = v;
      },
      onLive,
    );
    mk(
      container,
      'Height (Y)',
      () => presets.houses[id]!.footprintScaleY,
      (v) => {
        presets.houses[id]!.footprintScaleY = v;
      },
      onLive,
    );
  }

  h('Trees (trunk radius × scale)');
  for (const id of TREE_VARIANT_KINDS) {
    h(TREE_VARIANT_LABELS[id]);
    mk(
      container,
      'Trunk',
      () => presets.trees[id]!.trunkRadiusScale,
      (v) => {
        presets.trees[id]!.trunkRadiusScale = v;
      },
      onLive,
    );
  }

  h('Scenery props (AABB vs mesh bounds)');
  for (const id of SCENERY_PROP_KINDS) {
    h(SCENERY_PROP_LABELS[id]);
    mk(
      container,
      'Width / depth (XZ)',
      () => presets.sceneryProps[id]!.footprintScaleXZ,
      (v) => {
        presets.sceneryProps[id]!.footprintScaleXZ = v;
      },
      onLive,
    );
    mk(
      container,
      'Height (Y)',
      () => presets.sceneryProps[id]!.footprintScaleY,
      (v) => {
        presets.sceneryProps[id]!.footprintScaleY = v;
      },
      onLive,
    );
  }

  h('Tweet billboard');
  mk(
    container,
    'Width / depth (XZ)',
    () => presets.tweetBillboard.footprintScaleXZ,
    (v) => {
      presets.tweetBillboard.footprintScaleXZ = v;
    },
    onLive,
  );
  mk(
    container,
    'Height (Y)',
    () => presets.tweetBillboard.footprintScaleY,
    (v) => {
      presets.tweetBillboard.footprintScaleY = v;
    },
    onLive,
  );
}
