/** One row of the high-score table. */
export interface ScoreEntry {
  initials: string;
  score: number;
  wave: number;
}

export const TABLE_SIZE = 10;

const STORAGE_KEY = 'ghost-drift.scores';
/** The single best score kept before the table existed. */
const LEGACY_BEST_KEY = 'quantum-breach.best';

/** Where `score` would rank in `table`, from 0, or null if it would not make the table. */
export function rankFor(table: readonly ScoreEntry[], score: number): number | null {
  if (score <= 0) return null;
  // A tie ranks below the existing entry: first to reach a score keeps the place.
  const rank = table.findIndex((e) => score > e.score);
  if (rank >= 0) return rank;
  return table.length < TABLE_SIZE ? table.length : null;
}

/** A new table with `entry` inserted at its rank and the table trimmed to size. */
export function insertScore(
  table: readonly ScoreEntry[],
  entry: ScoreEntry,
): { table: ScoreEntry[]; rank: number } | null {
  const rank = rankFor(table, entry.score);
  if (rank === null) return null;
  const next = [...table];
  next.splice(rank, 0, entry);
  return { table: next.slice(0, TABLE_SIZE), rank };
}

const isEntry = (e: unknown): e is ScoreEntry =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as ScoreEntry).initials === 'string' &&
  typeof (e as ScoreEntry).score === 'number' &&
  typeof (e as ScoreEntry).wave === 'number';

/**
 * Reads the table from this browser. A best score saved before the table existed comes in as
 * `???`. Storage can be missing or blocked; then the table starts empty and is not kept.
 */
export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isEntry).slice(0, TABLE_SIZE);
    }
    const legacy = Number(localStorage.getItem(LEGACY_BEST_KEY));
    return legacy > 0 ? [{ initials: '???', score: legacy, wave: 0 }] : [];
  } catch {
    return [];
  }
}

export function saveScores(table: readonly ScoreEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // Private windows and blocked storage: the table lasts for this session only.
  }
}
