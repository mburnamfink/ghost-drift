# Game design

Battlezone meets Wipeout. Terms are defined in [CONTEXT.md](../CONTEXT.md); architecture decisions are in [docs/adr](adr/).

## Premise

Arcade tone. You are the Ghost: a lone pilot in an experimental hovertank, the last defender of the city of Arcadia against an invading army. Nobody can confirm the Ghost exists, because nothing can track it. The legend grows with every kill, and a Run ends when the Ghost goes down. Inspired by the folk legend of a lone ace; the city and the army are fictional.

On-screen copy carries the premise: the tagline _"They say one pilot is holding Arcadia alone."_, Wave banners (_HOLD ARCADIA_, _THEY'RE STILL COMING_, _HEAVY METAL INBOUND_), the Multiplier shown as _GHOST ×N_, demo mode badged _UNCONFIRMED FOOTAGE_, and a legend rank on game over by score: Rumour (0), Sighting (20k), The Ghost (100k), Legend (300k), Myth (1M).

## Pillars

1. **Speed is armor.** A moving Ship is hard to hit; a slow one gets Boxed in. Every system should push the player to keep speed up.
2. **Every defensive tool costs speed or a scarce resource.** Powerslide trades speed for aim. Burst trades a Charge for safety.
3. **Readable at speed.** Flat-shaded solid polygons, a strict palette, distance fog. Anything between the camera and the Ship fades to a wireframe, so the Ship is never hidden.

## Core rules

- Hunters are slower than the Ship's top speed and faster than a Ship that is crawling.
- Hunter Shells are aimed at where the Ship is when fired, not where it will be. A moving Ship dodges them; a stationary one does not.
- Every kill scores times the Multiplier, shown above the speed bar with its clock. Each kill made while Powersliding raises it by one, up to ×10. Any kill restarts its 6 s clock; when the clock runs out it falls back to ×1. The clock stops between Waves.
- Once a Wave is down to three or fewer Hunters (and at least one has been destroyed), the HUD counts them and pins an arrow to the screen edge on the side of the nearest.
- Touching a Hunter or a Shell costs one Hull. A short invulnerability window follows each hit.
- The Ship carries two guns and switches between them at will. The Cannon fires rapid Bolts that bend up to 2.5 rad/s toward a Hunter within 0.2 rad of their flight. The Shotgun fires a Pulse every 0.5 s: a 70° arc that sweeps out to 18 units in 0.22 s and destroys every Hunter it reaches that no Block shields. The Pulse carries the Ship's momentum.
- Bolts and Pulses destroy Hunters. Killing Hunters scores points and thins the hunt, buying breathing room.
- Clearing a Wave restores all Burst Charges and starts the next, larger Wave after a short lull.
- During the lull, Plots about to Rise glow amber on the floor and Blocks about to Sink are outlined in cyan. The change happens as the next Wave starts.
- A Run is endless and ends when Hull reaches zero.

## Hunters

| Type       | From Wave             | Behaviour                                                                                                                                                                                                                                                                                     | Punishes                                   | Counter                                               | Score |
| ---------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- | ----- |
| Tank       | 1                     | Out of sight: Chasers close in, Cutters head the Ship off. In sight within 50: circles at a stand-off of about 28. Fires a Shell at the Ship about every 2.2 s while it has a clear shot within 70                                                                                            | Slowing down                               | Keep moving; slide and shoot                          | 1×    |
| Berserker  | 2 (max 6)             | No gun. Runs the Ship down faster than any Tank; within 24 it stops and glows for 0.35 s, then lunges straight at where the Ship was                                                                                                                                                          | Hesitation at close range                  | Sidestep during the wind-up                           | 1.5×  |
| Sniper     | 3 (max 5)             | Holds a long-sightline Perch 60–110 away; a thickening red beam and a scope glint track where the Ship will be 0.6 s ahead; on lock both flash white, then an instant shot                                                                                                                    | Straight lines, including long Powerslides | Turn after the lock, break line of sight, Burst       | 2.5×  |
| Artillery  | 5 (max 4)             | Holds a covered Perch ~85 away and fires only within 115; its mortar's mouth glows brighter while reloading and pulses when loaded; three-shell Salvo along the projected path, each landing as its ground circle fills                                                                       | Open ground: the Plaza and Avenues         | Speed, or get under the buildings                     | 3×    |
| Juggernaut | 4, 7, 10… (2 from 13) | Armoured mini-boss: 20 armour (Bolt 1, Pulse 5, Artillery blast 8), health bar overhead, flashes when hit. Slow; circles at about 20. Its turret traverses only 1.2 rad/s. With a clear shot within 50 its three barrels glow for 0.7 s, then a Spray: 5 large, slow Shells fanned across 50° | Hovering in front of it                    | Circle faster than the turret turns; Shotgun up close | 8×    |

From Wave 4, Tank numbers are cut by a quarter and special Hunters fill the gap. While a Sniper is aimed at the Ship, a red vignette deepens at the screen edges, and LOCKED flashes once it locks.

Every Hunter is built in the same faceted style, with a silhouette that names it: a low wedge Tank with side pods, a needle-nosed Berserker, a spindly tripod Sniper with a long shoulder rifle, and a squat splayed Artillery piece with a tilted mortar. Every type but the Juggernaut dies to one Bolt. Snipers and Artillery keep their distance and move to a new Perch when the Ship gets close. Artillery blasts destroy any Hunter caught in them, and the player gets the score. Threats outside the view show as blinking arrows at the screen edge: red for a charging Sniper, orange for an incoming shell.

## The city

Each Run builds a new seeded city, 96 cells (384 units) across, in one of four Layouts picked at random (ADR-0006):

| Layout    | Shape                                                           | Plays like                       |
| --------- | --------------------------------------------------------------- | -------------------------------- |
| Grid      | Five-cell Avenues edge to edge around a square central Plaza    | Long straight speed lanes        |
| Circuit   | A wide loop around a dense core, with spurs to 3–4 side Plazas  | Lapping, cutting across the core |
| Districts | 3–5 Plazas of different sizes joined by Avenues, one extra loop | Moving between arenas            |
| Hub       | Central Plaza, 6–8 radiating Avenues, two ring roads            | Spokes and orbits                |

Everywhere else, two-cell Streets and one-cell Alleys split the ground into Plots up to 12 cells on a side. About one Plot in ten stays empty as a pocket park. The city's outline is several overlapping arcs. Beyond it stands the Edge: purple towers that stand all Run. Plots near the Edge rise sooner and stand taller, so the city visibly thickens into it.

Lots at least 4 cells on a side may get a compound footprint instead of a rectangle:

| Layout    | Footprints, by weight                     |
| --------- | ----------------------------------------- |
| Grid      | rectangle 5, L 3, T 1, Z 1                |
| Circuit   | rectangle 3, stepped 3, L 2, T 1          |
| Districts | rectangle 2, L 2, T 2, U 2, cross 2, Z 1  |
| Hub       | rectangle 3, L 2, stepped 2, T 1, cross 1 |

Circuit's loop (7 cells wide) and Hub's spokes (6 wide) are walled on both sides by permanent buildings 2 cells deep, with a 2-cell gate every 10 cells, so the Layout's shape reads from Wave 1. A dead-end bay is a hazard by design: Burst through it. Each city has one Arch: a bridge between two towers across a road, high enough to fly under. Its towers stand for the whole Run.

Buildings are drawn in assorted shapes (plain, tapered, slanted roof, stepped tiers, split into slabs) picked per Block. The shapes never leave the Block's square footprint, which is what collision uses.

| Wave            | Building Plots standing                                       | Plaza obstacles  |
| --------------- | ------------------------------------------------------------- | ---------------- |
| 1               | 60%, mostly those facing an Avenue or Plaza, or near the Edge | 3                |
| each later Wave | +4%, side streets filling in                                  | +1 every 3 Waves |
| ceiling         | 90%, reached around Wave 9                                    | 7                |

From Wave 3, three standing Blocks Sink and are replaced each Wave, so routes keep changing after density levels off.

## Controls

| Action            | Xbox controller | Keyboard       |
| ----------------- | --------------- | -------------- |
| Steer             | Left stick      | A / D or ← / → |
| Thrust            | RT              | W or ↑         |
| Powerslide (hold) | LT              | Shift          |
| Fire (hold)       | RB or X         | Space          |
| Burst             | A or LB         | E              |
| Switch gun        | Y               | Q              |
| Start / pause     | Menu (Start)    | Enter / Esc    |

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

- A seeded city per Run in one of four Layouts, bounded by the Edge, densifying between Waves.
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
