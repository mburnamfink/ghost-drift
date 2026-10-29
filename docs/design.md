# Game design

Battlezone meets Wipeout. Terms are defined in [CONTEXT.md](../CONTEXT.md); architecture decisions are in [docs/adr](adr/).

## Pillars

1. **Speed is armor.** A moving Ship is hard to hit; a slow one gets Boxed in. Every system should push the player to keep speed up.
2. **Every defensive tool costs speed or a scarce resource.** Powerslide trades speed for aim. Burst trades a Charge for safety.
3. **Readable at speed.** Flat-shaded solid polygons, a strict palette, distance fog.

## Core rules

- Hunters are slower than the Ship's top speed and faster than a Ship that is crawling.
- Hunter Shells are aimed at where the Ship is when fired, not where it will be. A moving Ship dodges them; a stationary one does not.
- Touching a Hunter or a Shell costs one Hull. A short invulnerability window follows each hit.
- Bolts destroy Hunters. Killing Hunters scores points and thins the hunt, buying breathing room.
- Clearing a Wave restores all Burst Charges and starts the next, larger Wave after a short lull.
- A Run is endless and ends when Hull reaches zero.

## Controls

| Action            | Xbox controller | Keyboard       |
| ----------------- | --------------- | -------------- |
| Steer             | Left stick      | A / D or ← / → |
| Thrust            | RT              | W or ↑         |
| Powerslide (hold) | LT              | Shift          |
| Fire (hold)       | RB or X         | Space          |
| Burst             | A or LB         | E              |
| Start / pause     | Menu (Start)    | Enter / Esc    |

The browser only exposes a controller after a button is pressed with the page focused.

## Palette

| Element           | Color                            |
| ----------------- | -------------------------------- |
| Ground            | near-black blue                  |
| Blocks            | muted slate, lighter with height |
| Arena wall        | dark violet                      |
| Ship, Bolts       | cyan                             |
| Hunters, Shells   | hot orange-red                   |
| Ship during Burst | white                            |

## MVP scope

- One Arena with procedurally varied Density.
- Ship with thrust, steering, Powerslide, Burst (3 Charges) and Bolts.
- One Hunter type, split into Chaser and Cutter roles, that fires Shells with line of sight.
- Endless Waves with growing Hunter counts, score with a Wave multiplier, Hull of 3.
- HUD: score, Wave, Hull, Charges, speed bar marked at Hunter speed. Title, pause and game-over screens.

## Roadmap after MVP

- Hunter types: fast hunters, minibosses, artillery (area denial), snipers (punish straight lines).
- Defended objectives: targets placed in dense terrain, guarded by Hunters, that reward the player for diving into danger.
- Density and Hunter mix ramping over a Run.
- Audio, screen shake, hit feedback; high-score persistence.

## Tuning

All gameplay numbers live in `src/config.ts`. Change them there, not inline.
