# Game design

Battlezone meets Wipeout. Terms are defined in [CONTEXT.md](../CONTEXT.md); architecture decisions are in [docs/adr](adr/).

## Premise

Arcade tone. You are the Ghost: a lone pilot in an experimental hovertank, the last defender of the city of Arcadia against an invading army. Nobody can confirm the Ghost exists, because nothing can track it. The legend grows with every kill, and a Run ends when the Ghost goes down. Inspired by the folk legend of a lone ace; the city and the army are fictional.

On-screen copy carries the premise, all of it in `src/ui/copy.ts`. The title screen rotates five legends (_"One pilot. One city. No backup."_ and others) over a still from the attract loop's Showcase Run: the Ship's Shotgun breaking a Juggernaut with all three Pulses (`src/assets/splash.jpg`). Game over shows one of six messages (_THE GHOST GOES DOWN_, _TOO SLOW_, _SECTOR LOST_…) in the title's angular lettering. Also: Wave banners (_HOLD ARCADIA_, _THEY'RE STILL COMING_, _HEAVY METAL INBOUND_), the Multiplier shown as _GHOST ×N_, demo mode badged _UNCONFIRMED FOOTAGE_, and a legend rank on game over by score: Rumor (0), Sighting (20k), The Ghost (100k), Legend (300k), Myth (1M).

## Main menu

The title screen's menu offers PLAY (a ranked Run), CUSTOM GAME, DEMO (the autopilot, which any button ends) and HELP (the premise and controls). Custom games set the starting Wave (1–20), the Layout (or Random), and a density for each enemy type: Off, Low ×0.5, Normal, High ×1.5 or Max ×2. A Wave always sends at least one Hunter. Custom games are not ranked unless every setting is left as it is; the last settings are remembered.

After 12 s on the main menu without input the attract loop starts, and any button returns to the menu. It plays a scripted Showcase Run (`src/ai/showcase.ts`): a fixed Hub city at Wave 7, flown from a beat-by-beat script through the real simulation, so it plays out the same every time, badged _UNCONFIRMED FOOTAGE_. Then a roll call, _THE HUNTERS_, brings in each Hunter type's model with its name and Wave-1 points (Tank 100, Berserker 150, Sniper 250, Artillery 300, Juggernaut 800), then 7 s of high scores if there are any, then back to the menu. `?attract` opens straight on the loop.

## High scores

A top-10 table of initials, score and Wave, kept in the browser (`src/scores/`). A finished Run that makes the table asks for three initials on the game-over screen: type them, or on a pad use up/down for the letter, left/right to move and A when done. The table then shows with the new row flashing. The attract loop shows the table after its roll call. Runs abandoned from pause, and demo Runs, never enter the table.

## Pillars

1. **Speed is armor.** A moving Ship is hard to hit; a slow one gets Boxed in. Every system should push the player to keep speed up.
2. **Every defensive tool costs speed or a scarce resource.** Powerslide trades speed for aim. Burst trades a Charge for safety.
3. **Readable at speed.** Flat-shaded solid polygons, a strict palette, distance fog. Anything between the camera and the Ship fades to a wireframe, so the Ship is never hidden.

## Core rules

- Hunters are slower than the Ship's top speed and faster than a Ship that is crawling.
- Hunter Shells are aimed at where the Ship is when fired, not where it will be. A moving Ship dodges them; a stationary one does not.
- Every kill scores times the Multiplier, shown above the speed bar as _GHOST ×N_ over a bar of the Heat left in the current step: it drains as Heat burns off, and when it empties the number drops to the one below with the bar full again. Both run from hunter orange at ×2 to white-hot yellow at ×20. The Multiplier is one more than its Heat, with no cap: the drain, which grows with Heat, is the only limit. Each kill the player makes adds Heat and says why, rising above the bar:

  | Style    | Heat                     | When                                                                                                                    |
  | -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
  | any kill | +0.25                    | Always (_KILL_)                                                                                                         |
  | Drift    | +1                       | The shot left with the nose 35° or more off the line of travel, at half top speed or more                               |
  | Speed    | +1                       | The shot left with momentum full: 3 s at 85% of top speed fills it; below 60% it empties in 0.5 s, and a hit empties it |
  | Chain ×n | +0.25 per link, up to +1 | The kill came within 1 s of the last; one Shotgun blast through a pack chains                                           |

  Drift and Speed are judged when the shot is fired, so tapping Powerslide as a shot lands earns nothing, while a slide that ended before its shots landed still counts. Artillery blasts that destroy Hunters score points but add no Heat and never chain (_FRIENDLY FIRE_). Heat burns off at 0.15 + 0.035 × Heat per second while a Wave is live, so ×20 fades about four times faster than ×2 and ×40 about eight times.

- Once a Wave is down to three or fewer Hunters (and at least one has been destroyed), the HUD counts them and pins an arrow to the screen edge on the side of the nearest.
- Touching a Hunter or a Shell costs one Hull. A short invulnerability window follows each hit.
- The Ship carries two guns and switches between them at will. The Cannon fires rapid Bolts that bend up to 2.5 rad/s toward a Hunter within 0.2 rad of their flight. The Shotgun fires every 0.6 s: a 70° Pulse along the nose that sweeps out to 18 units in 0.22 s, plus a 70° Pulse square to the line of travel on each side reaching 10 units. The Pulses ride with the Ship and hold at full range for 0.3 s, destroying every Hunter that enters them where no Block shields it, so a Hunter can be driven into the arc ahead, and a Powerslide aims the nose at one target while the sides rake what the Ship glides past. A Hunter caught by two of one shot's Pulses takes one hit. Each hit freezes the game for 45 ms, flashes white and shoves a surviving Juggernaut back; the hull dims after a shot and throbs once the Shotgun is ready again.
- Bolts and Pulses destroy Hunters. Killing Hunters scores points and thins the hunt, buying breathing room.
- Clearing a Wave restores all Burst Charges and starts the next, larger Wave after a short lull.
- During the lull, Plots about to Rise glow amber on the floor and Blocks about to Sink are outlined in cyan. The change happens as the next Wave starts.
- A Run is endless and ends when Hull reaches zero.

## Hunters

| Type       | From Wave             | Behavior                                                                                                                                                                                                                                                                                                                                                                   | Punishes                                   | Counter                                               | Score |
| ---------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- | ----- |
| Tank       | 1                     | Out of sight: Chasers close in, Cutters head the Ship off. In sight within 50: circles at a stand-off of about 28. Fires a Shell at the Ship about every 2.2 s while it has a clear shot within 70                                                                                                                                                                         | Slowing down                               | Keep moving; slide and shoot                          | 1×    |
| Berserker  | 2 (max 6)             | No gun. Runs the Ship down faster than any Tank; within 24 it stops and glows for 0.35 s, then lunges straight at where the Ship was                                                                                                                                                                                                                                       | Hesitation at close range                  | Sidestep during the wind-up                           | 1.5×  |
| Sniper     | 3 (max 5)             | Holds a long-sightline Perch 60–110 away; a thickening red beam and a scope glint track where the Ship will be 0.6 s ahead; on lock both flash white, then an instant shot                                                                                                                                                                                                 | Straight lines, including long Powerslides | Turn after the lock, break line of sight, Burst       | 2.5×  |
| Artillery  | 5 (max 4)             | Holds a covered Perch ~85 away and fires only within 115; its mortar's mouth glows brighter while reloading and pulses when loaded; three-shell Salvo along the projected path, each landing as its ground circle fills                                                                                                                                                    | Open ground: the Plaza and Avenues         | Speed, or get under the buildings                     | 3×    |
| Juggernaut | 4, 7, 10… (2 from 13) | Armored mini-boss: 20 armor (Bolt 1, Pulse 5, Artillery blast 8), health bar overhead, flashes when hit. Slow; circles at about 20. Spawns only where no Block stands within 5 cells, if the city has such ground. Its turret traverses only 1.2 rad/s. With a clear shot within 50 its three barrels glow for 0.7 s, then a Spray: 5 large, slow Shells fanned across 50° | Hovering in front of it                    | Circle faster than the turret turns; Shotgun up close | 8×    |

From Wave 4, Tank numbers are cut by a quarter and special Hunters fill the gap. While a Sniper is aimed at the Ship, a red vignette deepens at the screen edges, and LOCKED flashes once it locks.

Every Hunter is built in the same faceted style, with a silhouette that names it: a low wedge Tank with side pods, a needle-nosed Berserker, a spindly tripod Sniper with a long shoulder rifle, and a squat splayed Artillery piece with a tilted mortar. Every type but the Juggernaut dies to one Bolt. Snipers and Artillery keep their distance and move to a new Perch when the Ship gets close. Artillery blasts destroy any Hunter caught in them, and the player gets the score. Threats outside the view show as blinking arrows at the screen edge: red for a charging Sniper, orange for an incoming shell.

## The city

Each Run builds a new seeded city, 96 cells (384 units) across, in one of seven Layouts picked at random (ADR-0006):

| Layout    | Shape                                                                                                                                                                                                                                  | Plays like                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Grid      | A regular lattice of square blocks (10 or 12 cells), Streets between them and an Avenue every 2–3 blocks, around a central Plaza and 2–3 park blocks; most blocks hold four square buildings, some one tower; taller toward the center | Urban canyons                        |
| Circuit   | A wide loop around a dense core, with spurs to 3–4 side Plazas                                                                                                                                                                         | Lapping, cutting across the core     |
| Districts | 3–5 Plazas of different sizes joined by Avenues, one extra loop                                                                                                                                                                        | Moving between arenas                |
| Hub       | Central Plaza, 5–7 walled spokes of uneven angle and length, each ending in a small Plaza, crossed by two ring roads broken into 2–3 arcs each; the outline follows the roads in a lopsided star                                       | Spokes and orbits                    |
| Raceway   | A figure-eight inside a sharp-cornered loop (triangle to hexagon), 7-cell highways lined with short wall segments, Plazas at the crossing and corners                                                                                  | Racing laps                          |
| Downtown  | A dense core of permanent skyscrapers anywhere from the center to the outline (where it merges into the Edge); a ring road skirts it, two streets cross it, and boulevards run out through low, half-empty suburbs with parks          | Open U around a fortress             |
| Towers    | Open ground with 4–8 isolated clumps of skyscrapers (2–3 cells wide, 30–56 tall) around a central field                                                                                                                                | Cover is scarce; dash between clumps |

Everywhere else, three-cell Streets and two-cell Alleys split the ground into Plots up to 12 cells on a side (7 in Districts), wide enough to thread at speed. About one Plot in ten stays empty as a pocket park. The city's outline is several overlapping arcs. Beyond it stands the Edge: purple towers that stand all Run. Plots near the Edge rise sooner and stand taller, so the city visibly thickens into it.

Lots at least 4 cells on a side may get a compound footprint instead of a rectangle:

| Layout    | Footprints, by weight                     |
| --------- | ----------------------------------------- |
| Grid      | rectangle 8, L 1, U 1                     |
| Circuit   | rectangle 3, stepped 3, L 2, T 1          |
| Districts | rectangle 2, L 2, T 2, U 2, cross 2, Z 1  |
| Hub       | rectangle 3, L 2, stepped 2, T 1, cross 1 |
| Raceway   | rectangle 4, L 2, stepped 2, T 1          |
| Downtown  | rectangle 3, L 2, T 2, U 1, cross 1       |
| Towers    | rectangle 2, cross 2, L 2, T 2, stepped 1 |

Circuit's loop (7 cells wide) and Hub's spokes (6 wide) are walled on both sides by permanent buildings 2 cells deep, with a 2-cell gate every 10 cells; Hub's spokes get a 3-cell gate every 8 and Raceway's highways a 3-cell gate every 7, so the Layout's shape reads from Wave 1. A dead-end bay is a hazard by design: Burst through it. Each city has one Arch: a bridge between two towers across a road, high enough to fly under. Its towers stand for the whole Run.

Buildings are drawn in assorted shapes (plain, tapered, slanted roof, stepped tiers, split into slabs) picked per Block. The shapes never leave the Block's square footprint, which is what collision uses.

| Wave            | Building Plots standing                                       | Plaza obstacles  |
| --------------- | ------------------------------------------------------------- | ---------------- |
| 1               | 45%, mostly those facing an Avenue or Plaza, or near the Edge | 3                |
| each later Wave | +3%, side streets filling in                                  | +1 every 3 Waves |
| ceiling         | 70%, reached around Wave 10                                   | 7                |

From Wave 3, three standing Blocks Sink and are replaced each Wave, so routes keep changing after density levels off.

## Controls

| Action                        | Xbox controller | Keyboard       |
| ----------------------------- | --------------- | -------------- |
| Steer                         | Left stick      | A / D or ← / → |
| Thrust                        | RT              | W or ↑         |
| Powerslide (hold)             | LT              | Shift          |
| Fire (hold)                   | RB or X         | Space          |
| Burst                         | A or LB         | E              |
| Switch gun                    | Y               | Q              |
| Start / pause                 | Menu (Start)    | Enter / Esc    |
| Main menu (paused, game over) | B               | Backspace      |

The browser only exposes a controller after a button is pressed with the page focused.

## Palette

| Element                  | Color                               |
| ------------------------ | ----------------------------------- |
| Ground                   | near-black blue                     |
| Blocks                   | muted slate, lighter with height    |
| Arena wall               | dark violet                         |
| Ship, Bolts              | cyan                                |
| Hunters                  | hot orange-red                      |
| Ship during Burst        | white                               |
| Tank Shells              | deep orange                         |
| Powerslide sparks        | pale yellow-white                   |
| Ghosted Block edges      | pale blue; faces fade to near-clear |
| Sniper laser             | red, flashing white when locked     |
| Artillery target circles | orange                              |

## MVP scope

- A seeded city per Run in one of seven Layouts, bounded by the Edge, densifying between Waves.
- A heading-up minimap: city, Edge and Hunters, with Hunters beyond its range pinned to the rim.
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
