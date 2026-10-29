/** Rotating lines under the title. */
export const LEGENDS: readonly string[] = [
  'Outnumbered. Outgunned. Never outmaneuvered.',
  'One ace. Endless enemies. Defend your city.',
  'One pilot. One city. No backup.',
  'The Ghost of Arcadia is just a rumor. Tell that to the wrecks.',
  'Haunt the battlefield.',
];

/** Seconds each legend shows before the next. */
export const LEGEND_SECONDS = 6;

/** One is picked at random each time the Ghost goes down. */
export const GAME_OVER_MESSAGES: readonly string[] = [
  'The Ghost goes down',
  'Insert coin. Save Arcadia',
  'Speed is armor',
  'Too slow',
  'There were too many of them',
  'Sector lost',
];

/** What the city calls you, by score. Each threshold is the score needed to earn the title. */
export const LEGEND_RANKS: readonly [number, string][] = [
  [1_000_000, 'MYTH'],
  [300_000, 'LEGEND'],
  [100_000, 'THE GHOST'],
  [20_000, 'SIGHTING'],
  [0, 'RUMOR'],
];

export const legendRank = (score: number): string =>
  LEGEND_RANKS.find(([threshold]) => score >= threshold)![1];
