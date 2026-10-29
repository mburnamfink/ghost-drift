# Game design

Battlezone meets Wipeout. Terms are defined in [CONTEXT.md](../CONTEXT.md); architecture decisions are in [docs/adr](adr/).

## Pillars

1. **Speed is armor.** A moving Ship is hard to hit; a slow one gets Boxed in. Every system should push the player to keep speed up.
2. **Every defensive tool costs speed or a scarce resource.** Powerslide trades speed for aim. Burst trades a Charge for safety.
3. **Readable at speed.** Flat-shaded solid polygons, a strict palette, distance fog. Anything between the camera and the Ship fades to a wireframe, so the Ship is never hidden.

## Core rules

- Hunters are slower than the Ship's top speed and faster than a Ship that is crawling.
- Hunter Shells are aimed at where the Ship is when fired, not where it will be. A moving Ship dodges them; a stationary one does not.
- Tank Shells are slow magenta orbs fired in Volleys every 2.25 ± 0.2 s, each aimed at a random point within 5 units of the Ship.
- Kills during one Powerslide form a Slide combo: ×1, ×2, ×3… up to ×8, with the total shown when the slide ends.
- Once a Wave is down to three or fewer Hunters (and at least one has been destroyed), the HUD counts them and pins an arrow to the screen edge on the side of the nearest.
- Touching a Hunter or a Shell costs one Hull. A short invulnerability window follows each hit.
- Bolts destroy Hunters. Killing Hunters scores points and thins the hunt, buying breathing room.
- Clearing a Wave restores all Burst Charges and starts the next, larger Wave after a short lull.
- During the lull, Plots about to Rise glow amber on the floor and Blocks about to Sink are outlined in cyan. The change happens as the next Wave starts.
- A Run is endless and ends when Hull reaches zero.

## Hunters

| Type      | From Wave | Behaviour                                                                                                                                                                                                                                                                          | Punishes                                   | Counter                                           | Score |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ----- |
| Tank      | 1         | Out of sight: Chasers close in, Cutters head the Ship off. In sight within 50: circles at a stand-off of about 28. Fires only in Volleys: every 2.25 ± 0.2 s, barrels glow and a magenta ring closes on the Ship for 0.55 s, then every Tank with a shot fires roughly at the Ship | Slowing down                               | Weave the volley, then slide and shoot in the gap | 1×    |
| Berserker | 2 (max 6) | No gun. Runs the Ship down faster than any Tank; within 24 it stops and glows for 0.35 s, then lunges straight at where the Ship was                                                                                                                                               | Hesitation at close range                  | Sidestep during the wind-up                       | 1.5×  |
| Sniper    | 3 (max 5) | Holds a long-sightline Perch 60–110 away; a thickening red beam and a scope glint track where the Ship will be 0.6 s ahead; on lock both flash white, then an instant shot                                                                                                         | Straight lines, including long Powerslides | Turn after the lock, break line of sight, Burst   | 2.5×  |
| Artillery | 5 (max 4) | Holds a covered Perch ~105 away; three-shell Salvo along the projected path, each landing as its ground circle fills                                                                                                                                                               | Open ground: the Plaza and Avenues         | Speed, or get under the buildings                 | 3×    |

From Wave 4, Tank numbers are cut by a quarter and special Hunters fill the gap. While a Sniper is aimed at the Ship, a red vignette deepens at the screen edges, and LOCKED flashes once it locks.

Every type dies to one Bolt. Snipers and Artillery keep their distance and move to a new Perch when the Ship gets close. Artillery blasts destroy any Hunter caught in them, and the player gets the score. Threats outside the view show as blinking arrows at the screen edge: red for a charging Sniper, orange for an incoming shell.

## The city

Each Run builds a new seeded city (ADR-0005). A ring road runs inside the Arena wall; three-cell Avenues frame a central Plaza 35% of the Arena wide; the eight districts around it are split by two-cell Streets and one-cell Alleys into Plots. About one Plot in ten stays empty as a pocket park.

| Wave            | Building Plots standing                                        | Plaza obstacles  |
| --------------- | -------------------------------------------------------------- | ---------------- |
| 1               | 50%, mostly those facing an Avenue, the ring road or the Plaza | 3                |
| each later Wave | +4%, side streets filling in                                   | +1 every 3 Waves |
| ceiling         | 90%, reached around Wave 11                                    | 7                |

From Wave 3, three standing Blocks Sink and are replaced each Wave, so routes keep changing after density levels off.

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

| Element                      | Color                               |
| ---------------------------- | ----------------------------------- |
| Ground                       | near-black blue                     |
| Blocks                       | muted slate, lighter with height    |
| Arena wall                   | dark violet                         |
| Ship, Bolts                  | cyan                                |
| Hunters                      | hot orange-red                      |
| Ship during Burst            | white                               |
| Tank Shells, volley warnings | hot magenta                         |
| Powerslide sparks            | pale yellow-white                   |
| Ghosted Block edges          | pale blue; faces fade to near-clear |
| Sniper laser                 | red, flashing white when locked     |
| Artillery target circles     | orange                              |

## MVP scope

- A seeded city per Run: Plaza, Avenues, Streets and Alleys, densifying between Waves.
- Ship with thrust, steering, Powerslide, Burst (3 Charges) and Bolts.
- Four Hunter types: Tanks (Chaser and Cutter roles), Berserkers, Snipers and Artillery.
- Endless Waves with growing Hunter counts, score with a Wave multiplier, Hull of 3.
- HUD: score, Wave, Hull, Charges, speed bar marked at Hunter speed. Title, pause and game-over screens.

## Roadmap after MVP

- Hunter types: fast hunters, minibosses.
- Defended objectives: targets placed in dense terrain, guarded by Hunters, that reward the player for diving into danger.
- Density and Hunter mix ramping over a Run.
- Audio, screen shake, hit feedback; high-score persistence.

## Tuning

All gameplay numbers live in `src/config.ts`. Change them there, not inline.
