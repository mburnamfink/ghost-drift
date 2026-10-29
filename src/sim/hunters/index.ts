import { CONFIG } from '../../config';
import { stepArtillery } from './artillery';
import { stepBerserker } from './berserker';
import { stepSniper } from './sniper';
import { stepTank } from './tank';
import type { Hunter, HuntContext, HunterAction, HunterKind } from './types';

export { createArtillery } from './artillery';
export { createBerserker, endLunge } from './berserker';
export { createSniper } from './sniper';
export { createTank } from './tank';
export type * from './types';

export function stepHunter(h: Hunter, ctx: HuntContext, dt: number): HunterAction | null {
  switch (h.kind) {
    case 'tank':
      return stepTank(h, ctx, dt);
    case 'berserker':
      return stepBerserker(h, ctx, dt);
    case 'sniper':
      return stepSniper(h, ctx, dt);
    case 'artillery':
      return stepArtillery(h, ctx, dt);
  }
}

export const hunterRadius = (kind: HunterKind): number => CONFIG[kind].radius;
export const hunterScoreMultiplier = (kind: HunterKind): number => CONFIG[kind].scoreMultiplier;
