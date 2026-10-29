# Quantum Breach

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
A held maneuver in which the Ship keeps travelling in a straight line, slowly losing speed, while its Heading turns freely. Thrust does nothing until it ends.
_Avoid_: Drift, strafe mode

**Slide combo**:
The kills made during one Powerslide. Each scores its place in the combo times normal (×1, ×2, ×3…), capped.

**Burst**:
A short forward surge during which the Ship cannot be hurt and passes through Blocks. Limited Charges.
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

**Perch**:
The firing position a Sniper or Artillery holds instead of chasing. Abandoned when the Ship comes close.

**Salvo**:
Three Artillery shells landing in sequence along the Ship's projected path, each marked by a closing circle on the ground. A blast destroys Hunters as well as hurting the Ship.

**Open sky**:
No Block within a couple of cells. Artillery fires only at a Ship under open sky, since tall Blocks block the arc.

**Boxed in**:
The failure state the game is built around: Hunters have closed every exit around a slowed Ship.

### The world

**Arena**:
The bounded square play space. Its outer wall cannot be passed, even during Burst.
_Avoid_: Map, level

**Block**:
A solid rectangular structure covering one or more whole cells of the Arena. Stops Ships, Hunters and shots.
_Avoid_: Wall (reserved for the Arena edge), obstacle, tile

**Density**:
The fraction of building Plots with a standing Block. Rises Wave by Wave to a ceiling.

**Plaza**:
The large open square at the Arena's centre where the Ship starts. Holds only a few low obstacles.
_Avoid_: Arena (the whole play space), centre

**Avenue**:
A wide road framing the Plaza and dividing the rest of the Arena into districts. Never blocked.

**Street**:
A narrower road inside a district. **Alleys** are the narrowest, one cell wide.
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
A Shotgun shot: an arc that sweeps outward from the Ship and destroys every Hunter it reaches.
_Avoid_: Blast (Artillery's word), wave (a Wave is a round of Hunters)

**Shell**:
A shot fired by a Hunter.
_Avoid_: Bullet, projectile (for either, when the owner matters)
