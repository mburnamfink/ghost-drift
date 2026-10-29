import { describe, expect, it } from 'vitest';
import { NO_NAV } from '../input/input';
import { Menu, defaultSettings, isStandard } from './menu';

const press = (
  over: Partial<{ up: boolean; down: boolean; left: boolean; right: boolean }> = {},
) => ({
  nav: { ...NO_NAV, ...over },
  confirm: false,
  back: false,
});
const confirm = { nav: NO_NAV, confirm: true, back: false };
const back = { nav: NO_NAV, confirm: false, back: true };

describe('Menu', () => {
  it('starts a Run from PLAY and the demo from DEMO', () => {
    const menu = new Menu(defaultSettings());
    expect(menu.apply(confirm)).toEqual({ type: 'play' });
    menu.apply(press({ down: true }));
    menu.apply(press({ down: true }));
    expect(menu.apply(confirm)).toEqual({ type: 'demo' });
  });

  it('wraps the selection around the list', () => {
    const menu = new Menu(defaultSettings());
    menu.apply(press({ up: true }));
    expect(menu.view().rows[menu.selected]!.label).toBe('HELP');
  });

  it('changes custom settings with left and right, and starts with them', () => {
    const menu = new Menu(defaultSettings());
    menu.apply(press({ down: true }));
    menu.apply(confirm);
    expect(menu.page).toBe('custom');
    menu.apply(press({ right: true }));
    menu.apply(press({ right: true }));
    menu.apply(press({ down: true }));
    menu.apply(press({ right: true }));
    menu.apply(press({ down: true }));
    menu.apply(press({ left: true }));
    menu.apply(press({ left: true }));
    const view = menu.view();
    expect(view.rows[0]!.value).toBe('3');
    expect(view.rows[1]!.value).toBe('GRID');
    expect(view.rows[2]).toEqual({ label: 'TANKS', value: 'OFF' });
    while (menu.view().rows[menu.selected]!.label !== 'START') menu.apply(press({ down: true }));
    const action = menu.apply(confirm);
    expect(action).toMatchObject({
      type: 'custom',
      settings: { wave: 3, layout: 'grid', density: { tanks: 0 } },
    });
  });

  it('returns to the main list with back, with the page it came from selected', () => {
    const menu = new Menu(defaultSettings());
    menu.apply(press({ up: true }));
    menu.apply(confirm);
    expect(menu.page).toBe('help');
    menu.apply(back);
    expect(menu.page).toBe('main');
    expect(menu.view().rows[menu.selected]!.label).toBe('HELP');
  });

  it('counts only untouched settings as a standard Run', () => {
    expect(isStandard(defaultSettings())).toBe(true);
    expect(isStandard({ ...defaultSettings(), wave: 2 })).toBe(false);
  });

  it('goes home to the main list on the item for the page that was open', () => {
    const menu = new Menu(defaultSettings());
    menu.apply(press({ down: true }));
    menu.apply(confirm);
    menu.home();
    expect(menu.page).toBe('main');
    expect(menu.view().rows[menu.selected]!.label).toBe('CUSTOM GAME');
  });
});
