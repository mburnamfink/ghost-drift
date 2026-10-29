import type { FrameInput } from '../input/input';
import { LAYOUT_NAMES, type LayoutName } from '../sim/city';
import type { EnemyDensity, WaveMix } from '../sim/waves';

/** Everything a custom game can change from a normal Run. */
export interface CustomSettings {
  wave: number;
  layout: LayoutName | 'random';
  density: Record<keyof WaveMix, number>;
}

export type MenuAction =
  { type: 'play' } | { type: 'custom'; settings: CustomSettings } | { type: 'demo' } | null;

export type MenuPage = 'main' | 'custom' | 'help';

/** What the HUD draws for the current menu page. */
export interface MenuView {
  page: MenuPage;
  selected: number;
  rows: { label: string; value?: string }[];
}

export const MAX_START_WAVE = 20;

const DENSITY_STEPS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'OFF' },
  { value: 0.5, label: 'LOW' },
  { value: 1, label: 'NORMAL' },
  { value: 1.5, label: 'HIGH' },
  { value: 2, label: 'MAX' },
];

const ENEMIES: readonly { key: keyof WaveMix; label: string }[] = [
  { key: 'tanks', label: 'TANKS' },
  { key: 'berserkers', label: 'BERSERKERS' },
  { key: 'snipers', label: 'SNIPERS' },
  { key: 'artillery', label: 'ARTILLERY' },
  { key: 'juggernauts', label: 'JUGGERNAUTS' },
];

const LAYOUTS: readonly (LayoutName | 'random')[] = ['random', ...LAYOUT_NAMES];

const MAIN_ROWS = ['PLAY', 'CUSTOM GAME', 'DEMO', 'HELP'] as const;

/** Custom-page rows: starting Wave, layout, one per enemy type, then the two actions. */
const CUSTOM_ROWS = 2 + ENEMIES.length + 2;
const START_ROW = CUSTOM_ROWS - 2;

const SETTINGS_KEY = 'ghost-drift.custom';

export const defaultSettings = (): CustomSettings => ({
  wave: 1,
  layout: 'random',
  density: { tanks: 1, berserkers: 1, snipers: 1, artillery: 1, juggernauts: 1 },
});

/**
 * The title screen's menus: the main list, the custom-game settings and help. Up and down move
 * the selection, left and right change a setting, confirm activates, back returns to the main list.
 */
export class Menu {
  page: MenuPage = 'main';
  selected = 0;
  settings: CustomSettings;

  constructor(settings: CustomSettings = loadSettings()) {
    this.settings = settings;
  }

  apply(input: Pick<FrameInput, 'nav' | 'confirm' | 'back'>): MenuAction {
    const rows = this.view().rows.length;
    if (input.nav.up) this.selected = (this.selected + rows - 1) % rows;
    if (input.nav.down) this.selected = (this.selected + 1) % rows;
    if (this.page === 'custom' && (input.nav.left || input.nav.right)) {
      this.adjust(input.nav.right ? 1 : -1);
    }
    if (input.back && this.page !== 'main') {
      this.home();
      return null;
    }
    return input.confirm ? this.activate() : null;
  }

  view(): MenuView {
    const { page, selected } = this;
    switch (page) {
      case 'main':
        return { page, selected, rows: MAIN_ROWS.map((label) => ({ label })) };
      case 'help':
        return { page, selected, rows: [{ label: 'BACK' }] };
      case 'custom': {
        const s = this.settings;
        return {
          page,
          selected,
          rows: [
            { label: 'STARTING WAVE', value: String(s.wave) },
            { label: 'LAYOUT', value: s.layout.toUpperCase() },
            ...ENEMIES.map(({ key, label }) => ({ label, value: densityLabel(s.density[key]) })),
            { label: 'START' },
            { label: 'BACK' },
          ],
        };
      }
    }
  }

  private activate(): MenuAction {
    if (this.page === 'main') {
      switch (MAIN_ROWS[this.selected]) {
        case 'PLAY':
          return { type: 'play' };
        case 'CUSTOM GAME':
          this.open('custom', 0);
          return null;
        case 'DEMO':
          return { type: 'demo' };
        case 'HELP':
          this.open('help', 0);
          return null;
      }
    }
    if (this.page === 'custom' && this.selected === START_ROW) {
      saveSettings(this.settings);
      return { type: 'custom', settings: structuredClone(this.settings) };
    }
    if (this.page === 'help' || (this.page === 'custom' && this.selected === START_ROW + 1)) {
      this.home();
    }
    return null;
  }

  private adjust(step: 1 | -1): void {
    const s = this.settings;
    if (this.selected === 0) {
      s.wave = Math.min(MAX_START_WAVE, Math.max(1, s.wave + step));
    } else if (this.selected === 1) {
      const i = LAYOUTS.indexOf(s.layout);
      s.layout = LAYOUTS[(i + step + LAYOUTS.length) % LAYOUTS.length]!;
    } else if (this.selected < START_ROW) {
      const { key } = ENEMIES[this.selected - 2]!;
      const i = DENSITY_STEPS.findIndex((d) => d.value === s.density[key]);
      const next = Math.min(DENSITY_STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + step));
      s.density[key] = DENSITY_STEPS[next]!.value;
    }
  }

  /** Back to the main list, on the item for whichever page was open. */
  home(): void {
    if (this.page !== 'main') this.open('main', this.page === 'custom' ? 1 : 3);
  }

  private open(page: MenuPage, selected: number): void {
    this.page = page;
    this.selected = selected;
  }
}

const densityLabel = (value: number): string =>
  DENSITY_STEPS.find((d) => d.value === value)?.label ?? `${value}×`;

/** True if the settings would play a normal Run, so its score can count. */
export const isStandard = (s: CustomSettings): boolean =>
  s.wave === 1 && s.layout === 'random' && Object.values(s.density).every((d) => d === 1);

export const densityOf = (s: CustomSettings): EnemyDensity => ({ ...s.density });

function loadSettings(): CustomSettings {
  const fallback = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CustomSettings>;
    return {
      wave: typeof parsed.wave === 'number' ? parsed.wave : fallback.wave,
      layout: LAYOUTS.includes(parsed.layout as LayoutName) ? parsed.layout! : fallback.layout,
      density: { ...fallback.density, ...parsed.density },
    };
  } catch {
    return fallback;
  }
}

function saveSettings(settings: CustomSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Without storage the settings last for this session only.
  }
}
