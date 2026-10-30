import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { buildCity } from './generate';
import { type CityLayoutName, LAYOUTS, LAYOUT_NAMES, type LayoutName } from './layouts';
import type { CityPlan } from './plan';

export { type CityLayoutName, LAYOUT_NAMES, type LayoutName } from './layouts';
export * from './plan';

export const isLayoutName = (s: string): s is LayoutName =>
  (LAYOUT_NAMES as readonly string[]).includes(s);

/** Generates a Run's city in `layout`, or in one chosen at random from the seed. */
export function generateCity(
  rng: Rng,
  layout?: CityLayoutName,
  cells: number = CONFIG.arena.cells,
): CityPlan {
  const name = layout ?? LAYOUT_NAMES[rng.int(LAYOUT_NAMES.length)]!;
  return buildCity(LAYOUTS[name](rng, cells), rng, cells);
}
