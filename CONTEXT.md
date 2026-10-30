# Ghost Drift

A fast hover vehicle survives endless waves of slower enemies in a blocky simulated arena. Speed is the player's defense: hunters can only kill a ship that stops moving.

## Language

### The player

**Ship**:
The player's hover vehicle. Fast, agile, fragile.
_Avoid_: Player (when meaning the vehicle), craft, tank

**Heading**:
The direction the Ship's nose points. Guns fire along the Heading. Can differ from the direction of travel.
_Avoid_: Facing, rotation

**Hull**:
The Ship's remaining hit points. At zero the run ends.
_Avoid_: Health, HP, shields

**Powerslide**:
A held maneuver in which the Ship keeps traveling in a straight line, slowly losing speed, while its Heading turns freely. Thrust does nothing until it ends.
_Avoid_: Drift, strafe mode

**Multiplier**:
What every kill's score is multiplied by: one more than its **Heat**, with no cap. Every kill the player makes adds Heat, more for each **Style** it shows; Artillery friendly fire adds none. Heat burns off all the time, faster the hotter it runs, and holds between Waves.
_Avoid_: Combo, slide combo

**Style**:
Why a kill heats the Multiplier: **Drift** (the shot left with the nose well off the line of travel, at speed), **Speed** (the shot left with top speed held for a few seconds) and **Chain** (the kill came within a second of the last). Drift and Speed are judged when the shot is fired, not when it lands.

**Ghost**:
The player, as the fiction knows them: the lone pilot defending Arcadia whom nothing can track.
_Avoid_: Hero, player character

**High-score table**:
The ten best finished Runs in this browser, each with three initials, score and Wave.
_Avoid_: Leaderboard (implies online)

**Legend rank**:
The title a Run earns from its score, shown on game over: Rumor, Sighting, The Ghost, Legend, Myth.

**Burst**:
A short forward surge during which the Ship cannot be hurt and passes through buildings, bouncing off the Edge like a billiard ball. Limited Charges.
_Avoid_: Dash, boost, phase

**Charge**:
One use of Burst. The Ship holds at most three; all are restored when a Wave is cleared.

### The opposition

**Hunter**:
Any enemy unit. Slower than the Ship at speed; deadly to a slow one.
_Avoid_: Enemy (in code), mob, tank

**Tank**:
The common Hunter. Out of sight it closes in as a Chaser or a Cutter; once it can see the Ship it circles at Stand-off range and fires Shells at it.

_Avoid_: Barrage, salvo (reserved for Artillery)

**Stand-off**:
The range, about 28 units, at which a Tank that can see the Ship circles instead of closing in.

**Chaser**:
A Tank role that steers toward where the Ship is now.

**Cutter**:
A Tank role that steers toward where the Ship is about to be, to close its escape routes.
_Avoid_: Interceptor, flanker

**Berserker**:
An unarmed Hunter that runs the Ship down, winds up, then lunges in a straight line. Hurts only by ramming.
_Avoid_: Rammer, kamikaze

**Sniper**:
A Hunter that holds a Perch with long sightlines and fires an instant shot at where the Ship will be if it keeps a straight line. Its laser warns of the shot.

**Artillery**:
A Hunter that holds a covered Perch far away and fires Salvos at a Ship under open sky.

**Juggernaut**:
The armored mini-boss. Takes many hits, circles close, and fires Sprays from a slow-turning turret. Arrives in its own Waves.
_Avoid_: Boss, heavy tank

**Armor**:
The damage a Juggernaut can still take. Every other Hunter dies to any hit.
_Avoid_: HP, health

**Spray**:
A Juggernaut's attack: a fan of large Shells fired together after its barrels glow.

**Perch**:
The firing position a Sniper or Artillery holds instead of chasing. Abandoned when the Ship comes close.

**Salvo**:
Three Artillery shells landing in sequence along the Ship's projected path, each marked by a closing circle on the ground. A blast destroys Hunters, or damages a Juggernaut's Armor, as well as hurting the Ship.

**Open sky**:
No Block within a couple of cells. Artillery fires only at a Ship under open sky, since tall Blocks block the arc.

**Boxed in**:
The failure state the game is built around: Hunters have closed every exit around a slowed Ship.

### The world

**Arena**:
The whole play space, bounded by the Edge. Edge Blocks cannot be passed, even during Burst.
_Avoid_: Map, level

**Block**:
A solid rectangular structure covering one or more whole cells of the Arena. Stops Ships, Hunters and shots.
_Avoid_: Wall (reserved for the Arena edge), obstacle, tile

**Density**:
The fraction of building Plots with a standing Block, not counting permanent ones (road walls, Arch towers). Rises Wave by Wave to a ceiling.

**Layout**:
The plan a Run's city follows: Grid, Circuit, Districts, Hub, Raceway, Downtown or Towers. Picked at random each Run.
_Avoid_: Map, level

**Footprint**:
The outline a building covers: a rectangle, or a compound shape such as an L, T, U, cross, Z or stepped corner.

**Arch**:
A bridge between two towers across a road, high enough to fly under. One per city at most. Its towers never Sink.
_Avoid_: Bridge (reads as something to drive over)

**Edge**:
The towers beyond the city's arced outline, where the city has grown too dense to enter. Never Sinks; a Burst bounces off it.
_Avoid_: Wall, border

**Plaza**:
A large open space in the city, holding only a few low obstacles. Some Layouts have several.
_Avoid_: Arena (the whole play space)

**Avenue**:
A wide road a Layout carves through the city, such as a speed lane, loop or spoke. Never blocked.

**Street**:
A narrower road inside a district. **Alleys** are the narrowest, two cells wide.
_Avoid_: Corridor, lane

**Plot**:
A place in the city plan where a Block may stand. The plan is fixed for a Run; Blocks come and go.
_Avoid_: Lot, building site

**Rise** / **Sink**:
A Block appearing on or disappearing from its Plot. Happens only between Waves, after a warning shown during the lull.
_Avoid_: Spawn, despawn, grow

### A run

**Wave**:
A group of Hunters released together. Destroying all of them clears the Wave and starts a short lull before the next.
_Avoid_: Level, round

**Run**:
One play-through from the first Wave to the Ship's destruction. Endless; ends only in defeat.
_Avoid_: Game, session

**Cannon**:
The Ship's rapid-fire gun. Fires Bolts.

**Shotgun**:
The Ship's short-range gun. Fires Pulses.

**Bolt**:
A Cannon shot. Bends slightly toward a Hunter near its line of flight.

**Pulse**:
An arc that sweeps outward from the Ship, rides along with it for a moment, and destroys every Hunter that enters it. Each Shotgun shot fires a long Pulse along the nose and a short one off each side of the line of travel.
_Avoid_: Blast (Artillery's word), wave (a Wave is a round of Hunters)

**Shell**:
A shot fired by a Hunter.
_Avoid_: Bullet, projectile (for either, when the owner matters)
