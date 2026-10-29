import { describe, expect, it } from 'vitest';
import { NO_NAV } from '../input/input';
import { type ScoreEntry, TABLE_SIZE, insertScore, rankFor } from './highScores';
import { InitialsEntry } from './initials';

const table = (scores: number[]): ScoreEntry[] =>
  scores.map((score, i) => ({ initials: `P${i}`.padEnd(3, 'X'), score, wave: 1 }));

describe('High-score table', () => {
  it('ranks a score among the entries, below an equal one', () => {
    const t = table([900, 500, 100]);
    expect(rankFor(t, 1000)).toBe(0);
    expect(rankFor(t, 500)).toBe(2);
    expect(rankFor(t, 50)).toBe(3);
    expect(rankFor(t, 0)).toBeNull();
  });

  it('keeps only the top entries, and turns away scores that would not make it', () => {
    const full = table(Array.from({ length: TABLE_SIZE }, (_, i) => 1000 - i * 10));
    expect(rankFor(full, 5)).toBeNull();
    const result = insertScore(full, { initials: 'ACE', score: 995, wave: 9 })!;
    expect(result.rank).toBe(1);
    expect(result.table).toHaveLength(TABLE_SIZE);
    expect(result.table[1]!.initials).toBe('ACE');
    expect(result.table[TABLE_SIZE - 1]!.score).toBe(920);
  });
});

describe('Initials entry', () => {
  const input = (over: Partial<Parameters<InitialsEntry['apply']>[0]>) => ({
    typed: '',
    nav: NO_NAV,
    back: false,
    confirm: false,
    ...over,
  });

  it('fills slots from typed letters and finishes on confirm', () => {
    const e = new InitialsEntry();
    e.apply(input({ typed: 'GH' }));
    e.apply(input({ typed: 'D' }));
    expect(e.initials).toBe('GHD');
    expect(e.done).toBe(false);
    e.apply(input({ confirm: true }));
    expect(e.done).toBe(true);
  });

  it('cycles letters with up and down, moves with left and right, finishes past the last slot', () => {
    const e = new InitialsEntry();
    e.apply(input({ nav: { ...NO_NAV, down: true } }));
    expect(e.letters[0]).toBe('Z');
    e.apply(input({ nav: { ...NO_NAV, right: true } }));
    e.apply(input({ nav: { ...NO_NAV, up: true } }));
    e.apply(input({ nav: { ...NO_NAV, right: true } }));
    e.apply(input({ nav: { ...NO_NAV, right: true } }));
    expect(e.initials).toBe('ZBA');
    expect(e.done).toBe(true);
  });

  it('steps back a slot to retype', () => {
    const e = new InitialsEntry();
    e.apply(input({ typed: 'AB' }));
    e.apply(input({ back: true }));
    e.apply(input({ typed: 'X' }));
    expect(e.initials).toBe('AXA');
  });
});
